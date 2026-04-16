# Planning Astreintes MDC — Guide Claude

## Contexte métier

Outil de planification des cadres d'un musée sur des cycles semestriels.
Basé sur un système d'**équité pluri-annuelle** : les créneaux difficiles (Noël, 15 août, vacances scolaires) sont répartis équitablement grâce à un scoring cumulatif.

**Déploiement** : VM dans l'infra du musée, accès réseau intranet, mono-poste mono-utilisateur.
Pas d'enjeu de confidentialité critique — le login est intentionnellement simple (hardcodé).
Les données sont sauvegardées via le backup quotidien de la VM.

---

## Architecture

```
planning-astreintes-mdc-main/
├── server/                     # Backend Express + SQLite
│   ├── index.ts                # Point d'entrée Express (port 3001)
│   ├── tsconfig.json
│   ├── db/
│   │   ├── client.ts           # Singleton better-sqlite3, crée le schéma au démarrage
│   │   └── mappers.ts          # TOUS les mappeurs snake_case ↔ camelCase (source unique)
│   └── routes/
│       ├── cadres.ts
│       ├── slots.ts            # Inclut PATCH /:id/with-scores (transaction atomique)
│       ├── periods.ts
│       ├── scores.ts
│       ├── vacations.ts
│       ├── closedDays.ts
│       └── config.ts           # POST /init seed les données par défaut
├── data/
│   └── planning.db             # Fichier SQLite (gitignore, créé au 1er lancement)
└── src/                        # Frontend React + TypeScript + Vite
    ├── db/                     # Couche fetch — wrappeurs REST, signatures identiques à avant
    │   ├── cadres.ts
    │   ├── slots.ts            # Exporte aussi updateSlotWithScores()
    │   ├── periods.ts
    │   └── config.ts           # getVacations, addVacation, getClosedDays, etc.
    ├── components/
    │   ├── CalendarGrid.tsx
    │   ├── SlotModal.tsx       # Édition manuelle d'un slot (appelle with-scores)
    │   ├── EquityChart.tsx
    │   ├── DifficultyBadge.tsx
    │   ├── Layout.tsx
    │   └── PeriodSelector.tsx
    ├── context/
    │   └── PeriodContext.tsx   # État global de la période active (ref pattern anti-boucle)
    ├── pages/
    │   ├── Dashboard.tsx       # KPIs + graphique d'équité
    │   ├── CalendarView.tsx    # Vue mensuelle avec SlotModal
    │   ├── ListView.tsx        # Vue liste filtrable
    │   ├── CadreManagement.tsx # CRUD cadres
    │   ├── GeneratePlanning.tsx# Workflow 3 étapes : générer → assigner → publier
    │   ├── Settings.tsx        # Vacances scolaires + jours fermés
    │   └── LoginPage.tsx       # Auth hardcodée (intentionnel)
    ├── utils/
    │   ├── algorithm.ts        # Moteur d'assignation (3 passes décomposées)
    │   ├── holidays.ts         # Jours fériés français (Computus pour Pâques)
    │   ├── fetchHolidays.ts    # API data.education.gouv.fr
    │   └── export.ts           # Export Excel multi-feuilles (XLSX)
    └── types/index.ts          # Tous les types TypeScript partagés
```

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18, TypeScript, Vite |
| Style | Tailwind CSS, Lucide React, Recharts |
| Routage | React Router DOM v7 |
| Backend | Express.js (TypeScript via tsx) |
| Base de données | SQLite (better-sqlite3) |
| Dates | date-fns v4 + locale `fr` |
| Export | XLSX |
| Dev runner | concurrently (Vite + Express en parallèle) |

**Supprimés** lors de la migration : `@supabase/supabase-js`, `dexie`, `dexie-react-hooks`.

---

## Commandes

```bash
# Développement (Vite :5173 + Express :3001 en parallèle)
npm run dev

# Build frontend uniquement
npm run build

# Production (Express sert le build statique, un seul process)
npm run build && npm run start

# Typecheck frontend
npm run typecheck

# Typecheck backend
npx tsc --noEmit -p server/tsconfig.json
```

---

## Base de données SQLite

**Fichier** : `data/planning.db` (créé automatiquement au premier lancement du serveur).

### Tables

```
cadres             — agents (nom, role, distance_moins_30min, score_astreinte, score_permanence, actif)
planning_periods   — semestres (label, start_date, end_date, status: draft|published, zone: A|B|C)
slots              — créneaux (date, type: Astreinte|Permanence, difficulte 1-4, cadre_id FK, period_id FK)
period_scores      — scores par cadre par période publiée (UNIQUE cadre_id+period_id)
vacations          — périodes de vacances scolaires (importées via API ou saisie manuelle)
closed_days        — jours de fermeture du musée
app_config         — config clé/valeur (ex: initialized, zone)
```

