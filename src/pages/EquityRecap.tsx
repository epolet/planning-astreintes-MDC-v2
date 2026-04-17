import React, { useState, useEffect } from 'react';
import { getCadres } from '../db/cadres';
import { getSlots } from '../db/slots';
import { getAllPeriodScores, type PerPeriodScore } from '../db/periods';
import type { Cadre, Slot, DifficultyLevel } from '../types';
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, totalAstreintes, totalPermanences } from '../types';

// ── Column definitions ─────────────────────────────────────────────────────
const ASTREINTE_COLS = [
  { key: 'D5', label: '🎄 Noël',    bg: 'bg-purple-50', text: 'text-purple-700' },
  { key: 'D4', label: 'D4',         bg: 'bg-red-50',    text: 'text-red-700' },
  { key: 'D3', label: 'D3',         bg: 'bg-orange-50', text: 'text-orange-700' },
  { key: 'D2', label: 'D2',         bg: 'bg-amber-50',  text: 'text-amber-700' },
  { key: 'D1', label: 'D1',         bg: 'bg-slate-50',  text: 'text-slate-500' },
  { key: 'Tot', label: 'Total',     bg: 'bg-blue-100',  text: 'text-blue-800' },
] as const;

const PERMANENCE_COLS = [
  { key: 'D5', label: '🎄 Noël',   bg: 'bg-purple-50',  text: 'text-purple-700' },
  { key: 'D4', label: 'D4',        bg: 'bg-red-50',     text: 'text-red-700' },
  { key: 'D3', label: 'D3',        bg: 'bg-orange-50',  text: 'text-orange-700' },
  { key: 'D2', label: 'D2',        bg: 'bg-amber-50',   text: 'text-amber-700' },
  { key: 'D1', label: 'D1',        bg: 'bg-slate-50',   text: 'text-slate-500' },
  { key: 'Tot', label: 'Total',    bg: 'bg-teal-100',   text: 'text-teal-800' },
] as const;

// ── Comparative analysis — module-scope types & helpers ────────────────────
type CounterSpec = {
  key: keyof Cadre;
  label: string;
  slotType: 'astreinte' | 'permanence';
  difficulty: 1 | 2 | 3 | 4 | 5;
};

type RecoItem = {
  key: string;
  label: string;
  slotType: 'astreinte' | 'permanence';
  difficulty: 1 | 2 | 3 | 4 | 5;
  value: number;
  avg: number;
  delta: number;
  rank: number;
  poolSize: number;
  inPool: boolean;
};

const COUNTER_SPECS_ASTREINTE: CounterSpec[] = [
  { key: 'astreinteD5', label: '🎄 Noël astreinte',       slotType: 'astreinte', difficulty: 5 },
  { key: 'astreinteD4', label: 'Astr. très difficile (D4)', slotType: 'astreinte', difficulty: 4 },
  { key: 'astreinteD3', label: 'Astr. difficile (D3)',      slotType: 'astreinte', difficulty: 3 },
  { key: 'astreinteD2', label: 'Astr. assez diff. (D2)',    slotType: 'astreinte', difficulty: 2 },
  { key: 'astreinteD1', label: 'Astr. peu difficile (D1)', slotType: 'astreinte', difficulty: 1 },
];

const COUNTER_SPECS_PERMANENCE: CounterSpec[] = [
  { key: 'permanenceD5', label: '🎄 Noël permanence',       slotType: 'permanence', difficulty: 5 },
  { key: 'permanenceD4', label: 'Perm. très difficile (D4)', slotType: 'permanence', difficulty: 4 },
  { key: 'permanenceD3', label: 'Perm. difficile (D3)',      slotType: 'permanence', difficulty: 3 },
  { key: 'permanenceD2', label: 'Perm. assez diff. (D2)',    slotType: 'permanence', difficulty: 2 },
  { key: 'permanenceD1', label: 'Perm. peu difficile (D1)', slotType: 'permanence', difficulty: 1 },
];

/** Build all reco items for a cadre across both slot types.
 *  Values come from cadre.astreinteD1…D5 / permanenceD1…D5 which are the
 *  CUMULATIVE counters (all published periods + current draft). */
