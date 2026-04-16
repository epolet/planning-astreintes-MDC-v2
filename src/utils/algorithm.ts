import {
  eachWeekOfInterval,
  eachDayOfInterval,
  parseISO,
  format,
  getDay,
  addDays,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Cadre, Slot, VacationPeriod, ClosedDay } from '../types';
import {
  classifyAstreinteDifficulty,
  classifyPermanenceDifficulty,
  isPublicHoliday,
  isChristmasPeriod,
} from './holidays';

export function generateAstreinteSlots(
  startDate: string,
  endDate: string,
  vacations: VacationPeriod[],
  _closedDays: ClosedDay[],
  zone: string
): Omit<Slot, 'id'>[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const mondays = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  const slots: Omit<Slot, 'id'>[] = [];

  for (const monday of mondays) {
    if (monday < start || monday > end) continue;
    const dateStr = format(monday, 'yyyy-MM-dd');
    const nextMonday = addDays(monday, 7);
    const difficulty = classifyAstreinteDifficulty(monday, vacations, zone);

    slots.push({
      date: dateStr,
      type: 'astreinte',
      difficulty,
      cadreId: null,
      cadreName: '',
      status: 'auto',
      label: `Sem. ${format(monday, 'dd MMM', { locale: fr })} - ${format(nextMonday, 'dd MMM', { locale: fr })}`,
      periodId: null,
    });
  }

  return slots;
}

export function generatePermanenceSlots(
  startDate: string,
  endDate: string,
  vacations: VacationPeriod[],
  closedDays: ClosedDay[],
  zone: string
): Omit<Slot, 'id'>[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const days = eachDayOfInterval({ start, end });
  const closedSet = new Set(closedDays.map(d => d.date));
  const slots: Omit<Slot, 'id'>[] = [];

  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (closedSet.has(dateStr)) continue;

    const dayOfWeek = getDay(day);
    const { isHoliday, name } = isPublicHoliday(day);
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isPermanenceDay = dayOfWeek === 0 || dayOfWeek === 6 || (isHoliday && isWeekday);
    if (!isPermanenceDay) continue;

    const difficulty = classifyPermanenceDifficulty(day, vacations, zone);
    let label = format(day, 'EEEE dd MMMM yyyy', { locale: fr });
    if (isHoliday) label += ` (${name})`;

    slots.push({
      date: dateStr,
      type: 'permanence',
      difficulty,
      cadreId: null,
      cadreName: '',
      status: 'auto',
      label,
      periodId: null,
    });
  }

  return slots;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard cap: a cadre cannot receive more than this many astreinte weeks per year */
export const MAX_ASTREINTES_PER_YEAR = 4;

// ─── autoAssignSlots helpers ──────────────────────────────────────────────────

/**
 * Counters array: index = difficulty - 1, so [D1, D2, D3, D4, D5].
 * Lower is better; comparisons go D5 first (rarest), then D4, D3, D2, D1.
 */
function buildCounterMaps(cadres: Cadre[]): {
  countersA: Map<string, number[]>;
  countersP: Map<string, number[]>;
} {
  const countersA = new Map<string, number[]>();
  const countersP = new Map<string, number[]>();
  for (const c of cadres) {
    countersA.set(c.id!, [c.astreinteD1, c.astreinteD2, c.astreinteD3, c.astreinteD4, c.astreinteD5]);
    countersP.set(c.id!, [c.permanenceD1, c.permanenceD2, c.permanenceD3, c.permanenceD4, c.permanenceD5]);
  }
  return { countersA, countersP };
}

function sumArr(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}

