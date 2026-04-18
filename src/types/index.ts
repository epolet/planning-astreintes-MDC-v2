export interface Cadre {
  id?: string;
  name: string;
  prenom?: string;
  role: 'astreinte' | 'permanence' | 'both';
  nearMuseum: boolean;
  // Counters per difficulty level (1–4) + Noël special (5)
  astreinteD1: number;
  astreinteD2: number;
  astreinteD3: number;
  astreinteD4: number;
  astreinteD5: number; // Noël
  permanenceD1: number;
  permanenceD2: number;
  permanenceD3: number;
  permanenceD4: number;
  permanenceD5: number; // Noël
  active: boolean;
  /** ISO date (YYYY-MM-DD) of departure; null = still active */
  quitLe?: string | null;
}

export interface Slot {
  id?: string;
  date: string;
  type: 'astreinte' | 'permanence';
  difficulty: DifficultyLevel;
  cadreId: string | null;
  cadreName: string;
  status: 'auto' | 'manual';
  label: string;
  periodId: string | null;
}

/** 1=Peu diff, 2=Assez diff, 3=Difficile, 4=Très difficile, 5=Noël (special) */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type PeriodStatus = 'draft' | 'published';

export interface PlanningPeriod {
  id?: string;
  label: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  zone: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PeriodScore {
  id?: string;
  cadreId: string;
  periodId: string;
  astreinteD1: number;
  astreinteD2: number;
  astreinteD3: number;
  astreinteD4: number;
  astreinteD5: number; // Noël
  permanenceD1: number;
  permanenceD2: number;
  permanenceD3: number;
  permanenceD4: number;
  permanenceD5: number; // Noël
}

export interface VacationPeriod {
  id?: number;
  name: string;
  startDate: string;
  endDate: string;
  zone: string;
  type: string;
}

export interface ClosedDay {
  id?: number;
  date: string;
  reason: string;
}

export interface AppConfig {
  id?: number;
  key: string;
  value: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function fullName(c: Pick<Cadre, 'name' | 'prenom'>): string {
  return c.prenom ? `${c.prenom} ${c.name}` : c.name;
}

export function totalAstreintes(
  c: Pick<Cadre, 'astreinteD1' | 'astreinteD2' | 'astreinteD3' | 'astreinteD4' | 'astreinteD5'>
): number {
  return c.astreinteD1 + c.astreinteD2 + c.astreinteD3 + c.astreinteD4 + c.astreinteD5;
}

export function totalPermanences(
  c: Pick<Cadre, 'permanenceD1' | 'permanenceD2' | 'permanenceD3' | 'permanenceD4' | 'permanenceD5'>
): number {
  return c.permanenceD1 + c.permanenceD2 + c.permanenceD3 + c.permanenceD4 + c.permanenceD5;
}

export const ZERO_COUNTERS = {
  astreinteD1: 0, astreinteD2: 0, astreinteD3: 0, astreinteD4: 0, astreinteD5: 0,
  permanenceD1: 0, permanenceD2: 0, permanenceD3: 0, permanenceD4: 0, permanenceD5: 0,
} as const;

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  5: 'Noël',
  4: 'Très Difficile',
  3: 'Difficile',
  2: 'Assez Difficile',
  1: 'Peu Difficile',
};

export const DIFFICULTY_COLORS: Record<DifficultyLevel, {
  bg: string; text: string; dot: string; border: string; badge: string; ring: string;
}> = {
  5: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800', ring: 'ring-purple-500' },
  4: { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200',    badge: 'bg-red-100 text-red-800',       ring: 'ring-red-500'    },
  3: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800', ring: 'ring-orange-500' },
  2: { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-800',   ring: 'ring-amber-500'  },
  1: { bg: 'bg-emerald-50',text: 'text-emerald-700',dot: 'bg-emerald-500',border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-800',ring: 'ring-emerald-500'},
};
