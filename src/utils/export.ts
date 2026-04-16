import * as XLSX from 'xlsx';
import type { Slot, Cadre, DifficultyLevel } from '../types';
import { DIFFICULTY_LABELS, fullName, totalAstreintes, totalPermanences } from '../types';
import { getAllPeriodScores, type PerPeriodScore } from '../db/periods';
import { getWishesByPeriod } from '../db/wishes';
import { getCadres } from '../db/cadres';

/** Returns the calendar year a period belongs to, using its midpoint date.
 * Robust against semesters that start in late Dec (H1) or end in early Jan (H2). */
function periodYear(ps: PerPeriodScore): string {
  const mid = new Date((new Date(ps.startDate).getTime() + new Date(ps.endDate).getTime()) / 2);
  return String(mid.getFullYear());
}

// ── Comparative-analysis helpers (mirrors EquityRecap logic) ───────────────
type RecoSpec = { key: keyof Cadre; label: string; slotType: 'Astreinte' | 'Permanence'; poolAll: boolean };

const RECO_SPECS: RecoSpec[] = [
  { key: 'astreinteD5',  label: '🎄 Noël',          slotType: 'Astreinte',  poolAll: true  },
  { key: 'astreinteD4',  label: 'D4 (Très diff.)',   slotType: 'Astreinte',  poolAll: false },
  { key: 'astreinteD3',  label: 'D3 (Difficile)',    slotType: 'Astreinte',  poolAll: false },
  { key: 'astreinteD2',  label: 'D2 (Assez diff.)',  slotType: 'Astreinte',  poolAll: false },
  { key: 'astreinteD1',  label: 'D1 (Peu diff.)',    slotType: 'Astreinte',  poolAll: false },
  { key: 'permanenceD5', label: '🎄 Noël',           slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD4', label: 'D4 (Très diff.)',   slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD3', label: 'D3 (Difficile)',    slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD2', label: 'D2 (Assez diff.)',  slotType: 'Permanence', poolAll: true  },
  { key: 'permanenceD1', label: 'D1 (Peu diff.)',    slotType: 'Permanence', poolAll: true  },
];

type RecoItem = { label: string; slotType: string; value: number; avg: number; delta: number; rank: number; poolSize: number };

function recoLevel(delta: number, value: number): 'priority' | 'suggest' | 'normal' | 'above' {
  if (delta <= -0.6) return 'priority';   // significantly behind pool average
  if (value === 0)   return 'suggest';    // not started yet (even if everyone is at 0)
  if (delta >=  0.6) return 'above';
  return 'normal';
}

/** Compute all reco items for a cadre using cumulative counters from the cadres table
 *  (astreinteD1…D5 / permanenceD1…D5 = all published periods + current draft). */
function computeRecoItems(cadre: Cadre, activeCadres: Cadre[]): RecoItem[] {
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');

  const items: RecoItem[] = [];
  for (const spec of RECO_SPECS) {
    const pool = spec.poolAll ? activeCadres : astreinteCadres;
    if (!pool.some(c => c.id === cadre.id)) continue;

    const values = pool.map(c => (c[spec.key] as number) ?? 0).sort((a, b) => a - b);
    const avg = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    const value = (cadre[spec.key] as number) ?? 0;
    const delta = value - avg;
    const rank = values.filter(v => v < value).length + 1;
    items.push({ label: `${spec.slotType} ${spec.label}`, slotType: spec.slotType, value, avg: +avg.toFixed(2), delta: +delta.toFixed(2), rank, poolSize: pool.length });
  }
  return items;
}

/** Build the recommendations section for one cadre's Excel sheet, organised in 3 groups. */
function buildRecoRows(cadre: Cadre, activeCadres: Cadre[]): Record<string, unknown>[] {
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');
  const isInAstrPool = astreinteCadres.some(c => c.id === cadre.id);

  const blank = (): Record<string, unknown> => ({
    'Section': '', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '',
    'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
    'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
  });

  const rows: Record<string, unknown>[] = [];

  rows.push({ ...blank(), 'Section': '═══ ANALYSE COMPARATIVE — CUMUL TOUTES PÉRIODES ═══' });

  // Global summary
  const allAstTotals = astreinteCadres.map(c => totalAstreintes(c)).sort((a, b) => a - b);
  const allPermTotals = activeCadres.map(c => totalPermanences(c)).sort((a, b) => a - b);
  const myAst  = totalAstreintes(cadre);
  const myPerm = totalPermanences(cadre);
  const astAvg  = allAstTotals.reduce((s, v) => s + v, 0)  / (allAstTotals.length  || 1);
  const permAvg = allPermTotals.reduce((s, v) => s + v, 0) / (allPermTotals.length || 1);
  const astRank  = allAstTotals.filter(v => v < myAst).length + 1;
  const permRank = allPermTotals.filter(v => v < myPerm).length + 1;

  if (isInAstrPool) {
    rows.push({
      ...blank(),
      'Section': `Astreintes total cumulé : ${myAst}`,
      'Période': `Rang ${astRank} / ${astreinteCadres.length}`,
      'Astr. Noël': `écart ${myAst - astAvg >= 0 ? '+' : ''}${(myAst - astAvg).toFixed(1)} vs moy.`,
    });
  }
  rows.push({
    ...blank(),
    'Section': `Permanences total cumulé : ${myPerm}`,
    'Période': `Rang ${permRank} / ${activeCadres.length}`,
    'Astr. Noël': `écart ${myPerm - permAvg >= 0 ? '+' : ''}${(myPerm - permAvg).toFixed(1)} vs moy.`,
  });

  // Column header
  rows.push({
    ...blank(),
    'Section': 'Catégorie',
    'Période': 'Type',
    'Astr. Noël': 'Valeur (cumul)',
    'Astr. D4': 'Moy. pool',
    'Astr. D3': 'Écart',
    'Astr. D2': 'Rang',
  });

  // 4 groups
  const allItems = computeRecoItems(cadre, activeCadres);
  const groups: { key: 'priority' | 'suggest' | 'normal' | 'above'; title: string }[] = [
    { key: 'priority', title: '✅ À PRIORISER (en dessous de la moyenne)' },
    { key: 'suggest',  title: '🔵 À DÉMARRER — aucun créneau pris dans cette catégorie' },
    { key: 'normal',   title: '— DANS LA MOYENNE' },
    { key: 'above',    title: '⚠️ AU-DESSUS DE LA MOYENNE' },
  ];

  for (const group of groups) {
    const items = allItems.filter(i => recoLevel(i.delta, i.value) === group.key);
    rows.push({ ...blank(), 'Section': group.title });
    if (items.length === 0) {
      rows.push({ ...blank(), 'Section': '  (aucun)' });
    } else {
      for (const item of items) {
        rows.push({
          ...blank(),
          'Section': `  ${item.label}`,
          'Période': item.slotType,
          'Astr. Noël': item.value,
          'Astr. D4': item.avg,
          'Astr. D3': item.delta,
          'Astr. D2': `${item.rank} / ${item.poolSize}`,
        });
      }
    }
  }

  rows.push({ ...blank(), 'Section': 'Seuil : écart > 0,6 par rapport à la moyenne du pool éligible · 🔵 À démarrer = valeur = 0 (aucun créneau pris dans cette catégorie)' });

  return rows;
}

export async function exportToExcel(slots: Slot[], cadres: Cadre[], periodId?: string) {
  const wb = XLSX.utils.book_new();

  // Fetch fresh cadres to guarantee clean IDs (the `cadres` param coming from
  // Dashboard merges PeriodScore counters via spread, which overwrites cadre.id).
  let rawCadres: Cadre[] = cadres;
  try { rawCadres = await getCadres(); } catch { /* fall back */ }

  // ── Sheet 1: Planning chronologique ──────────────────────────────────────────
  const planningData = slots
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      Date: s.date,
      Type: s.type === 'astreinte' ? 'Astreinte' : 'Permanence',
      'Difficulté': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
      'Niveau': s.difficulty,
      'Assigné à': s.cadreName || 'Non assigné',
      Statut: s.status === 'auto' ? 'Automatique' : 'Manuel',
      'Détail': s.label,
    }));

  const ws1 = XLSX.utils.json_to_sheet(planningData);
  ws1['!cols'] = [
    { width: 12 }, { width: 14 }, { width: 18 }, { width: 8 },
    { width: 20 }, { width: 14 }, { width: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Planning Chronologique');

  // ── Sheet 2: Planning condensé ────────────────────────────────────────────────
  // One row per astreinte week: Semaine | Du (lun.) | Au (dim.) | Astreinte |
  //   Perm. Samedi | Perm. Dimanche | Perm. Jour férié | Note
  {
    const fmtDate = (iso: string) => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };

    // Helper: ISO monday of the week containing a given date string
    const mondayOf = (iso: string): string => {
      const d = new Date(iso + 'T12:00:00');
      const dow = d.getDay(); // 0=Sun … 6=Sat
      d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      return d.toISOString().slice(0, 10);
    };

    const aSlots = slots
      .filter(s => s.type === 'astreinte')
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group permanence slots by their week's Monday
    const permByMonday = new Map<string, Slot[]>();
    for (const s of slots.filter(sl => sl.type === 'permanence')) {
      const mon = mondayOf(s.date);
      const arr = permByMonday.get(mon) ?? [];
      arr.push(s);
      permByMonday.set(mon, arr);
    }

    const condensedRows = aSlots.map((aSlot, idx) => {
      // Sunday = Monday + 6 days
      const monDate = new Date(aSlot.date + 'T12:00:00');
      const sunDate = new Date(monDate);
      sunDate.setDate(sunDate.getDate() + 6);
      const sunIso = sunDate.toISOString().slice(0, 10);

      const weekPerms = permByMonday.get(aSlot.date) ?? [];

      const satSlot  = weekPerms.find(s => new Date(s.date + 'T12:00:00').getDay() === 6);
      const sunSlot  = weekPerms.find(s => new Date(s.date + 'T12:00:00').getDay() === 0);
      // Holiday = permanence on a weekday (Mon–Fri), may be several in a week
      const holSlots = weekPerms.filter(s => {
        const dow = new Date(s.date + 'T12:00:00').getDay();
        return dow !== 0 && dow !== 6;
      });

      // Build a readable note: extract holiday name from label "(Nom du Férié)"
      const holNote = holSlots.map(s => {
        const match = s.label.match(/\(([^)]+)\)/);
        return match ? `${fmtDate(s.date)} — ${match[1]}` : `${fmtDate(s.date)} — ${s.label}`;
      }).join(' ; ');

      // Multiple holiday permanences in one week (rare but possible — e.g. 8 mai + lundi Pentecôte)
      const holNames = holSlots.map(s => s.cadreName || '(non assigné)').join(' / ');

      return {
        'Semaine':               idx + 1,
        'Du':                    fmtDate(aSlot.date),
        'Au':                    fmtDate(sunIso),
        'Astreinte':             aSlot.cadreName || '',
        'Permanence Samedi':     satSlot  ? (satSlot.cadreName  || '(non assigné)') : '',
        'Permanence Dimanche':   sunSlot  ? (sunSlot.cadreName  || '(non assigné)') : '',
        'Permanence Jour férié': holSlots.length > 0 ? holNames : '',
        'Note':                  holNote,
      };
    });

    if (condensedRows.length > 0) {
      const wsC = XLSX.utils.json_to_sheet(condensedRows);
      wsC['!cols'] = [
        { width: 10 }, { width: 13 }, { width: 13 }, { width: 20 },
        { width: 20 }, { width: 22 }, { width: 24 }, { width: 45 },
      ];
      XLSX.utils.book_append_sheet(wb, wsC, 'Planning condensé');
    }
  }

  // ── Sheet 3: Statistiques d'équité ───────────────────────────────────────────
  // Use `cadres` (param) for counters since Dashboard enriches them with period scores,
  // but fall back to rawCadres if needed.
  const statsData = (cadres.length > 0 ? cadres : rawCadres)
    .filter(c => c.active)
    .map(c => ({
      Nom: c.name,
      'Rôle': c.role === 'astreinte' ? 'Astreinte' : c.role === 'permanence' ? 'Permanence' : 'Les deux',
      'Proximité < 30min': c.nearMuseum ? 'Oui' : 'Non',
      'Astr. Noël (D5)': c.astreinteD5,
      'Astr. D4 (Très diff.)': c.astreinteD4,
      'Astr. D3 (Difficile)': c.astreinteD3,
      'Astr. D2 (Assez diff.)': c.astreinteD2,
      'Astr. D1 (Peu diff.)': c.astreinteD1,
      'Astr. Total': totalAstreintes(c),
      'Perm. Noël (D5)': c.permanenceD5,
      'Perm. D4 (Très diff.)': c.permanenceD4,
      'Perm. D3 (Difficile)': c.permanenceD3,
      'Perm. D2 (Assez diff.)': c.permanenceD2,
      'Perm. D1 (Peu diff.)': c.permanenceD1,
      'Perm. Total': totalPermanences(c),
    }))
    .sort((a, b) => (b['Astr. Total'] + b['Perm. Total']) - (a['Astr. Total'] + a['Perm. Total']));

  const ws2 = XLSX.utils.json_to_sheet(statsData);
  ws2['!cols'] = [
    { width: 20 }, { width: 14 }, { width: 18 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Statistiques d'Équité");

  // ── Sheet 4: Vœux par créneau ────────────────────────────────────────────────
  if (periodId) {
    let wishMap: Map<string, string[]> = new Map();
    try {
      wishMap = await getWishesByPeriod(periodId);
    } catch {
      // non-blocking
    }

    const cadreById = new Map(rawCadres.map(c => [c.id!, fullName(c)]));

    const wishesData = slots
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => {
        const cadreIds = wishMap.get(s.id!) ?? [];
        const names = cadreIds.map(id => cadreById.get(id) ?? id).join(', ');
        return {
          'Date': s.date,
          'Type': s.type === 'astreinte' ? 'Astreinte' : 'Permanence',
          'Difficulté': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
          'Détail': s.label,
          'Assigné à': s.cadreName || 'Non assigné',
          'Nb vœux': cadreIds.length,
          'Cadres volontaires': names || '—',
        };
      });

    if (wishesData.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(wishesData);
      ws3['!cols'] = [
        { width: 12 }, { width: 14 }, { width: 18 }, { width: 40 },
        { width: 20 }, { width: 10 }, { width: 60 },
      ];
      XLSX.utils.book_append_sheet(wb, ws3, 'Vœux');
    }
  }

  // ── Fetch historical period scores ────────────────────────────────────────────
  let allPeriodScores: PerPeriodScore[] = [];
  try {
    allPeriodScores = await getAllPeriodScores();
  } catch {
    // non-blocking — historical data will just be absent
  }

  // Group by cadreId
  const scoresByCadre = new Map<string, PerPeriodScore[]>();
  for (const ps of allPeriodScores) {
    const arr = scoresByCadre.get(ps.cadreId) ?? [];
    arr.push(ps);
    scoresByCadre.set(ps.cadreId, arr);
  }

  // ── Per-cadre sheets ──────────────────────────────────────────────────────────
  const activeCadres = rawCadres.filter(c => c.active);

  for (const cadre of activeCadres) {
    const cadreSlots = slots
      .filter(s => s.cadreId === cadre.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    const periodScores = (scoresByCadre.get(cadre.id!) ?? []).sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );

    const sheetData: Record<string, unknown>[] = [];

    // ── Section 1: Historique des compteurs par période ──────────────────────
    sheetData.push({
      'Section': '═══ HISTORIQUE DES COMPTEURS PAR PÉRIODE ═══',
      'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
      'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
    });

    // Header row
    sheetData.push({
      'Section': 'Période',
      'Période': '',
      'Astr. Noël': 'Astr. Noël (D5)',
      'Astr. D4': 'Astr. D4',
      'Astr. D3': 'Astr. D3',
      'Astr. D2': 'Astr. D2',
      'Astr. D1': 'Astr. D1',
      'Astr. Total': 'Astr. Total',
      'Perm. Noël': 'Perm. Noël (D5)',
      'Perm. D4': 'Perm. D4',
      'Perm. D3': 'Perm. D3',
      'Perm. D2': 'Perm. D2',
      'Perm. D1': 'Perm. D1',
      'Perm. Total': 'Perm. Total',
    });

    // Group periods by end year (a semester starting Dec 29, 2025 belongs to 2026)
    const byYear = new Map<string, typeof periodScores>();
    for (const ps of periodScores) {
      const yr = periodYear(ps);
      const arr = byYear.get(yr) ?? [];
      arr.push(ps);
      byYear.set(yr, arr);
    }

    let cumA5 = 0, cumA4 = 0, cumA3 = 0, cumA2 = 0, cumA1 = 0;
    let cumP5 = 0, cumP4 = 0, cumP3 = 0, cumP2 = 0, cumP1 = 0;

    for (const [year, yearScores] of [...byYear.entries()].sort()) {
      let yrA5=0,yrA4=0,yrA3=0,yrA2=0,yrA1=0;
      let yrP5=0,yrP4=0,yrP3=0,yrP2=0,yrP1=0;

      for (const ps of yearScores) {
        cumA5 += ps.astreinteD5; cumA4 += ps.astreinteD4; cumA3 += ps.astreinteD3;
        cumA2 += ps.astreinteD2; cumA1 += ps.astreinteD1;
        cumP5 += ps.permanenceD5; cumP4 += ps.permanenceD4; cumP3 += ps.permanenceD3;
        cumP2 += ps.permanenceD2; cumP1 += ps.permanenceD1;
        yrA5 += ps.astreinteD5; yrA4 += ps.astreinteD4; yrA3 += ps.astreinteD3;
        yrA2 += ps.astreinteD2; yrA1 += ps.astreinteD1;
        yrP5 += ps.permanenceD5; yrP4 += ps.permanenceD4; yrP3 += ps.permanenceD3;
        yrP2 += ps.permanenceD2; yrP1 += ps.permanenceD1;

        sheetData.push({
          'Section': ps.periodLabel + (ps.periodStatus === 'draft' ? ' (en cours)' : ''),
          'Période': '',
          'Astr. Noël': ps.astreinteD5,
          'Astr. D4': ps.astreinteD4,
          'Astr. D3': ps.astreinteD3,
          'Astr. D2': ps.astreinteD2,
          'Astr. D1': ps.astreinteD1,
          'Astr. Total': ps.astreinteD5 + ps.astreinteD4 + ps.astreinteD3 + ps.astreinteD2 + ps.astreinteD1,
          'Perm. Noël': ps.permanenceD5,
          'Perm. D4': ps.permanenceD4,
          'Perm. D3': ps.permanenceD3,
          'Perm. D2': ps.permanenceD2,
          'Perm. D1': ps.permanenceD1,
          'Perm. Total': ps.permanenceD5 + ps.permanenceD4 + ps.permanenceD3 + ps.permanenceD2 + ps.permanenceD1,
        });
      }

      // Year subtotal
      sheetData.push({
        'Section': `── Total ${year}`,
        'Période': '',
        'Astr. Noël': yrA5, 'Astr. D4': yrA4, 'Astr. D3': yrA3, 'Astr. D2': yrA2, 'Astr. D1': yrA1,
        'Astr. Total': yrA5+yrA4+yrA3+yrA2+yrA1,
        'Perm. Noël': yrP5, 'Perm. D4': yrP4, 'Perm. D3': yrP3, 'Perm. D2': yrP2, 'Perm. D1': yrP1,
        'Perm. Total': yrP5+yrP4+yrP3+yrP2+yrP1,
      });
    }

    // Cumulative row
    sheetData.push({
      'Section': 'TOTAL CUMULÉ',
      'Période': '',
      'Astr. Noël': cumA5,
      'Astr. D4': cumA4,
      'Astr. D3': cumA3,
      'Astr. D2': cumA2,
      'Astr. D1': cumA1,
      'Astr. Total': cumA5 + cumA4 + cumA3 + cumA2 + cumA1,
      'Perm. Noël': cumP5,
      'Perm. D4': cumP4,
      'Perm. D3': cumP3,
      'Perm. D2': cumP2,
      'Perm. D1': cumP1,
      'Perm. Total': cumP5 + cumP4 + cumP3 + cumP2 + cumP1,
    });

    // Blank separator
    sheetData.push({
      'Section': '', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '',
      'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
      'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
    });

    // ── Section 2: Analyse comparative ──────────────────────────────────────
    for (const row of buildRecoRows(cadre, activeCadres)) {
      sheetData.push(row);
    }

    // Blank separator
    sheetData.push({
      'Section': '', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '',
      'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
      'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
    });

    // ── Section 3: Slots du planning courant ─────────────────────────────────
    if (cadreSlots.length > 0) {
      sheetData.push({
        'Section': '═══ CRÉNEAUX ASSIGNÉS ═══',
        'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
        'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
      });

      const astreinteSlots = cadreSlots.filter(s => s.type === 'astreinte');
      const permanenceSlots = cadreSlots.filter(s => s.type === 'permanence');

      if (astreinteSlots.length > 0) {
        sheetData.push({ 'Section': '-- ASTREINTES --', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '', 'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '' });
        for (const s of astreinteSlots) {
          sheetData.push({
            'Section': s.date,
            'Période': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
            'Astr. Noël': s.difficulty,
            'Astr. D4': s.label,
            'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
            'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
          });
        }
      }

      if (permanenceSlots.length > 0) {
        sheetData.push({ 'Section': '-- PERMANENCES --', 'Période': '', 'Astr. Noël': '', 'Astr. D4': '', 'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '', 'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '' });
        for (const s of permanenceSlots) {
          sheetData.push({
            'Section': s.date,
            'Période': DIFFICULTY_LABELS[s.difficulty as DifficultyLevel],
            'Astr. Noël': s.difficulty,
            'Astr. D4': s.label,
            'Astr. D3': '', 'Astr. D2': '', 'Astr. D1': '', 'Astr. Total': '',
            'Perm. Noël': '', 'Perm. D4': '', 'Perm. D3': '', 'Perm. D2': '', 'Perm. D1': '', 'Perm. Total': '',
          });
        }
      }
    }

    if (sheetData.length === 0) continue;

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { width: 28 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 14 }, { width: 14 }, { width: 12 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
    ];

    const cadreFullName = cadre.prenom ? `${cadre.prenom} ${cadre.name}` : cadre.name;
    const sheetName = cadreFullName.substring(0, 31).replace(/[\\/*?[\]:]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // ── Sheet: Résumé annuel ──────────────────────────────────────────────────
  if (allPeriodScores.length > 0) {
    // Group by end year (same logic as EquityRecap)
    const allYears = [...new Set(allPeriodScores.map(ps => periodYear(ps)))].sort();

    const annualData = rawCadres.filter(c => c.active).map(c => {
      const row: Record<string, unknown> = { 'Cadre': fullName(c) };
      let totalAst = 0, totalPerm = 0;
      for (const yr of allYears) {
        const yearScores = allPeriodScores.filter(ps => ps.cadreId === c.id! && periodYear(ps) === yr);
        const hasDraft = yearScores.some(ps => ps.periodStatus === 'draft');
        const label = hasDraft ? `${yr} (en cours)` : yr;
        const ast = yearScores.reduce((s, ps) => s + ps.astreinteD1 + ps.astreinteD2 + ps.astreinteD3 + ps.astreinteD4 + ps.astreinteD5, 0);
        const perm = yearScores.reduce((s, ps) => s + ps.permanenceD1 + ps.permanenceD2 + ps.permanenceD3 + ps.permanenceD4 + ps.permanenceD5, 0);
        row[`${label} — Ast.`] = ast || 0;
        row[`${label} — Perm.`] = perm || 0;
        totalAst += ast;
        totalPerm += perm;
      }
      row['Cumul Ast.'] = totalAst;
      row['Cumul Perm.'] = totalPerm;
      return row;
    }).sort((a, b) => ((b['Cumul Ast.'] as number) + (b['Cumul Perm.'] as number)) - ((a['Cumul Ast.'] as number) + (a['Cumul Perm.'] as number)));

    const wsAnnual = XLSX.utils.json_to_sheet(annualData);
    const numCols = 1 + allYears.length * 2 + 2;
    wsAnnual['!cols'] = [{ width: 22 }, ...Array(numCols - 1).fill({ width: 16 })];
    XLSX.utils.book_append_sheet(wb, wsAnnual, 'Résumé annuel');
  }

  XLSX.writeFile(wb, 'planning-astreintes-permanences.xlsx');
}
