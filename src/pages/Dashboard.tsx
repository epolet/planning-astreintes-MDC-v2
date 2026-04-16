import { useState, useEffect } from 'react';
import { usePeriod } from '../context/PeriodContext';
import { getCadres } from '../db/cadres';
import { getSlotsByPeriod } from '../db/slots';
import { getPeriodScores } from '../db/periods';
import EquityChart from '../components/EquityChart';
import DifficultyBadge from '../components/DifficultyBadge';
import { DIFFICULTY_COLORS, totalAstreintes, totalPermanences, ZERO_COUNTERS } from '../types';
import type { Cadre, Slot, DifficultyLevel, PeriodScore } from '../types';
import { exportToExcel } from '../utils/export';
import { Users, CalendarDays, BarChart3, AlertTriangle, Download, Lock, Pencil } from 'lucide-react';

export default function Dashboard() {
  const { activePeriod } = usePeriod();
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [periodScores, setPeriodScores] = useState<PeriodScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCadres()
      .then(setCadres)
      .catch(() => setCadres([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activePeriod?.id) {
      getSlotsByPeriod(activePeriod.id).then(setSlots).catch(() => setSlots([]));
      getPeriodScores(activePeriod.id).then(setPeriodScores).catch(() => setPeriodScores([]));
    } else {
      setSlots([]);
      setPeriodScores([]);
    }
  }, [activePeriod]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const activeCadres = cadres.filter(c => c.active);
  const unassigned = slots.filter(s => !s.cadreId);

  const scoreMap = new Map<string, PeriodScore>();
  for (const ps of periodScores) {
    scoreMap.set(ps.cadreId, ps);
  }

  const cadresWithPeriodScores = activeCadres.map(c => ({
    ...c,
    ...(scoreMap.get(c.id!) ?? ZERO_COUNTERS),
  }));

  const avgCount =
    cadresWithPeriodScores.length > 0
      ? (cadresWithPeriodScores.reduce((sum, c) => sum + totalAstreintes(c) + totalPermanences(c), 0) / cadresWithPeriodScores.length).toFixed(1)
      : '0';

  const difficultyBreakdown = ([4, 3, 2, 1] as DifficultyLevel[]).map(d => ({
    level: d,
    count: slots.filter(s => s.difficulty === d).length,
  }));

  const stats = [
    { label: 'Cadres actifs', value: activeCadres.length, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total creneaux', value: slots.length, icon: CalendarDays, color: 'text-teal-600 bg-teal-50' },
    { label: 'Creneaux moy. (periode)', value: avgCount, icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
    { label: 'Non assignes', value: unassigned.length, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Tableau de Bord</h2>
          {activePeriod && (
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
              {activePeriod.label}
              {activePeriod.status === 'published' ? (
                <Lock className="w-3 h-3 text-emerald-500" />
              ) : (
                <Pencil className="w-3 h-3 text-amber-500" />
              )}
            </p>
          )}
        </div>
        {slots.length > 0 && (
          <button
            onClick={() => exportToExcel(slots, cadresWithPeriodScores, activePeriod?.id)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exporter Excel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200/80 p-5 hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Equite des Creneaux (cette periode)</h3>
          <EquityChart cadres={cadresWithPeriodScores} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-6">
          <h3 className="font-semibold text-slate-900 mb-5">Repartition par Difficulte</h3>
          <div className="space-y-5">
            {difficultyBreakdown.map(({ level, count }) => (
              <div key={level}>
                <div className="flex items-center justify-between mb-1.5">
                  <DifficultyBadge level={level} />
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">{count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${DIFFICULTY_COLORS[level].dot}`}
                    style={{ width: `${slots.length > 0 ? (count / slots.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {slots.length === 0 && (
            <div className="mt-6 p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 text-center">
                Aucun creneau genere. Utilisez la section "Generer" pour demarrer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