### Contraintes importantes
- `slots.period_id` → CASCADE DELETE sur `planning_periods`
- `period_scores` → CASCADE DELETE sur `cadres` et `planning_periods`
- Foreign keys activées via `PRAGMA foreign_keys = ON`
- WAL activé pour les performances

---

## API REST

Toutes les routes sont préfixées `/api`. Le frontend Vite proxifie `/api` → `http://localhost:3001` en dev.

| Préfixe | Ressource |
|---------|-----------|
| `/api/cadres` | CRUD cadres + POST `/reset-scores` |
| `/api/slots` | Batch insert, PATCH par id, PATCH `/:id/with-scores`, DELETE par periodId |
| `/api/periods` | CRUD périodes + PATCH `/:id/status` |
| `/api/scores` | GET cumulatif, PUT upsert, POST recalculate, DELETE par periodId |
| `/api/vacations` | GET/POST/DELETE |
| `/api/closed-days` | GET/POST/DELETE |
| `/api/config` | GET/PUT par clé + POST `/init` (seed initial) |

### Endpoint clé : `PATCH /api/slots/:id/with-scores`

Gère en une **transaction SQLite atomique** les 3 cas d'édition manuelle d'un slot :
1. Ancien cadre différent du nouveau → soustrait le score à l'ancien
2. Nouveau cadre différent de l'ancien → ajoute le score au nouveau
3. Même cadre mais difficulté changée → applique le delta

Met à jour à la fois `period_scores` ET `cadres` (score global).

---

## Algorithme d'équité (`src/utils/algorithm.ts`)

`autoAssignSlots()` orchestre 3 passes distinctes :

1. **`assignAstreinteSlots()`** — Attribue chaque semaine d'astreinte au cadre éligible avec le score cumulatif le plus bas. Hors période de Noël, seuls les cadres à moins de 30 min sont éligibles.

2. **`pairAstreinteWithWeekend()`** — Pour chaque cadre en astreinte, lui attribue un slot de permanence le week-end de sa semaine (alternance samedi/dimanche une semaine sur deux).

3. **`assignRemainingPermanence()`** — Distribue les permanences restantes en évitant les jours consécutifs et les conflits avec les semaines d'astreinte.

Les scores sont stockés dans des `Map` locales pendant l'algorithme (non persistées avant la fin).

---

## Logique de scoring

| Niveau | Points | Exemples |
|--------|--------|---------|
| Très Difficile | 4 | Noël, 15 août, milieu de vacances |
| Difficile | 3 | Début/fin de vacances |
| Assez Difficile | 2 | Ponts, fériés, fin juillet |
| Peu Difficile | 1 | Week-ends et semaines classiques |

**Cycle de vie des scores** :
- Pendant un brouillon : `cadres.score_*` = scores publiés cumulés + scores du brouillon courant
- À la publication : `recalculateCadreGlobalScores()` recalcule les scores globaux depuis toutes les `period_scores` publiées (garantit la cohérence)
- Réinitialisation manuelle possible tous les ~4 ans via Paramètres

---

## Points d'attention

### PeriodContext — pattern anti-boucle
`refreshPeriods` utilise un `useRef` pour lire `activePeriodId` sans en dépendre. Ne pas remettre `activePeriodId` dans le tableau de deps du `useCallback`, sinon boucle infinie (chaque refresh → setActivePeriodId → nouveau callback → nouveau effet → refresh...).

### Mappeurs centralisés
**Toujours** modifier les transformeurs dans `server/db/mappers.ts` uniquement. Ne pas re-définir de `toApp()` localement dans les routes.

### Dates de vacances scolaires
L'API `data.education.gouv.fr` retourne les dates en UTC représentant minuit heure de Paris. Le `+1` dans `formatDate()` (fichier `fetchHolidays.ts`) est intentionnel et correct — ne pas le supprimer.

### Authentification
Login hardcodé dans `LoginPage.tsx` — c'est voulu. Pas besoin de sécuriser davantage (accès intranet VM uniquement, pas de données confidentielles).

### Validation
- Frontend : `start >= end` bloqué avant l'appel API dans `GeneratePlanning.tsx` et `Settings.tsx`
- Serveur : même validation avec HTTP 400 dans `routes/periods.ts` et `routes/vacations.ts`

---

## Tâches restantes identifiées (non traitées)

- Tests unitaires pour `algorithm.ts` et `holidays.ts`
- Optimistic updates dans `SlotModal` (UI qui se met à jour avant la réponse serveur)
- Avertissement UI avant suppression d'un cadre qui a des slots assignés
- Chunking du bundle JS (warning Vite > 500 kB — non bloquant)