function buildAllRecoItems(cadre: Cadre, astreinteCadres: Cadre[], activeCadres: Cadre[]): RecoItem[] {
  const astrItems = COUNTER_SPECS_ASTREINTE.map(spec => {
    const pool = astreinteCadres;
    const inPool = pool.some(c => c.id === cadre.id);
    const values = pool.map(c => (c[spec.key] as number) ?? 0).sort((a, b) => a - b);
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const value = (cadre[spec.key] as number) ?? 0;
    const delta = value - avg;
    const rank = values.filter(v => v < value).length + 1;
    return { key: String(spec.key), label: spec.label, slotType: spec.slotType, difficulty: spec.difficulty, value, avg, delta, rank, poolSize: pool.length, inPool };
  });

  const permItems = COUNTER_SPECS_PERMANENCE.map(spec => {
    const pool = activeCadres;
    const inPool = pool.some(c => c.id === cadre.id);
    const values = pool.map(c => (c[spec.key] as number) ?? 0).sort((a, b) => a - b);
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const value = (cadre[spec.key] as number) ?? 0;
    const delta = value - avg;
    const rank = values.filter(v => v < value).length + 1;
    return { key: String(spec.key), label: spec.label, slotType: spec.slotType, difficulty: spec.difficulty, value, avg, delta, rank, poolSize: pool.length, inPool };
  });

  return [...astrItems, ...permItems].filter(r => r.inPool);
}

function recoLevel(delta: number, value: number): 'priority' | 'suggest' | 'normal' | 'above' {
  if (delta <= -0.6) return 'priority';   // significantly behind pool average
  if (value === 0)   return 'suggest';    // not started yet (even if everyone is at 0)
  if (delta >= 0.6)  return 'above';
  return 'normal';
}

function rankLabel(rank: number, total: number): string {
  const suffix = rank === 1 ? 'er' : 'e';
  return `${rank}${suffix} / ${total}`;
}

