import { useState, useMemo } from 'react';
import { format, addDays, parseISO, getISOWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { usePeriod } from '../context/PeriodContext';
import DifficultyBadge from '../components/DifficultyBadge';
import SlotModal from '../components/SlotModal';
import { useCadres } from '../hooks/useCadres';
import { usePeriodSlots } from '../hooks/usePeriodSlots';
import type { Slot } from '../types';
import { Pencil, Download, User, AlertTriangle } from 'lucide-react';

export default function ListView() {
  const { activePeriod } = usePeriod();
  const { cadres } = useCadres();
  const { slots, refresh: refreshSlots } = usePeriodSlots(activePeriod?.id);
  const [filter, setFilter] = useState<'all' | 'astreinte' | 'permanence'>('all');
  const [cadreFilter, setCadreFilter] = useState<string | 'all'>('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const assignedCadres = useMemo(() => {
    return cadres.filter(c => c.active).sort((a, b) => a.name.localeCompare(b.name));
  }, [cadres]);

  const filteredSlots = useMemo(() => {
    let result = slots;
    if (filter !== 'all') result = result.filter(s => s.type === filter);
    if (unassignedOnly) result = result.filter(s => !s.cadreId);
    else if (cadreFilter !== 'all') result = result.filter(s => s.cadreId === cadreFilter);
    return result;
  }, [slots, filter, cadreFilter, unassignedOnly]);

  function formatSlotDate(slot: Slot): string {
    if (slot.type === 'astreinte') {
      const monday = parseISO(slot.date);
      const sunday = addDays(monday, 6);
      const week = getISOWeek(monday);
      return `S${week} — ${format(monday, 'dd MMM', { locale: fr })} - ${format(sunday, 'dd MMM yyyy', { locale: fr })}`;
    }
    return format(parseISO(slot.date), 'EEEE dd MMM yyyy', { locale: fr });
  }

  function handleModalClose() {
    setSelectedSlot(null);
    refreshSlots();
  }

  if (cadres.length === 0 && slots.length === 0) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Planning</h2>
          <p className="text-sm text-slate-500 mt-1">Liste detaillee de tous les creneaux</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {(['all', 'astreinte', 'permanence'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  filter === f
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f === 'all' ? 'Tous' : f === 'astreinte' ? 'Astreintes' : 'Permanences'}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setUnassignedOnly(v => !v);
              setCadreFilter('all');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              unassignedOnly
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Non attribues
          </button>
          <div className={`relative transition-opacity duration-200 ${unassignedOnly ? 'opacity-40 pointer-events-none' : ''}`}>
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={cadreFilter === 'all' ? '' : cadreFilter}
              onChange={e => setCadreFilter(e.target.value || 'all')}
              className="pl-8 pr-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 appearance-none cursor-pointer min-w-[140px]"
            >
              <option value="">Tous les cadres</option>
              {assignedCadres.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {slots.length > 0 && (
            <button
              onClick={async () => {
                const { exportToExcel } = await import('../utils/export');
                await exportToExcel(slots, cadres, activePeriod?.id);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Exporter Excel
            </button>
          )}
        </div>
      </div>

      {filteredSlots.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">
            Aucun creneau genere. Rendez-vous dans la section "Generer" pour creer le planning.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Difficulte</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigne</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSlots.map(slot => (
                  <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium whitespace-nowrap capitalize">
                      {formatSlotDate(slot)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          slot.type === 'astreinte'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}
                      >
                        {slot.type === 'astreinte' ? 'Astreinte' : 'Permanence'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DifficultyBadge level={slot.difficulty} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {slot.cadreName || (
                        <span className="text-slate-400 italic">Non assigne</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          slot.status === 'manual' ? 'text-amber-600' : 'text-slate-400'
                        }`}
                      >
                        {slot.status === 'auto' ? 'Auto' : 'Manuel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedSlot(slot)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-500">
              {filteredSlots.length} creneau{filteredSlots.length > 1 ? 'x' : ''} affiche{filteredSlots.length > 1 ? 's' : ''}
              {unassignedOnly && ' — filtre : non attribues uniquement'}
            </p>
          </div>
        </div>
      )}

      <SlotModal slot={selectedSlot} onClose={handleModalClose} onDelete={handleModalClose} periodId={activePeriod?.id || null} />
    </div>
  );
}
