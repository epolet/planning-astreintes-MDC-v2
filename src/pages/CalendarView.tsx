import { useState, useMemo, useEffect } from 'react';
import { format, addMonths, subMonths, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getVacations } from '../db/config';
import { getSlotsByPeriod } from '../db/slots';
import { usePeriod } from '../context/PeriodContext';
import CalendarGrid from '../components/CalendarGrid';
import SlotModal from '../components/SlotModal';
import type { Slot, VacationPeriod } from '../types';

export default function CalendarView() {
  const { activePeriod } = usePeriod();
  const [vacations, setVacations] = useState<VacationPeriod[] | null>(null);

  useEffect(() => {
    getVacations().then(setVacations).catch(() => setVacations([]));
  }, []);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [daySlots, setDaySlots] = useState<Slot[]>([]);
  const [daySlotIndex, setDaySlotIndex] = useState(0);
  const [filter, setFilter] = useState<'all' | 'astreinte' | 'permanence'>('all');

  useEffect(() => {
    if (activePeriod?.id) {
      getSlotsByPeriod(activePeriod.id).then(setSlots).catch(() => setSlots([]));
    } else {
      setSlots([]);
    }
  }, [activePeriod]);

  useEffect(() => {
    if (currentDate || !activePeriod?.startDate) return;
    try {
      const start = parseISO(activePeriod.startDate);
      setCurrentDate(new Date(start.getFullYear(), start.getMonth(), 1));
    } catch {
      setCurrentDate(new Date(2026, 0, 1));
    }
  }, [activePeriod, currentDate]);

  const filteredSlots = useMemo(() => {
    if (filter === 'all') return slots;
    return slots.filter(s => s.type === filter);
  }, [slots, filter]);

  if (!vacations || !currentDate) {
    return <div className="animate-pulse h-[600px] bg-slate-100 rounded-xl" />;
  }

  function handleDayClick(_date: Date, clickedSlots: Slot[]) {
    setDaySlots(clickedSlots);
    setDaySlotIndex(0);
    setSelectedSlot(clickedSlots[0]);
  }

  function handleModalClose() {
    setSelectedSlot(null);
    setDaySlots([]);
    setDaySlotIndex(0);
    if (activePeriod?.id) {
      getSlotsByPeriod(activePeriod.id).then(setSlots).catch(() => setSlots([]));
    }
  }

  function navigateSlot(dir: number) {
    const next = daySlotIndex + dir;
    if (next >= 0 && next < daySlots.length) {
      setDaySlotIndex(next);
      setSelectedSlot(daySlots[next]);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Calendrier</h2>
          <p className="text-sm text-slate-500 mt-1">
            Vue mensuelle des astreintes et permanences
          </p>
        </div>
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
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-3">
        <button
          onClick={() => setCurrentDate(prev => prev ? subMonths(prev, 1) : prev)}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900 capitalize">
          {format(currentDate, 'MMMM yyyy', { locale: fr })}
        </h3>
        <button
          onClick={() => setCurrentDate(prev => prev ? addMonths(prev, 1) : prev)}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <CalendarGrid
        currentDate={currentDate}
        slots={filteredSlots}
        onDayClick={handleDayClick}
        vacations={vacations}
        selectedZone={activePeriod?.zone || 'C'}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200" />
          Astreinte
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-teal-100 border border-teal-200" />
          Permanence
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-50 border border-red-200" />
          Tres Difficile
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-orange-50 border border-orange-200" />
          Difficile
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />
          Assez Difficile
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
          Peu Difficile
        </div>
        <span className="text-slate-300">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border-2 border-blue-400 bg-blue-50/50" />
          Vacances (zone selectionnee)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded ring-1 ring-slate-300 bg-slate-50/50" />
          Vacances (autres zones)
        </div>
      </div>

      {selectedSlot && (
        <>
          <SlotModal slot={selectedSlot} onClose={handleModalClose} onDelete={handleModalClose} periodId={activePeriod?.id || null} />
          {daySlots.length > 1 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-lg shadow-xl border border-slate-200 px-4 py-2 flex items-center gap-3">
              <button
                onClick={() => navigateSlot(-1)}
                disabled={daySlotIndex === 0}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-slate-600">
                {daySlotIndex + 1} / {daySlots.length}
              </span>
              <button
                onClick={() => navigateSlot(1)}
                disabled={daySlotIndex === daySlots.length - 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
