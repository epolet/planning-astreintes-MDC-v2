import type { Cadre } from '../types';
import { totalAstreintes, totalPermanences } from '../types';

interface Props {
  cadres: Cadre[];
}

const DIFF_LEVELS = [5, 4, 3, 2, 1] as const;

const DIFF_META: Record<number, { bg: string; label: string; border: string }> = {
  5: { bg: 'bg-purple-500', border: 'border-purple-600', label: '🎄 Noël' },
  4: { bg: 'bg-red-500',    border: 'border-red-600',    label: 'D4 Très diff.' },
  3: { bg: 'bg-orange-400', border: 'border-orange-500', label: 'D3 Difficile' },
  2: { bg: 'bg-amber-400',  border: 'border-amber-500',  label: 'D2 Assez diff.' },
  1: { bg: 'bg-slate-300',  border: 'border-slate-400',  label: 'D1 Peu diff.' },
};

function SegmentedBar({
  counts,
  prefix,
  maxTotal,
  colorClass,
}: {
  counts: number[];   // index 0 = D1, index 4 = D5
  prefix: string;
  maxTotal: number;
  colorClass: string;
}) {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total === 0) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[10px] font-semibold uppercase tracking-wide w-8 shrink-0 ${colorClass}`}>
          {prefix}
        </span>
        <div className="flex-1 h-5 bg-slate-100 rounded" />
        <span className="text-xs text-slate-300 tabular-nums w-4 text-right">—</span>
      </div>
    );
  }

  // Bar width proportional to maxTotal; min 8px per filled bar so thin bars stay visible
  const barPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`text-[10px] font-semibold uppercase tracking-wide w-8 shrink-0 ${colorClass}`}>
        {prefix}
      </span>
      {/* Bar track */}
      <div className="flex-1 relative h-5 bg-slate-100 rounded overflow-hidden">
        {/* Filled portion, split by difficulty */}
        <div
          className="absolute left-0 top-0 h-full flex"
          style={{ width: `${Math.max(barPct, 2)}%` }}
        >
          {DIFF_LEVELS.map(d => {
            const idx = d - 1;
            const cnt = counts[idx];
            if (cnt === 0) return null;
            const segPct = (cnt / total) * 100;
            return (
              <div
                key={d}
                className={`h-full ${DIFF_META[d].bg} flex items-center justify-center`}
                style={{ width: `${segPct}%` }}
                title={`${DIFF_META[d].label} : ${cnt}`}
              >
                {cnt > 0 && segPct > 12 && (
                  <span className="text-[9px] font-bold text-white/90 leading-none">
                    {cnt}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-600 tabular-nums w-4 text-right">{total}</span>
    </div>
  );
}

export default function EquityChart({ cadres }: Props) {
  const active = cadres.filter(c => c.active);

  if (active.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
        Aucun cadre actif
      </div>
    );
  }

  const rows = active
    .map(c => {
      const astCounts  = [c.astreinteD1,  c.astreinteD2,  c.astreinteD3,  c.astreinteD4,  c.astreinteD5];
      const permCounts = [c.permanenceD1, c.permanenceD2, c.permanenceD3, c.permanenceD4, c.permanenceD5];
      const total = totalAstreintes(c) + totalPermanences(c);
      // Score pondéré : D1×1 … D5×5 — classe en tête les cadres avec le plus de créneaux difficiles
      const weightedScore =
        astCounts.reduce((s, v, i)  => s + v * (i + 1), 0) +
        permCounts.reduce((s, v, i) => s + v * (i + 1), 0);
      return { id: c.id, name: c.name, astCounts, permCounts, total, weightedScore };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore || b.total - a.total);

  const maxAst   = Math.max(...rows.map(r => r.astCounts.reduce((s, v)  => s + v, 0)), 1);
  const maxPerm  = Math.max(...rows.map(r => r.permCounts.reduce((s, v) => s + v, 0)), 1);
  const maxTotal = Math.max(maxAst, maxPerm, 1);

  const avg = rows.reduce((s, r) => s + r.total, 0) / rows.length;

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 pb-3 border-b border-slate-100">
        {DIFF_LEVELS.map(d => (
          <span key={d} className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-sm ${DIFF_META[d].bg}`} />
            {DIFF_META[d].label}
          </span>
        ))}
        <span className="ml-auto text-[11px] font-medium text-slate-500">
          Moy. {avg.toFixed(1)} créneaux
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: '420px' }}>
        {rows.map(row => (
          <div key={row.id} className="grid grid-cols-[100px_1fr] gap-x-3 items-center group">
            {/* Name */}
            <span
              className="text-xs font-medium text-slate-700 truncate text-right pr-1"
              title={row.name}
            >
              {row.name}
            </span>

            {/* Two bars */}
            <div className="space-y-1">
              <SegmentedBar
                counts={row.astCounts}
                prefix="Ast."
                maxTotal={maxTotal}
                colorClass="text-blue-600"
              />
              <SegmentedBar
                counts={row.permCounts}
                prefix="Perm."
                maxTotal={maxTotal}
                colorClass="text-teal-600"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
