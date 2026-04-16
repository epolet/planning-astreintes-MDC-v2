import { parseISO, isWithinInterval, addDays, format } from 'date-fns';
import type { VacationPeriod, DifficultyLevel } from '../types';

function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getFrenchPublicHolidays(year: number): { date: Date; name: string }[] {
  const easter = computeEaster(year);
  const easterMonday = addDays(easter, 1);
  const ascension = addDays(easter, 39);
  const whitMonday = addDays(easter, 50);

  return [
    { date: new Date(year, 0, 1), name: "Jour de l'An" },
    { date: easterMonday, name: 'Lundi de Pâques' },
    { date: new Date(year, 4, 1), name: 'Fête du Travail' },
    { date: new Date(year, 4, 8), name: 'Victoire 1945' },
    { date: ascension, name: 'Ascension' },
    { date: whitMonday, name: 'Lundi de Pentecôte' },
    { date: new Date(year, 6, 14), name: 'Fête Nationale' },
    { date: new Date(year, 7, 15), name: 'Assomption' },
    { date: new Date(year, 10, 1), name: 'Toussaint' },
    { date: new Date(year, 10, 11), name: 'Armistice' },
    { date: new Date(year, 11, 25), name: 'Noël' },
  ];
}

export function isPublicHoliday(date: Date): { isHoliday: boolean; name: string } {
  const holidays = getFrenchPublicHolidays(date.getFullYear());
  const found = holidays.find(
    h =>
      h.date.getFullYear() === date.getFullYear() &&
      h.date.getMonth() === date.getMonth() &&
      h.date.getDate() === date.getDate()
  );
  return { isHoliday: !!found, name: found?.name || '' };
}

function findVacation(date: Date, vacations: VacationPeriod[], zone: string): VacationPeriod | null {
  for (const vac of vacations) {
    if (vac.zone !== 'all' && vac.zone !== zone) continue;
    const start = parseISO(vac.startDate);
    const end = parseISO(vac.endDate);
    if (isWithinInterval(date, { start, end })) return vac;
  }
  return null;
}

function isPetitesVacances(vac: VacationPeriod): boolean {
  return vac.type === 'hiver' || vac.type === 'printemps' || vac.type === 'toussaint';
}

function isFirstWeekOfVacation(date: Date, vacation: VacationPeriod): boolean {
  const start = parseISO(vacation.startDate);
  const firstWeekEnd = addDays(start, 6);
  return isWithinInterval(date, { start, end: firstWeekEnd });
}

function isSecondWeekOfVacation(date: Date, vacation: VacationPeriod): boolean {
  const start = parseISO(vacation.startDate);
  const secondWeekStart = addDays(start, 7);
  const secondWeekEnd = addDays(start, 13);
  return isWithinInterval(date, { start: secondWeekStart, end: secondWeekEnd });
}

function isAug15Week(mondayDate: Date): boolean {
  const year = mondayDate.getFullYear();
  const aug15 = new Date(year, 7, 15);
  const weekEnd = addDays(mondayDate, 6);
  return mondayDate <= aug15 && weekEnd >= aug15;
}

/** Monday of the ISO week that contains Aug 15. */
function aug15WeekMonday(year: number): Date {
  const aug15 = new Date(year, 7, 15);
  const dow = aug15.getDay(); // 0 = Sun, 1 = Mon … 6 = Sat
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(aug15, -daysToMonday);
}

/** D4 for permanence: Sat/Sun of the week that contains Aug 15. */
function isAug15WeekWeekend(date: Date): boolean {
  const monday = aug15WeekMonday(date.getFullYear());
  const saturday = addDays(monday, 5);
  const sunday = addDays(monday, 6);
  const d = format(date, 'yyyy-MM-dd');
  return d === format(saturday, 'yyyy-MM-dd') || d === format(sunday, 'yyyy-MM-dd');
}

/** D3 for permanence: Sat/Sun immediately before the week of Aug 15. */
function isBeforeAug15WeekWeekend(date: Date): boolean {
  const monday = aug15WeekMonday(date.getFullYear());
  const saturday = addDays(monday, -2);
  const sunday = addDays(monday, -1);
  const d = format(date, 'yyyy-MM-dd');
  return d === format(saturday, 'yyyy-MM-dd') || d === format(sunday, 'yyyy-MM-dd');
}

function isLateJulyEarlyAugust(date: Date): boolean {
  const m = date.getMonth();
  const d = date.getDate();
  return (m === 6 && d >= 25) || (m === 7 && d <= 7);
}