/** Compare two cadres by their counters for a given type. D5 first (rarest), then D4, D3, D2, D1, then cross-type total. */
function compareByCounts(
  a: Cadre,
  b: Cadre,
  primary: Map<string, number[]>,
  secondary: Map<string, number[]>,
): number {
  const ca = primary.get(a.id!) ?? [0, 0, 0, 0, 0];
  const cb = primary.get(b.id!) ?? [0, 0, 0, 0, 0];
  // Compare D5 first (index 4), then D4, D3, D2, D1
  for (let i = 4; i >= 0; i--) {
    if (ca[i] !== cb[i]) return ca[i] - cb[i];
  }
  // Tie-break: total (primary + secondary)
  const oa = secondary.get(a.id!) ?? [0, 0, 0, 0, 0];
  const ob = secondary.get(b.id!) ?? [0, 0, 0, 0, 0];
  return (sumArr(ca) + sumArr(oa)) - (sumArr(cb) + sumArr(ob));
}

/**
 * Pass 1 — Assign each astreinte slot to the eligible cadre with the fewest
 * high-difficulty astreintes (D4 first, then D3, D2, D1).
 * - Only cadres who expressed a wish are eligible (if wishes are provided).
 * - Respects the annual cap MAX_ASTREINTES_PER_YEAR.
 * - For Noël slots (D5), all active cadres are eligible (role restriction lifted).
 * - Skips slots already manually assigned (cadreId set).
 * Returns a map of cadreId → list of monday dates they are on astreinte.
 */
function assignAstreinteSlots(
  astreinteSlots: Slot[],
  astreinteCadres: Cadre[],
  activeCadres: Cadre[],
  countersA: Map<string, number[]>,
  countersP: Map<string, number[]>,
  vacations: VacationPeriod[],
  zone: string,
  wishes: Map<string, string[]>
): Map<string, string[]> {
  const astreinteAssignedWeeks = new Map<string, string[]>();

  for (const slot of astreinteSlots) {
    // Skip slots already manually assigned
    if (slot.cadreId) {
      const weeks = astreinteAssignedWeeks.get(slot.cadreId) ?? [];
      weeks.push(slot.date);
      astreinteAssignedWeeks.set(slot.cadreId, weeks);
      continue;
    }

    // For Noël (D5), all active cadres are eligible regardless of role
    const isNoel = slot.difficulty === 5;
    let eligible = isNoel ? [...activeCadres] : [...astreinteCadres];

    // If wishes are configured for this slot, restrict to volunteers only
    if (slot.id && wishes.has(slot.id)) {
      const volunteered = new Set(wishes.get(slot.id)!);
      const filtered = eligible.filter(c => volunteered.has(c.id!));
      if (filtered.length > 0) eligible = filtered;
      // If no volunteer, leave slot unassigned
      else { slot.cadreId = null; slot.cadreName = ''; continue; }
    }

    // Annual cap: exclude cadres who have reached MAX_ASTREINTES_PER_YEAR
    const belowCap = eligible.filter(c => sumArr(countersA.get(c.id!) ?? [0, 0, 0, 0, 0]) < MAX_ASTREINTES_PER_YEAR);
    if (belowCap.length > 0) eligible = belowCap;

    // Outside Christmas: only cadres within 30 min are eligible
    const christmas = isChristmasPeriod(parseISO(slot.date), vacations, zone);
    if (!christmas) {
      const nearOnly = eligible.filter(c => c.nearMuseum);
      if (nearOnly.length > 0) eligible = nearOnly;
    }
    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareByCounts(a, b, countersA, countersP));

    const chosen = eligible[0];
    slot.cadreId = chosen.id!;
    slot.cadreName = chosen.name;
    slot.status = 'auto';

    const arr = countersA.get(chosen.id!) ?? [0, 0, 0, 0, 0];
    arr[slot.difficulty - 1]++;
    countersA.set(chosen.id!, arr);

    const weeks = astreinteAssignedWeeks.get(chosen.id!) ?? [];
    weeks.push(slot.date);
    astreinteAssignedWeeks.set(chosen.id!, weeks);
  }

  return astreinteAssignedWeeks;
}

