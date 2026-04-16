import { useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  parseISO,
  isWithinInterval,
  getISOWeek,
  addDays,
} from 'date-fns';
import { Flame, AlertTriangle, AlertCircle, Minus, Snowflake } from 'lucide-react';
import type { Slot, DifficultyLevel, VacationPeriod } from '../types';
import { DIFFICULTY_COLORS } from '../types';

const DIFFICULTY_ICONS: Record<DifficultyLevel, typeof Flame> = {
  5: Snowflake,
  4: Flame,
  3: AlertTriangle,
  2: AlertCircle,
  1: Minus,
};

interface Props {
  currentDate: Date;
  slots: Slot[];
  onDayClick: (date: Date, daySlots: Slot[]) => void;
  vacations?: VacationPeriod[];
  selectedZone?: string;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getVacationInfo(
  date: Date,
  vacations: VacationPeriod[],
  selectedZone: string
): { isSelectedZone: boolean; isOtherZone: boolean; vacationName: string } {
  let isSelectedZone = false;
  let isOtherZone = false;
  let vacationName = '';

  for (const vac of vacations) {
    try {
      const start = parseISO(vac.startDate);
      const end = parseISO(vac.endDate);
      if (!isWithinInterval(date, { start, end })) continue;

      if (vac.zone === 'all' || vac.zone === selectedZone) {
        isSelectedZone = true;
        vacationName = vac.name;
      } else {
        isOtherZone = true;
        if (!vacationName) vacationName = vac.name;
      }
    } catch {
      continue;
    }
  }

  return { isSelectedZone, isOtherZone, vacationName };
}

export default function CalendarGrid({ currentDate, slots, onDayClick, vacations = [], selectedZone = 'C' }: Props) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = s.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [slots]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
        {WEEKDAYS.map(d => (
          <div
            key={d}
            className="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const daySlots = slotsByDate.get(dateKey) || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const maxDifficulty =
            daySlots.length > 0
              ? (Math.max(...daySlots.map(s => s.difficulty)) as DifficultyLevel)
              : null;

          const vacInfo = inMonth
            ? getVacationInfo(day, vacations, selectedZone)
            : { isSelectedZone: false, isOtherZone: false, vacationName: '' };

          let vacationBorder = '';
          let vacationBg = '';
          if (vacInfo.isSelectedZone) {
            vacationBorder = 'ring-2 ring-inset ring-blue-400/60';
            if (!maxDifficulty) vacationBg = 'bg-blue-50/40';
          } else if (vacInfo.isOtherZone) {
            vacationBorder = 'ring-1 ring-inset ring-slate-300';
            if (!maxDifficulty) vacationBg = 'bg-slate-50/50';
          }

          return (
            <div
              key={i}
              onClick={() => daySlots.length > 0 && onDayClick(day, daySlots)}
              title={vacInfo.vacationName || undefined}
              className={`min-h-[90px] md:min-h-[110px] p-1.5 border-b border-r border-slate-100 transition-all duration-150 relative ${
                inMonth ? '' : 'bg-slate-50/50'
              } ${daySlots.length > 0 ? 'cursor-pointer hover:ring-2 hover:ring-blue-200 hover:ring-inset' : ''} ${
                maxDifficulty && inMonth ? DIFFICULTY_COLORS[maxDifficulty].bg : vacationBg
              } ${vacationBorder}`}
            >
              <div className="flex items-start justify-between mb-1">
                <span
                  className={`text-xs font-medium leading-none ${
                    today
                      ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
                      : inMonth
                        ? 'text-slate-700'
                        : 'text-slate-300'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                <div className="flex items-center gap-0.5">
                  {vacInfo.isSelectedZone && !maxDifficulty && (
                    <span className="text-[9px] font-semibold text-blue-500 leading-none">V</span>
                  )}
                  {maxDifficulty && inMonth && (() => {
                    const Icon = DIFFICULTY_ICONS[maxDifficulty];
                    return (
                      <Icon
                        className={`w-3.5 h-3.5 ${DIFFICULTY_COLORS[maxDifficulty].text}`}
                      />
                    );
                  })()}
                </div>
              </div>
              <div className="space-y-0.5">
                {daySlots.slice(0, 3).map(slot => (
                  <div
                    key={slot.id}
                    className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium ${
                      slot.type === 'astreinte'
                        ? 'bg-blue-100/80 text-blue-800'
                        : 'bg-teal-100/80 text-teal-800'
                    }`}
                  >
                    {slot.type === 'astreinte' ? (
                      <>
                        <span className="font-bold">S{getISOWeek(addDays(parseISO(slot.date), 0))}</span>{' '}
                        {slot.cadreName || '---'}
                      </>
                    ) : (
                      <>
                        <span className="font-bold">P</span>{' '}
                        {slot.cadreName || '---'}
                      </>
                    )}
                  </div>
                ))}
                {daySlots.length > 3 && (
                  <p className="text-[10px] text-slate-400 px-1">+{daySlots.length - 3} autres</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
