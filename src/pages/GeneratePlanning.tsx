import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getVacations, getClosedDays } from '../db/config';
import { getCadres, updateCadre } from '../db/cadres';
import { getSlotsByPeriod, addSlots, deleteSlotsByPeriod, countSlotsByPeriod, updateSlot, clearAssignmentsByPeriod } from '../db/slots';
import { createPeriod, updatePeriodStatus, deletePeriod, upsertPeriodScores, getCumulativeScoresBefore, deletePeriodScores, recalculateCadreGlobalScores, resyncPeriodScores } from '../db/periods';
import { getWishesByPeriod } from '../db/wishes';
import { usePeriod } from '../context/PeriodContext';
import {
  generateAstreinteSlots,
  generatePermanenceSlots,
  autoAssignSlots,
  type PassOptions,
} from '../utils/algorithm';
import type { Cadre, Slot, VacationPeriod, ClosedDay } from '../types';
import { ZERO_COUNTERS } from '../types';
import {
  Sparkles, Zap, Trash2, CheckCircle, AlertCircle, Info,
  Plus, Lock, Unlock, AlertTriangle, UserX,
} from 'lucide-react';

export default function GeneratePlanning() {
  const { activePeriod, setActivePeriodId, refreshPeriods } = usePeriod();
  const [vacations, setVacations] = useState<VacationPeriod[] | null>(null);
  const [closedDays, setClosedDays] = useState<ClosedDay[] | null>(null);

  useEffect(() => {
    getVacations().then(setVacations).catch(() => setVacations([]));
    getClosedDays().then(setClosedDays).catch(() => setClosedDays([]));
  }, []);

  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [slotCount, setSlotCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  // Which pass is currently running — null means idle
  const [assigning, setAssigning] = useState<'astreintes' | 'weekends' | 'permanences' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishStats, setPublishStats] = useState<{ total: number; assigned: number; unassigned: number } | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodZone, setNewPeriodZone] = useState('C');

  useEffect(() => {
    getCadres().then(setCadres).catch(() => setCadres([]));
  }, []);

  useEffect(() => {
    if (activePeriod?.id) {
      countSlotsByPeriod(activePeriod.id).then(setSlotCount).catch(() => setSlotCount(0));
    } else {
      setSlotCount(0);
    }
  }, [activePeriod]);

  const activeCadres = cadres.filter(c => c.active);
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');
  const permanenceCadres = activeCadres.filter(c => c.role === 'permanence' || c.role === 'both');

  function buildLabel(start: string, end: string): string {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(format(parseISO(start), 'MMMM', { locale: fr }))} - ${cap(format(parseISO(end), 'MMMM yyyy', { locale: fr }))}`;
  }

  function getErrorMessage(err: unknown): string {
    return err instanceof Error && err.message ? err.message : 'Erreur inconnue';
  }

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!newPeriodStart || !newPeriodEnd) return;
    if (newPeriodStart >= newPeriodEnd) {
      setMessage({ type: 'error', text: 'La date de debut doit etre anterieure a la date de fin.' });
      return;
    }
    try {
      const newPeriod = await createPeriod({
        label: buildLabel(newPeriodStart, newPeriodEnd),
        startDate: newPeriodStart,
        endDate: newPeriodEnd,
        status: 'draft',
        zone: newPeriodZone,
      });
      // Explicitly switch to the new period before refreshing so that
      // sessionStorage is up to date when refreshPeriods reads it.
      if (newPeriod.id) setActivePeriodId(newPeriod.id);
      await refreshPeriods();
      setShowCreateForm(false);
      setNewPeriodStart('');
      setNewPeriodEnd('');
      setMessage({ type: 'success', text: 'Nouvelle periode creee.' });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors de la creation de la periode : ${getErrorMessage(err)}` });
    }
  }

  async function handleGenerate() {
    if (!activePeriod?.id || !vacations || !closedDays) return;
    setGenerating(true);
    setMessage(null);
    try {
      const astreinteSlots = generateAstreinteSlots(
        activePeriod.startDate,
        activePeriod.endDate,
        vacations,
        closedDays,
        activePeriod.zone
      );
      const permanenceSlots = generatePermanenceSlots(
        activePeriod.startDate,
        activePeriod.endDate,
        vacations,
        closedDays,
        activePeriod.zone
      );

      // Clear slots (wishes cascade-delete automatically via FK)
      await deleteSlotsByPeriod(activePeriod.id);

      const allSlots = [...astreinteSlots, ...permanenceSlots].map(s => ({
        ...s,
        periodId: activePeriod.id!,
      }));
      await addSlots(allSlots);

      const count = await countSlotsByPeriod(activePeriod.id);
      setSlotCount(count);

      setMessage({
        type: 'success',
        text: `${astreinteSlots.length} astreintes et ${permanenceSlots.length} permanences generees.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors de la generation des creneaux : ${getErrorMessage(err)}` });
    }
    setGenerating(false);
  }

  /**
   * Core assignment engine.
   * @param passKey   Identifies which button was clicked (for loading state).
   * @param passes    Which algorithm passes to run.
   * @param clearType Which already-auto-assigned slots to wipe before running:
   *   'astreinte' | 'permanence' | 'both' | 'none'
   * @param phaseLabel Human-readable label for success/error messages.
   */
  async function handleAutoAssign(
    passKey: 'astreintes' | 'weekends' | 'permanences',
    passes: PassOptions,
    clearType: 'astreinte' | 'permanence' | 'both' | 'none',
    phaseLabel: string,
  ) {
    if (!activePeriod?.id || !vacations) return;
    setMessage(null);
    let step = 'chargement des creneaux et des voeux';

    try {
      // ── Fetch slots + wishes first so we can validate before showing spinner ──
      const [periodSlots, wishes] = await Promise.all([
        getSlotsByPeriod(activePeriod.id),
        getWishesByPeriod(activePeriod.id),
      ]);

      // ── Pre-validation : vœux requis pour le type de créneau concerné ────────
      const noWishesAtAll = wishes.size === 0;
      const astreinteSlots = periodSlots.filter(s => s.type === 'astreinte');
      const permanenceSlots = periodSlots.filter(s => s.type === 'permanence');
      const hasAstreinteWishes = astreinteSlots.some(s => s.id && wishes.has(s.id));
      const hasPermanenceWishes = permanenceSlots.some(s => s.id && wishes.has(s.id));

      if (noWishesAtAll) {
        setMessage({
          type: 'info',
          text: `Aucun vœu saisi pour cette période. Rendez-vous sur la page « Vœux » et demandez aux cadres de se positionner sur les créneaux avant de lancer la répartition.`,
        });
        return;
      }

      if (passKey === 'astreintes' && !hasAstreinteWishes) {
        setMessage({
          type: 'info',
          text: `Aucun vœu saisi sur les créneaux d'astreinte. Rendez-vous sur la page « Vœux » pour indiquer sur quelles semaines d'astreinte chaque cadre est disponible, puis relancez cette phase.`,
        });
        return;
      }

      if ((passKey === 'weekends' || passKey === 'permanences') && !hasPermanenceWishes) {
        const label = passKey === 'weekends'
          ? `La phase « Week-ends » attribue le samedi/dimanche au cadre d'astreinte, mais en se basant uniquement sur les vœux de permanence.`
          : `La phase « Permanences restantes » distribue les créneaux de permanence selon les vœux.`;
        setMessage({
          type: 'info',
          text: `Aucun vœu saisi sur les créneaux de permanence. ${label} Rendez-vous sur la page « Vœux » pour saisir les disponibilités sur les permanences, puis relancez cette phase.`,
        });
        return;
      }

      // ── Validation OK — on démarre l'assignation ──────────────────────────────
      setAssigning(passKey);

      step = 'chargement des cadres';
      const freshCadres = await getCadres();
      const active = freshCadres.filter(c => c.active);

      step = 'recuperation des scores cumulatifs';
      const cumulativeScores = await getCumulativeScoresBefore(activePeriod.id);

      const baseCadres: Cadre[] = active.map(c => ({
        ...c,
        ...(cumulativeScores.get(c.id!) ?? ZERO_COUNTERS),
      }));

      // Clear the relevant auto-assigned slots before running, while preserving
      // manual assignments and slots belonging to the other type.
      const clearedSlots: Slot[] = periodSlots.map(s => {
        if (s.status === 'manual') return s;
        const shouldClear =
          clearType === 'both' ||
          (clearType === 'astreinte'  && s.type === 'astreinte') ||
          (clearType === 'permanence' && s.type === 'permanence');
        return shouldClear
          ? { ...s, cadreId: null, cadreName: '', status: 'auto' as const }
          : s;
      });

      const assigned = autoAssignSlots(
        clearedSlots, baseCadres, vacations, activePeriod.zone, wishes, passes,
        activePeriod.startDate, activePeriod.endDate,
      );

      step = 'sauvegarde des assignations';
      for (const slot of assigned) {
        if (slot.id && slot.status !== 'manual') {
          await updateSlot(slot.id, { cadreId: slot.cadreId, status: slot.status });
        }
      }

      // Recompute period scores from the full picture of assigned slots.
      const periodAMap = new Map<string, number[]>();
      const periodPMap = new Map<string, number[]>();
      for (const slot of assigned) {
        if (slot.cadreId) {
          const map = slot.type === 'astreinte' ? periodAMap : periodPMap;
          const arr = map.get(slot.cadreId) ?? [0, 0, 0, 0, 0];
          arr[slot.difficulty - 1]++;
          map.set(slot.cadreId, arr);
        }
      }

      step = 'mise a jour des scores';
      const scoreEntries = active.map(c => {
        const pA = periodAMap.get(c.id!) ?? [0, 0, 0, 0, 0];
        const pP = periodPMap.get(c.id!) ?? [0, 0, 0, 0, 0];
        return {
          cadreId: c.id!,
          astreinteD1: pA[0], astreinteD2: pA[1], astreinteD3: pA[2], astreinteD4: pA[3], astreinteD5: pA[4],
          permanenceD1: pP[0], permanenceD2: pP[1], permanenceD3: pP[2], permanenceD4: pP[3], permanenceD5: pP[4],
        };
      });
      await upsertPeriodScores(activePeriod.id, scoreEntries);

      for (const c of active) {
        const cum = cumulativeScores.get(c.id!) ?? ZERO_COUNTERS;
        const pA = periodAMap.get(c.id!) ?? [0, 0, 0, 0, 0];
        const pP = periodPMap.get(c.id!) ?? [0, 0, 0, 0, 0];
        await updateCadre(c.id!, {
          astreinteD1: cum.astreinteD1 + pA[0],
          astreinteD2: cum.astreinteD2 + pA[1],
          astreinteD3: cum.astreinteD3 + pA[2],
          astreinteD4: cum.astreinteD4 + pA[3],
          astreinteD5: cum.astreinteD5 + pA[4],
          permanenceD1: cum.permanenceD1 + pP[0],
          permanenceD2: cum.permanenceD2 + pP[1],
          permanenceD3: cum.permanenceD3 + pP[2],
          permanenceD4: cum.permanenceD4 + pP[3],
          permanenceD5: cum.permanenceD5 + pP[4],
        });
      }

      setCadres(await getCadres());

      const assignedCount = assigned.filter(s => s.cadreId).length;
      const total = assigned.length;
      const unassigned = total - assignedCount;
      setMessage({
        type: unassigned > 0 ? 'info' : 'success',
        text: `${phaseLabel} : ${assignedCount} creneaux assignes sur ${total}${
          unassigned > 0 ? ` — ${unassigned} sans volontaire` : ''
        }.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur (${phaseLabel}, etape ${step}) : ${getErrorMessage(err)}` });
    }
    setAssigning(null);
  }

  // ── 3 named handlers — one per algorithm pass ────────────────────────────

  /** Pass 1 : efface les astreintes auto puis les réassigne. */
  function handleAssignAstreintes() {
    return handleAutoAssign(
      'astreintes',
      { astreintes: true, weekends: false, permanences: false },
      'astreinte',
      'Phase 1 — Astreintes',
    );
  }

  /** Pass 2 : efface les permanences auto puis assigne le week-end de chaque semaine d'astreinte. */
  function handleAssignWeekends() {
    return handleAutoAssign(
      'weekends',
      { astreintes: false, weekends: true, permanences: false },
      'permanence',
      'Phase 2 — Week-ends astreinte',
    );
  }

  /** Pass 3 : remplit les permanences restantes sans effacer les assignations existantes. */
  function handleAssignPermanences() {
    return handleAutoAssign(
      'permanences',
      { astreintes: false, weekends: false, permanences: true },
      'none',
      'Phase 3 — Permanences restantes',
    );
  }

  async function handlePublishClick() {
    if (!activePeriod?.id || slotCount === 0) return;
    const slots = await getSlotsByPeriod(activePeriod.id);
    const assigned = slots.filter(s => s.cadreId).length;
    setPublishStats({ total: slots.length, assigned, unassigned: slots.length - assigned });
    setShowPublishDialog(true);
  }

  async function handlePublish() {
    if (!activePeriod?.id) return;
    setShowPublishDialog(false);
    try {
      await updatePeriodStatus(activePeriod.id, 'published');
      // Recalculate global cadre scores from all published period_scores to
      // ensure consistency (guards against any drift from manual slot edits).
      await recalculateCadreGlobalScores();
      await refreshPeriods();
      setMessage({ type: 'success', text: 'Periode publiee. Les scores sont figes.' });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors de la publication : ${getErrorMessage(err)}` });
    }
  }

  async function handleReopen() {
    if (!activePeriod?.id) return;
    if (!confirm('Rouvrir cette periode ? Les scores pourront etre modifies. Attention : cela peut impacter les periodes suivantes.')) return;
    try {
      await updatePeriodStatus(activePeriod.id, 'draft');
      await refreshPeriods();
      setMessage({
        type: 'info',
        text: 'Periode rouverte. Pensez a recalculer les scores des periodes suivantes apres vos modifications.',
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors de la reouverture : ${getErrorMessage(err)}` });
    }
  }

  async function handleDeletePeriod() {
    if (!activePeriod?.id) return;
    if (!confirm('Supprimer cette periode et tous ses creneaux ? Cette action est irreversible.')) return;
    let step = 'suppression des scores';
    try {
      await deletePeriodScores(activePeriod.id);
      step = 'suppression des creneaux';
      await deleteSlotsByPeriod(activePeriod.id);
      step = 'suppression de la periode';
      await deletePeriod(activePeriod.id);
      await refreshPeriods();
      setSlotCount(0);
      setMessage({ type: 'info', text: 'Periode supprimee.' });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors de la ${step} : ${getErrorMessage(err)}` });
    }
  }

  async function handleResyncScores() {
    if (!activePeriod?.id) return;
    try {
      await resyncPeriodScores(activePeriod.id);
      setCadres(await getCadres());
      setMessage({ type: 'success', text: 'Scores recalculés depuis les assignations réelles. Rechargez la page Récap Équité pour voir les nouvelles valeurs.' });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors du recalcul : ${getErrorMessage(err)}` });
    }
  }

  async function handleClearAssignments(type?: 'astreinte' | 'permanence') {
    if (!activePeriod?.id) return;
    const label = type === 'astreinte' ? 'les astreintes' : type === 'permanence' ? 'les permanences' : 'toutes les assignations';
    if (!confirm(`Effacer ${label} de cette periode ? Les scores seront recalcules.`)) return;
    try {
      await clearAssignmentsByPeriod(activePeriod.id, type);
      setCadres(await getCadres());
      setMessage({ type: 'info', text: `Assignations effacees (${label}).` });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur : ${getErrorMessage(err)}` });
    }
  }

  async function handleClearSlots() {
    if (!activePeriod?.id) return;
    if (!confirm('Supprimer tous les creneaux de cette periode ?')) return;
    try {
      await deleteSlotsByPeriod(activePeriod.id);
      await deletePeriodScores(activePeriod.id);
      setSlotCount(0);
      setMessage({ type: 'info', text: 'Tous les creneaux ont ete supprimes.' });
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur lors de la suppression des creneaux : ${getErrorMessage(err)}` });
    }
  }

  if (!vacations || !closedDays) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />;
  }

  const isDraft = activePeriod?.status === 'draft';

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Generer le Planning</h2>
          <p className="text-sm text-slate-500 mt-1">
            Gerez les periodes et generez les creneaux du semestre
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouvelle periode
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreatePeriod} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Creer une nouvelle periode</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Debut du semestre</label>
              <input
                type="date"
                value={newPeriodStart}
                onChange={e => setNewPeriodStart(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Fin du semestre</label>
              <input
                type="date"
                value={newPeriodEnd}
                onChange={e => setNewPeriodEnd(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Zone scolaire</label>
              <select
                value={newPeriodZone}
                onChange={e => setNewPeriodZone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="A">Zone A</option>
                <option value="B">Zone B</option>
                <option value="C">Zone C</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Creer
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {!activePeriod ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">
            Aucune periode selectionnee. Creez une nouvelle periode pour commencer.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Periode</p>
              <p className="text-sm font-semibold text-slate-900">{activePeriod.label}</p>
              <p className="text-xs text-slate-400 mt-1">
                {activePeriod.startDate} / {activePeriod.endDate}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Statut</p>
              <div className="flex items-center gap-2 mt-1">
                {isDraft ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                    <Sparkles className="w-3 h-3" /> Brouillon
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                    <Lock className="w-3 h-3" /> Publie
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Cadres Astreinte</p>
              <p className="text-sm font-semibold text-slate-900">{astreinteCadres.length} cadres</p>
              <p className="text-xs text-slate-400 mt-1">
                {astreinteCadres.filter(c => c.nearMuseum).length} a proximite
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Creneaux</p>
              <p className="text-sm font-semibold text-slate-900">{slotCount} creneaux</p>
              <p className="text-xs text-slate-400 mt-1">{permanenceCadres.length} cadres permanence</p>
            </div>
          </div>

          {!isDraft && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-50 border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  Cette periode est publiee. Les scores sont figes.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Pour modifier les creneaux, vous devez d'abord rouvrir la periode. Attention : cela peut impacter les scores des periodes suivantes.
                </p>
                <button
                  onClick={handleReopen}
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <Unlock className="w-3 h-3" />
                  Rouvrir la periode
                </button>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200'
                  : message.type === 'error'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-blue-50 border-blue-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : message.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              )}
              <p
                className={`text-sm font-medium ${
                  message.type === 'success'
                    ? 'text-emerald-800'
                    : message.type === 'error'
                      ? 'text-red-800'
                      : 'text-blue-800'
                }`}
              >
                {message.text}
              </p>
            </div>
          )}

          {isDraft && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">Etape 1 : Generer les creneaux</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-4">
                      Cree tous les creneaux d'astreinte et de permanence pour la periode.
                      Les niveaux de difficulte sont calcules automatiquement.
                    </p>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Sparkles className="w-4 h-4" />
                      {generating ? 'Generation en cours...' : 'Generer les creneaux'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">Etape 2 : Répartition automatique</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Lancez chaque phase indépendamment. Chaque phase peut être relancée
                      autant de fois que souhaité — elle efface et recalcule son périmètre.
                    </p>

                    {/* Phase cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">

                      {/* Phase 1 — Astreintes */}
                      <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                        <p className="text-xs font-bold text-blue-800">📅 Phase 1 — Astreintes</p>
                        <p className="text-[11px] text-blue-700 leading-relaxed flex-1">
                          Efface les astreintes auto et réassigne chaque semaine au cadre
                          volontaire ayant le plus faible compteur (plafond {4}/an).
                        </p>
                        <button
                          onClick={handleAssignAstreintes}
                          disabled={assigning !== null || slotCount === 0}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {assigning === 'astreintes' ? 'En cours…' : 'Répartir les astreintes'}
                        </button>
                      </div>

                      {/* Phase 2 — Week-ends */}
                      <div className="flex flex-col gap-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                        <p className="text-xs font-bold text-teal-800">🗓 Phase 2 — Week-ends</p>
                        <p className="text-[11px] text-teal-700 leading-relaxed flex-1">
                          Efface les permanences auto et attribue le samedi ou dimanche
                          de la semaine d'astreinte au cadre concerné.
                        </p>
                        <button
                          onClick={handleAssignWeekends}
                          disabled={assigning !== null || slotCount === 0}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {assigning === 'weekends' ? 'En cours…' : 'Répartir les week-ends'}
                        </button>
                      </div>

                      {/* Phase 3 — Permanences restantes */}
                      <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                        <p className="text-xs font-bold text-violet-800">📋 Phase 3 — Permanences</p>
                        <p className="text-[11px] text-violet-700 leading-relaxed flex-1">
                          Distribue les permanences restantes non assignées aux volontaires,
                          équité D4 → D1, sans jours consécutifs.
                        </p>
                        <button
                          onClick={handleAssignPermanences}
                          disabled={assigning !== null || slotCount === 0}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {assigning === 'permanences' ? 'En cours…' : 'Répartir les permanences'}
                        </button>
                      </div>

                    </div>

                    <p className="text-[11px] text-slate-400 mt-3">
                      Saisissez les vœux via la page <strong className="text-slate-500">Vœux</strong> avant de lancer les phases.
                      Phases 1 et 2 effacent leur périmètre avant de recalculer — la Phase 3 complète
                      uniquement les créneaux encore non assignés.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-emerald-200 p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">Etape 3 : Publier la periode</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-4">
                      Fige les scores de cette periode. Les periodes suivantes utiliseront
                      ces scores comme base de calcul.
                    </p>
                    <button
                      onClick={handlePublishClick}
                      disabled={slotCount === 0}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Lock className="w-4 h-4" />
                      Publier la periode
                    </button>
                  </div>
                </div>
              </div>

              {slotCount > 0 && (
                <div className="bg-white rounded-xl border border-amber-200/60 p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <UserX className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-amber-800">Effacer les assignations</h3>
                      <p className="text-sm text-slate-500 mt-1 mb-4">
                        Reinitialise les assignations de cadres sans supprimer les creneaux. Les scores sont recalcules automatiquement.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleClearAssignments('astreinte')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Astreintes
                        </button>
                        <button
                          onClick={() => handleClearAssignments('permanence')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-50 text-teal-700 border border-teal-200 text-sm font-medium rounded-lg hover:bg-teal-100 transition-colors"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Permanences
                        </button>
                        <button
                          onClick={() => handleClearAssignments()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Tout effacer
                        </button>
                        <button
                          onClick={handleResyncScores}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
                          title="Recalcule les scores depuis les slots réels sans modifier les assignations"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Recalculer les scores
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {slotCount > 0 && (
                <div className="bg-white rounded-xl border border-red-200/60 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-red-700">Supprimer les creneaux</h3>
                      <p className="text-sm text-slate-500 mt-1 mb-4">
                        Supprime tous les creneaux de cette periode.
                      </p>
                      <button
                        onClick={handleClearSlots}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Supprimer les creneaux
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="bg-white rounded-xl border border-red-200/60 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-700">Supprimer la periode</h3>
                <p className="text-sm text-slate-500 mt-1 mb-4">
                  Supprime definitivement cette periode, tous ses creneaux et ses scores.
                </p>
                <button
                  onClick={handleDeletePeriod}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer la periode
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>

    {showPublishDialog && publishStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPublishDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 text-center mb-4">Publier la periode ?</h3>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recapitulatif</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Periode</span>
                  <span className="font-medium text-slate-900">{activePeriod?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Dates</span>
                  <span className="font-medium text-slate-900">{activePeriod?.startDate} → {activePeriod?.endDate}</span>
                </div>
                <div className="border-t border-slate-200 my-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total creneaux</span>
                  <span className="font-medium text-slate-900">{publishStats.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Assignes</span>
                  <span className="font-medium text-emerald-700">{publishStats.assigned}</span>
                </div>
                {publishStats.unassigned > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Non assignes</span>
                    <span className="font-medium text-amber-700">{publishStats.unassigned}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 text-center mb-6">
                Les scores seront figes. Vous pourrez rouvrir la periode si necessaire.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPublishDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handlePublish}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Confirmer la publication
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