function getMiddleWeekendOfVacation(vacation: VacationPeriod): { start: Date; end: Date } {
  const vacStart = parseISO(vacation.startDate);
  const vacEnd = parseISO(vacation.endDate);
  const durationDays = Math.round((vacEnd.getTime() - vacStart.getTime()) / 86_400_000);
  const midpoint = addDays(vacStart, Math.floor(durationDays / 2));
  // Find the Saturday of the week containing midpoint (Mon-Sun week)
  const dow = midpoint.getDay(); // 0=Sun, 6=Sat
  const daysToSat = dow === 0 ? -1 : (6 - dow); // if Sun, go back to previous Sat
  const saturday = addDays(midpoint, daysToSat);
  return { start: saturday, end: addDays(saturday, 1) };
}

function isInMiddleWeekend(date: Date, vacation: VacationPeriod): boolean {
  const { start, end } = getMiddleWeekendOfVacation(vacation);
  return isWithinInterval(date, { start, end });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isFirstOrLastWeekendOfVacation(date: Date, vacation: VacationPeriod): boolean {
  const vacStart = parseISO(vacation.startDate);
  const vacEnd = parseISO(vacation.endDate);

  // First weekend: the Saturday/Sunday at the very start of the vacation.
  // French petites vacances start Saturday → vacStart=Sat, vacStart+1=Sun.
  const firstSat = vacStart;
  const firstSun = addDays(vacStart, 1);

  // Last weekend: the Sat+Sun closest to the end of the vacation.
  // education.gouv.fr encodes the end date as the Monday children return (endDow=1)
  // OR as the actual Sunday (endDow=0). We find the last Sunday ≤ vacEnd and the
  // Saturday preceding it, regardless of which day vacEnd falls on.
  const endDow = vacEnd.getDay(); // 0=Sun, 1=Mon, 2=Tue …
  const lastSun = endDow === 0 ? vacEnd : addDays(vacEnd, -endDow);
  const lastSat = addDays(lastSun, -1);

  return (
    isSameDay(date, firstSat) || isSameDay(date, firstSun) ||
    isSameDay(date, lastSat) || isSameDay(date, lastSun)
  );
}

function isInLastTwoWeekendsOfNoel(date: Date, vacation: VacationPeriod): boolean {
  const vacEnd = parseISO(vacation.endDate);
  const twoWeeksBefore = addDays(vacEnd, -13);
  return isWithinInterval(date, { start: twoWeeksBefore, end: vacEnd });
}

function isInFirstWeekendOfNoel(date: Date, vacation: VacationPeriod): boolean {
  const vacStart = parseISO(vacation.startDate);
  const firstWeekEnd = addDays(vacStart, 6);
  return isWithinInterval(date, { start: vacStart, end: firstWeekEnd });
}

export function classifyAstreinteDifficulty(
  date: Date,
  vacations: VacationPeriod[],
  zone: string
): DifficultyLevel {
  const vacation = findVacation(date, vacations, zone);

  // D5 — Noël (rarest, special category)
  if (vacation?.type === 'noel') return 5;

  // D4 — Week of 15 août
  if (isAug15Week(date)) return 4;

  if (vacation && isPetitesVacances(vacation)) {
    // D3 — First week of petites vacances
    if (isFirstWeekOfVacation(date, vacation)) return 3;
    // D2 — Second week of petites vacances
    if (isSecondWeekOfVacation(date, vacation)) return 2;
    return 1;
  }

  return 1;
}

export function classifyPermanenceDifficulty(
  date: Date,
  vacations: VacationPeriod[],
  zone: string
): DifficultyLevel {
  const vacation = findVacation(date, vacations, zone);
  const { isHoliday } = isPublicHoliday(date);

  if (vacation?.type === 'noel') {
    // D5 — last 2 weekends of Noël (closing weekends — rarest)
    if (isInLastTwoWeekendsOfNoel(date, vacation)) return 5;
    // D3 — first weekend of Noël
    if (isInFirstWeekendOfNoel(date, vacation)) return 3;
    return 2;
  }

  // D4 — weekend OF the Aug 15 week (Sat/Sun within the week containing Aug 15)
  if (isAug15WeekWeekend(date)) return 4;

  // D3 — weekend immediately BEFORE the Aug 15 week
  if (isBeforeAug15WeekWeekend(date)) return 3;

  if (vacation && isPetitesVacances(vacation)) {
    // D4 — middle weekend of petites vacances
    if (isInMiddleWeekend(date, vacation)) return 4;
    // D3 — first or last weekend of petites vacances
    if (isFirstOrLastWeekendOfVacation(date, vacation)) return 3;
    return 2;
  }

  if (isLateJulyEarlyAugust(date)) return 2;

  if (isHoliday) return 2;

  return 1;
}

export function isChristmasPeriod(date: Date, vacations: VacationPeriod[], zone: string): boolean {
  const vacation = findVacation(date, vacations, zone);
  return vacation?.type === 'noel';
}