/**
 * Pass 2 — For each assigned astreinte week, assign a weekend permanence slot
 * to the on-call cadre IF (and only if) they expressed a wish on that slot.
 *
 * Rules:
 * - No alternation: the cadre gets whatever slot they volunteered for.
 * - If they wished for both Saturday AND Sunday, Saturday is preferred.
 * - If they wished for neither, nothing is assigned (slot falls through to Pass 3).
 */
function pairAstreinteWithWeekend(
  astreinteSlots: Slot[],
  permanenceSlots: Slot[],
  countersP: Map<string, number[]>,
  wishes: Map<string, string[]>
): void {
  for (const aSlot of astreinteSlots) {
    if (!aSlot.cadreId) continue;

    const monday = parseISO(aSlot.date);
    const saturday = format(addDays(monday, 5), 'yyyy-MM-dd');
    const sunday   = format(addDays(monday, 6), 'yyyy-MM-dd');

    // Find unassigned slots for this week's weekend
    const satSlot = permanenceSlots.find(s => s.date === saturday && !s.cadreId);
    const sunSlot = permanenceSlots.find(s => s.date === sunday   && !s.cadreId);

    const cadreId = aSlot.cadreId;

    // Only assign if the on-call cadre expressed a wish on that specific slot
    const wantsSat = satSlot?.id ? (wishes.get(satSlot.id) ?? []).includes(cadreId) : false;
    const wantsSun = sunSlot?.id ? (wishes.get(sunSlot.id) ?? []).includes(cadreId) : false;

    // Saturday preferred if wished for both; otherwise whichever was wished for
    const targetSlot = wantsSat ? satSlot : wantsSun ? sunSlot : null;
    if (!targetSlot) continue;

    targetSlot.cadreId   = cadreId;
    targetSlot.cadreName = aSlot.cadreName;
    targetSlot.status    = 'auto';

    const arr = countersP.get(cadreId) ?? [0, 0, 0, 0, 0];
    arr[targetSlot.difficulty - 1]++;
    countersP.set(cadreId, arr);
  }
}

/**
 * Pass 3 — Distribute remaining unassigned permanence slots across active
 * cadres, prioritising equity (fewest D4/D3/D2/D1 first) while avoiding
 * consecutive days and astreinte-week conflicts.
 * - If wishes are provided for a slot, only volunteers are eligible.
 */