function deltaLabel(delta: number): string {
  if (Math.abs(delta) < 0.05) return '≈ moy.';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs moy.`;
}

// ── RecommendationsPanel component ─────────────────────────────────────────
interface RecommendationsPanelProps {
  cadre: Cadre;
  astreinteCadres: Cadre[];
  activeCadres: Cadre[];
}

function RecoCard({ item, isSuggest }: { item: RecoItem; isSuggest?: boolean }) {
  const typeLabel = item.slotType === 'astreinte' ? '📅' : '🗓';
  if (isSuggest) {
    return (
      <div className="flex flex-col gap-0.5 bg-blue-50/60 rounded-lg border border-dashed border-blue-300 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold leading-tight text-blue-700">{typeLabel} {item.label}</span>
        <span className="text-[10px] text-blue-500">Aucun créneau pris · à démarrer</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 bg-white/80 rounded-lg border border-current/10 px-2.5 py-1.5">
      <span className="text-[11px] font-semibold leading-tight">{typeLabel} {item.label}</span>
      <span className="text-[10px] opacity-70">{item.value} · {deltaLabel(item.delta)} · {rankLabel(item.rank, item.poolSize)}</span>
    </div>
  );
}

function RecommendationsPanel({ cadre, astreinteCadres, activeCadres }: RecommendationsPanelProps) {
  const allItems = buildAllRecoItems(cadre, astreinteCadres, activeCadres);

  const priority = allItems.filter(r => recoLevel(r.delta, r.value) === 'priority');
  const suggest  = allItems.filter(r => recoLevel(r.delta, r.value) === 'suggest');
  const normal   = allItems.filter(r => recoLevel(r.delta, r.value) === 'normal');
  const above    = allItems.filter(r => recoLevel(r.delta, r.value) === 'above');

  // Global rank badges
  const isInAstrPool = astreinteCadres.some(c => c.id === cadre.id);
  const myAst = totalAstreintes(cadre);
  const myPerm = totalPermanences(cadre);

  const allAstTotals = astreinteCadres.map(c => totalAstreintes(c)).sort((a, b) => a - b);
  const allPermTotals = activeCadres.map(c => totalPermanences(c)).sort((a, b) => a - b);
  const astAvg = allAstTotals.reduce((s, v) => s + v, 0) / (allAstTotals.length || 1);
  const permAvg = allPermTotals.reduce((s, v) => s + v, 0) / (allPermTotals.length || 1);
  const astRank = allAstTotals.filter(v => v < myAst).length + 1;
  const permRank = allPermTotals.filter(v => v < myPerm).length + 1;

  const globalBadgeCls = (delta: number, value: number) => {
    const lvl = recoLevel(delta, value);
    if (lvl === 'priority') return 'bg-green-50 border-green-200 text-green-800';
    if (lvl === 'suggest')  return 'bg-blue-50 border-blue-200 text-blue-700';
    if (lvl === 'above')    return 'bg-red-50 border-red-200 text-red-800';
    return 'bg-white border-slate-200 text-slate-700';
  };

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Analyse comparative — cumul toutes périodes
      </p>

      {/* Global rank badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {isInAstrPool && (
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${globalBadgeCls(myAst - astAvg, myAst)}`}>
            📅 Astreintes : {myAst} ({rankLabel(astRank, astreinteCadres.length)} · {deltaLabel(myAst - astAvg)})
          </span>
        )}
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${globalBadgeCls(myPerm - permAvg, myPerm)}`}>
          🗓 Permanences : {myPerm} ({rankLabel(permRank, activeCadres.length)} · {deltaLabel(myPerm - permAvg)})
        </span>
      </div>

      {/* 3-column breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {/* À prioriser + À démarrer */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-bold text-green-800 mb-2 flex items-center gap-1">
            ✅ À prioriser
            {(priority.length + suggest.length) > 0 && (
              <span className="ml-auto font-normal bg-green-200 text-green-900 text-[10px] rounded-full px-1.5">{priority.length + suggest.length}</span>
            )}
          </p>
          {priority.length === 0 && suggest.length === 0 ? (
            <p className="text-[11px] text-green-600 italic">Rien à signaler</p>
          ) : (
            <div className="flex flex-col gap-1.5 text-green-800">
              {priority.map(item => <RecoCard key={item.key} item={item} />)}
              {suggest.length > 0 && priority.length > 0 && (
                <div className="border-t border-green-200/70 my-0.5" />
              )}
              {suggest.length > 0 && (
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">🔵 À démarrer</p>
              )}
              {suggest.map(item => <RecoCard key={item.key} item={item} isSuggest />)}
            </div>
          )}
        </div>

        {/* Dans la moyenne */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
            — Dans la moyenne
            {normal.length > 0 && (
              <span className="ml-auto font-normal bg-slate-100 text-slate-500 text-[10px] rounded-full px-1.5">{normal.length}</span>
            )}
          </p>
          {normal.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">—</p>
          ) : (
            <div className="flex flex-col gap-1.5 text-slate-600">
              {normal.map(item => <RecoCard key={item.key} item={item} />)}
            </div>
          )}
        </div>

        {/* Au-dessus */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1">
            ⚠️ Au-dessus
            {above.length > 0 && (
              <span className="ml-auto font-normal bg-red-200 text-red-900 text-[10px] rounded-full px-1.5">{above.length}</span>
            )}
          </p>
          {above.length === 0 ? (
            <p className="text-[11px] text-red-400 italic">Rien à signaler</p>
          ) : (
            <div className="flex flex-col gap-1.5 text-red-800">
              {above.map(item => <RecoCard key={item.key} item={item} />)}
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        Seuil : écart &gt; 0,6 par rapport à la moyenne du pool éligible · 🔵 À démarrer = aucun créneau pris dans cette catégorie · Données cumulées (toutes périodes publiées + brouillon en cours)
      </p>
    </div>
  );
}

// ── Misc helpers ───────────────────────────────────────────────────────────

/** Score pondéré astreintes uniquement : D1×1 … D5×5 */
function astreinteWeightedScore(c: Cadre): number {
  return c.astreinteD1 * 1 + c.astreinteD2 * 2 + c.astreinteD3 * 3 + c.astreinteD4 * 4 + c.astreinteD5 * 5;
}

/** Score pondéré permanences uniquement : D1×1 … D5×5 */
function permanenceWeightedScore(c: Cadre): number {
  return c.permanenceD1 * 1 + c.permanenceD2 * 2 + c.permanenceD3 * 3 + c.permanenceD4 * 4 + c.permanenceD5 * 5;
}

function CadreCell({ value, color }: { value: number; color: string }) {
  return (
    <span className={value > 0 ? `font-semibold ${color}` : 'text-slate-300'}>
      {value}
    </span>
  );
}

// Use the midpoint of the period to determine its year.
// - H1 2026: starts 2025-12-29, ends 2026-06-28 → mid ≈ Mar 2026 → "2026" ✓
// - H2 2026: starts 2026-07-01, ends 2027-01-02 → mid ≈ Oct 2026 → "2026" ✓
function periodYear(ps: PerPeriodScore): string {
  const mid = new Date((new Date(ps.startDate).getTime() + new Date(ps.endDate).getTime()) / 2);
  return String(mid.getFullYear());
}

// ── Main page component ────────────────────────────────────────────────────
export default function EquityRecap() {
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [allPeriodScores, setAllPeriodScores] = useState<PerPeriodScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCadreId, setSelectedCadreId] = useState<string | null>(null);
  const [view, setView] = useState<'year' | 'period'>('year');

  useEffect(() => {
    Promise.all([getCadres(), getSlots(), getAllPeriodScores()])
      .then(([c, s, ps]) => {
        setCadres(c);
        setSlots(s);
        setAllPeriodScores(ps);
        if (c.length > 0) setSelectedCadreId(c[0].id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />;
  }

  const activeCadres = cadres.filter(c => c.active);
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');

  const selectedCadre = selectedCadreId ? cadres.find(c => c.id === selectedCadreId) ?? null : null;
  const cadreSlots = selectedCadreId
    ? slots.filter(s => s.cadreId === selectedCadreId).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const astreinteSlots = cadreSlots.filter(s => s.type === 'astreinte');
  const permanenceSlots = cadreSlots.filter(s => s.type === 'permanence');

  // Cadres hors pool astreinte classique (permanence uniquement) — suivis pour Noël uniquement
  const permanenceOnlyCadres = activeCadres.filter(c => c.role === 'permanence');

  // Tri astreintes : total DESC, puis score pondéré DESC à égalité
  const sortedAst = [...astreinteCadres].sort(
    (a, b) => totalAstreintes(b) - totalAstreintes(a) || astreinteWeightedScore(b) - astreinteWeightedScore(a)
  );

  // Tri sous-section Noël : par astreinteD5 DESC uniquement
  const sortedNoelOnly = [...permanenceOnlyCadres].sort(
    (a, b) => b.astreinteD5 - a.astreinteD5
  );

  // Tri permanences : total DESC, puis score pondéré DESC à égalité
  const sortedPerm = [...activeCadres].sort(
    (a, b) => totalPermanences(b) - totalPermanences(a) || permanenceWeightedScore(b) - permanenceWeightedScore(a)
  );

  // ── Evolution data ─────────────────────────────────────────────────────
  const years = [...new Set(allPeriodScores.map(ps => periodYear(ps)))].sort();

  function yearTotalsForCadre(cadreId: string, year: string) {
    const scores = allPeriodScores.filter(ps => ps.cadreId === cadreId && periodYear(ps) === year);
    const ast = scores.reduce((s, ps) => s + ps.astreinteD1 + ps.astreinteD2 + ps.astreinteD3 + ps.astreinteD4 + ps.astreinteD5, 0);
    const perm = scores.reduce((s, ps) => s + ps.permanenceD1 + ps.permanenceD2 + ps.permanenceD3 + ps.permanenceD4 + ps.permanenceD5, 0);
    return { ast, perm };
  }

  function periodTotalsForCadre(cadreId: string, periodId: string) {
    const scores = allPeriodScores.filter(ps => ps.cadreId === cadreId && ps.periodId === periodId);
    const ast = scores.reduce((s, ps) => s + ps.astreinteD1 + ps.astreinteD2 + ps.astreinteD3 + ps.astreinteD4 + ps.astreinteD5, 0);
    const perm = scores.reduce((s, ps) => s + ps.permanenceD1 + ps.permanenceD2 + ps.permanenceD3 + ps.permanenceD4 + ps.permanenceD5, 0);
    return { ast, perm };
  }

  type ViewCol = { key: string; label: string; isDraft?: boolean; getValues: (cadreId: string) => { ast: number; perm: number } };

  const viewCols: ViewCol[] = view === 'year'
    ? years.map(yr => {
        const hasDraft = allPeriodScores.some(ps => periodYear(ps) === yr && ps.periodStatus === 'draft');
        return {
          key: yr,
          label: yr,
          isDraft: hasDraft,
          getValues: (cadreId: string) => yearTotalsForCadre(cadreId, yr),
        };
      })
    : [...new Map(allPeriodScores.map(ps => [ps.periodId, ps])).values()]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map(ps => ({
          key: ps.periodId,
          label: ps.periodLabel,
          isDraft: ps.periodStatus === 'draft',
          getValues: (cadreId: string) => periodTotalsForCadre(cadreId, ps.periodId),
        }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Récapitulatif Équité</h2>
        <p className="text-sm text-slate-500 mt-1">
          Compteurs cumulatifs par cadre (toutes périodes publiées + brouillon en cours)
        </p>
      </div>

      {/* ─── Summary tables (two side-by-side) ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* ── Tableau Astreintes ── */}
        <div className="rounded-xl border border-blue-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-white border-b border-r border-slate-200 sticky left-0 z-10"
                  >
                    Cadre
                  </th>
                  <th
                    colSpan={6}
                    className="text-center py-2.5 text-xs font-bold text-blue-700 uppercase tracking-wider bg-blue-50 border-b border-blue-200"
                  >
                    📅 Astreintes (semaines)
                  </th>
                </tr>
                <tr className="border-b-2 border-blue-200">
                  {ASTREINTE_COLS.map(col => (
                    <th
                      key={`ah-${col.key}`}
                      className={`text-center px-2 py-2 text-xs font-semibold min-w-[44px] ${col.bg} ${col.text}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAst.map(cadre => {
                  const isSelected = selectedCadreId === cadre.id;
                  const rowBase = isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-slate-50';
                  return (
                    <tr
                      key={cadre.id}
                      onClick={() => setSelectedCadreId(cadre.id ?? null)}
                      className={`cursor-pointer transition-colors ${rowBase}`}
                    >
                      <td className={`px-3 py-2.5 font-medium text-slate-900 border-r border-slate-100 sticky left-0 z-10 ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                        {cadre.name}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-purple-50/40">
                        <CadreCell value={cadre.astreinteD5} color="text-purple-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-red-50/40">
                        <CadreCell value={cadre.astreinteD4} color="text-red-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-orange-50/40">
                        <CadreCell value={cadre.astreinteD3} color="text-orange-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-amber-50/40">
                        <CadreCell value={cadre.astreinteD2} color="text-amber-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-slate-50/60">
                        <CadreCell value={cadre.astreinteD1} color="text-slate-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums font-bold text-blue-700 bg-blue-100/60">
                        {totalAstreintes(cadre)}
                      </td>
                    </tr>
                  );
                })}

                {/* ── Sous-section Noël uniquement ── */}
                {sortedNoelOnly.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 border-t-2 border-purple-200"
                      >
                        🎄 Noël uniquement — hors pool astreinte classique
                      </td>
                    </tr>
                    {sortedNoelOnly.map(cadre => {
                      const isSelected = selectedCadreId === cadre.id;
                      const rowBase = isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-slate-50';
                      return (
                        <tr
                          key={cadre.id}
                          onClick={() => setSelectedCadreId(cadre.id ?? null)}
                          className={`cursor-pointer transition-colors opacity-80 ${rowBase}`}
                        >
                          <td className={`px-3 py-2 text-sm font-medium text-slate-600 border-r border-slate-100 sticky left-0 z-10 italic ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                            {cadre.name}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums bg-purple-50/40">
                            <CadreCell value={cadre.astreinteD5} color="text-purple-600" />
                          </td>
                          {/* D4→D1 : non applicable — affichés en gris */}
                          <td className="px-2 py-2 text-center text-slate-200 text-xs">—</td>
                          <td className="px-2 py-2 text-center text-slate-200 text-xs">—</td>
                          <td className="px-2 py-2 text-center text-slate-200 text-xs">—</td>
                          <td className="px-2 py-2 text-center text-slate-200 text-xs">—</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-purple-600 bg-blue-100/40">
                            {cadre.astreinteD5 || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
          {astreinteCadres.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm bg-white">Aucun cadre éligible.</div>
          )}
        </div>

        {/* ── Tableau Permanences ── */}
        <div className="rounded-xl border border-teal-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-white border-b border-r border-slate-200 sticky left-0 z-10"
                  >
                    Cadre
                  </th>
                  <th
                    colSpan={6}
                    className="text-center py-2.5 text-xs font-bold text-teal-700 uppercase tracking-wider bg-teal-50 border-b border-teal-200"
                  >
                    🗓 Permanences (jours)
                  </th>
                </tr>
                <tr className="border-b-2 border-teal-200">
                  {PERMANENCE_COLS.map(col => (
                    <th
                      key={`ph-${col.key}`}
                      className={`text-center px-2 py-2 text-xs font-semibold min-w-[44px] ${col.bg} ${col.text}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPerm.map(cadre => {
                  const isSelected = selectedCadreId === cadre.id;
                  const rowBase = isSelected ? 'bg-teal-50 hover:bg-teal-100' : 'bg-white hover:bg-slate-50';
                  return (
                    <tr
                      key={cadre.id}
                      onClick={() => setSelectedCadreId(cadre.id ?? null)}
                      className={`cursor-pointer transition-colors ${rowBase}`}
                    >
                      <td className={`px-3 py-2.5 font-medium text-slate-900 border-r border-slate-100 sticky left-0 z-10 ${isSelected ? 'bg-teal-50' : 'bg-white'}`}>
                        {cadre.name}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-purple-50/40">
                        <CadreCell value={cadre.permanenceD5} color="text-purple-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-red-50/40">
                        <CadreCell value={cadre.permanenceD4} color="text-red-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-orange-50/40">
                        <CadreCell value={cadre.permanenceD3} color="text-orange-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-amber-50/40">
                        <CadreCell value={cadre.permanenceD2} color="text-amber-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums bg-slate-50/60">
                        <CadreCell value={cadre.permanenceD1} color="text-slate-600" />
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums font-bold text-teal-700 bg-teal-100/60">
                        {totalPermanences(cadre)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {activeCadres.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm bg-white">Aucun cadre actif.</div>
          )}
        </div>

      </div>

      {/* ─── Annual / period evolution ──────────────────────────────────── */}
      {years.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">Évolution des créneaux assignés</h3>
            <div className="flex gap-1 p-0.5 bg-slate-200 rounded-lg">
              <button
                onClick={() => setView('year')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === 'year' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Par année
              </button>
              <button
                onClick={() => setView('period')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === 'period' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Par période
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50/60">
                    Cadre
                  </th>
                  {viewCols.map(col => (
                    <th
                      key={col.key}
                      colSpan={2}
                      className={`text-center px-2 py-2 text-xs font-semibold border-l border-slate-200 min-w-[100px] ${col.isDraft ? 'bg-amber-50 text-amber-700' : 'text-slate-600'}`}
                    >
                      {col.label}
                      {col.isDraft && (
                        <span className="block text-[10px] font-normal text-amber-500 leading-tight">en cours</span>
                      )}
                    </th>
                  ))}
                  <th colSpan={2} className="text-center px-2 py-2 text-xs font-semibold text-slate-700 border-l-2 border-slate-300 bg-slate-100 min-w-[100px]">
                    Cumul
                  </th>
                </tr>
                <tr className="border-b-2 border-slate-200 text-xs text-slate-400">
                  <th className="sticky left-0 bg-white" />
                  {viewCols.map(col => (
                    <React.Fragment key={col.key}>
                      <th className="text-center pb-1.5 text-blue-600 border-l border-slate-100 font-medium">Ast.</th>
                      <th className="text-center pb-1.5 text-teal-600 font-medium">Perm.</th>
                    </React.Fragment>
                  ))}
                  <th className="text-center pb-1.5 text-blue-700 font-semibold border-l-2 border-slate-300 bg-slate-50">Ast.</th>
                  <th className="text-center pb-1.5 text-teal-700 font-semibold bg-slate-50">Perm.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPerm.map(cadre => {
                  const cumAst = totalAstreintes(cadre);
                  const cumPerm = totalPermanences(cadre);
                  return (
                    <tr key={cadre.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2 font-medium text-slate-800 sticky left-0 bg-white text-sm">{cadre.name}</td>
                      {viewCols.map(col => {
                        const { ast, perm } = col.getValues(cadre.id!);
                        const draftBg = col.isDraft ? 'bg-amber-50/40' : '';
                        return (
                          <React.Fragment key={col.key}>
                            <td className={`px-3 py-2 text-center tabular-nums border-l border-slate-100 ${draftBg} ${ast > 0 ? 'font-semibold text-blue-700' : 'text-slate-300'}`}>
                              {ast || '—'}
                            </td>
                            <td className={`px-3 py-2 text-center tabular-nums ${draftBg} ${perm > 0 ? 'font-semibold text-teal-700' : 'text-slate-300'}`}>
                              {perm || '—'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className={`px-3 py-2 text-center tabular-nums font-bold border-l-2 border-slate-300 bg-slate-50 ${cumAst > 0 ? 'text-blue-800' : 'text-slate-300'}`}>
                        {cumAst || '—'}
                      </td>
                      <td className={`px-3 py-2 text-center tabular-nums font-bold bg-slate-50 ${cumPerm > 0 ? 'text-teal-800' : 'text-slate-300'}`}>
                        {cumPerm || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Detail per cadre ─────────────────────────────────────────── */}
      {selectedCadre && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4">
            <h3 className="font-semibold text-slate-900">
              Créneaux assignés — {selectedCadre.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {astreinteSlots.length} astreinte{astreinteSlots.length !== 1 ? 's' : ''}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                {permanenceSlots.length} permanence{permanenceSlots.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* ── Comparative recommendations ──────────────────────────── */}
          <RecommendationsPanel
            cadre={selectedCadre}
            astreinteCadres={astreinteCadres}
            activeCadres={activeCadres}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            {/* Astreintes list */}
            <div className="bg-blue-50/20">
              <p className="px-6 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wider bg-blue-50 border-b border-blue-100">
                📅 Astreintes
              </p>
              {astreinteSlots.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-400">Aucune astreinte assignée.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {astreinteSlots.map(s => (
                    <li key={s.id} className="flex items-center gap-3 px-6 py-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DIFFICULTY_COLORS[s.difficulty as DifficultyLevel].dot}`} />
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{s.label}</span>
                      <span className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[s.difficulty as DifficultyLevel].badge}`}>
                        {DIFFICULTY_LABELS[s.difficulty as DifficultyLevel]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Permanences list */}
            <div className="bg-teal-50/20">
              <p className="px-6 py-3 text-xs font-semibold text-teal-700 uppercase tracking-wider bg-teal-50 border-b border-teal-100">
                🗓 Permanences
              </p>
              {permanenceSlots.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-400">Aucune permanence assignée.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {permanenceSlots.map(s => (
                    <li key={s.id} className="flex items-center gap-3 px-6 py-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DIFFICULTY_COLORS[s.difficulty as DifficultyLevel].dot}`} />
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{s.label}</span>
                      <span className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[s.difficulty as DifficultyLevel].badge}`}>
                        {DIFFICULTY_LABELS[s.difficulty as DifficultyLevel]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