function assignRemainingPermanence(
  permanenceSlots: Slot[],
  activeCadres: Cadre[],
  countersA: Map<string, number[]>,
  countersP: Map<string, number[]>,
  astreinteAssignedWeeks: Map<string, string[]>,
  wishes: Map<string, string[]>
): void {
  const remaining = permanenceSlots
    .filter(s => !s.cadreId)
    .sort((a, b) => b.difficulty - a.difficulty || a.date.localeCompare(b.date));

  const lastAssigned = new Map<string, string>();

  for (const slot of remaining) {
    let eligible = [...activeCadres];

    // If wishes are configured for this slot, restrict to volunteers only
    if (slot.id && wishes.has(slot.id)) {
      const volunteered = new Set(wishes.get(slot.id)!);
      const filtered = eligible.filter(c => volunteered.has(c.id!));
      if (filtered.length > 0) eligible = filtered;
      else { slot.cadreId = null; slot.cadreName = ''; continue; }
    }

    // Avoid consecutive days
    const noConsecutive = eligible.filter(c => {
      const last = lastAssigned.get(c.id!);
      if (!last) return true;
      const diff = Math.abs(parseISO(slot.date).getTime() - parseISO(last).getTime()) / 86_400_000;
      return diff > 1;
    });
    if (noConsecutive.length > 0) eligible = noConsecutive;

    // Avoid assigning the weekend to someone already on astreinte that week
    const notOnAstreinteWeekend = eligible.filter(c => {
      const weeks = astreinteAssignedWeeks.get(c.id!);
      if (!weeks) return true;
      return !weeks.some(monday => {
        const sat = format(addDays(parseISO(monday), 5), 'yyyy-MM-dd');
        const sun = format(addDays(parseISO(monday), 6), 'yyyy-MM-dd');
        return slot.date === sat || slot.date === sun;
      });
    });
    if (notOnAstreinteWeekend.length > 0) eligible = notOnAstreinteWeekend;

    if (eligible.length === 0) eligible = [...activeCadres];
    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareByCounts(a, b, countersP, countersA));

    const chosen = eligible[0];
    slot.cadreId = chosen.id!;
    slot.cadreName = chosen.name;
    slot.status = 'auto';

    const arr = countersP.get(chosen.id!) ?? [0, 0, 0, 0, 0];
    arr[slot.difficulty - 1]++;
    countersP.set(chosen.id!, arr);

    lastAssigned.set(chosen.id!, slot.date);
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export type PassOptions = {
  /** Pass 1 — assign astreinte weeks (default: true) */
  astreintes?: boolean;
  /** Pass 2 — assign weekend permanence to on-call cadre (default: true) */
  weekends?: boolean;
  /** Pass 3 — distribute remaining permanence slots (default: true) */
  permanences?: boolean;
};

/**
 * @param wishes   Map<slotId, cadreId[]> — cadres who expressed a wish for each slot.
 *   If empty/absent, all eligible cadres are candidates (fallback behaviour).
 *   If wishes are configured but NO permanence slot has wishes, Passes 2 & 3
 *   are skipped so that only astreinte slots get assigned.
 * @param passes   Which passes to execute. Defaults to all three.
 *   When Pass 1 is skipped, astreinteAssignedWeeks is derived from existing slot state.
 */
export function autoAssignSlots(
  slots: Slot[],
  cadres: Cadre[],
  vacations: VacationPeriod[],
  zone: string,
  wishes: Map<string, string[]> = new Map(),
  passes: PassOptions = {}
): Slot[] {
  const runPass1 = passes.astreintes ?? true;
  const runPass2 = passes.weekends   ?? true;
  const runPass3 = passes.permanences ?? true;

  const activeCadres = cadres.filter(c => c.active);
  const astreinteCadres = activeCadres.filter(c => c.role === 'astreinte' || c.role === 'both');

  const astreinteSlots = slots
    .filter(s => s.type === 'astreinte')
    .sort((a, b) => b.difficulty - a.difficulty || a.date.localeCompare(b.date));

  const permanenceSlots = slots
    .filter(s => s.type === 'permanence')
    .sort((a, b) => a.date.localeCompare(b.date));

  const { countersA, countersP } = buildCounterMaps(activeCadres);

  // Pass 1 — or derive assigned weeks from existing slot state when skipping.
  let astreinteAssignedWeeks: Map<string, string[]>;
  if (runPass1) {
    astreinteAssignedWeeks = assignAstreinteSlots(
      astreinteSlots, astreinteCadres, activeCadres, countersA, countersP, vacations, zone, wishes
    );
  } else {
    astreinteAssignedWeeks = new Map();
    for (const s of astreinteSlots) {
      if (s.cadreId) {
        const weeks = astreinteAssignedWeeks.get(s.cadreId) ?? [];
        weeks.push(s.date);
        astreinteAssignedWeeks.set(s.cadreId, weeks);
      }
    }
  }

  // Only run permanence passes if wishes cover permanence slots,
  // or if no wishes are configured at all (pure auto mode).
  const wishesConfigured = wishes.size > 0;
  const hasPermanenceWishes = permanenceSlots.some(s => s.id && wishes.has(s.id));
  const permPassesAllowed = !wishesConfigured || hasPermanenceWishes;

  if (runPass2 && permPassesAllowed) {
    pairAstreinteWithWeekend(astreinteSlots, permanenceSlots, countersP, wishes);
  }
  if (runPass3 && permPassesAllowed) {
    assignRemainingPermanence(permanenceSlots, activeCadres, countersA, countersP, astreinteAssignedWeeks, wishes);
  }

  return [...astreinteSlots, ...permanenceSlots].sort((a, b) => a.date.localeCompare(b.date));
}
