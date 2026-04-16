import type { PlanningPeriod, PeriodScore } from '../types';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPeriods(): Promise<PlanningPeriod[]> {
  return apiFetch('/api/periods');
}

export async function getPeriod(id: string): Promise<PlanningPeriod | null> {
  const res = await fetch(`/api/periods/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createPeriod(
  period: Omit<PlanningPeriod, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PlanningPeriod> {
  return apiFetch('/api/periods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(period),
  });
}

export async function updatePeriodStatus(id: string, status: 'draft' | 'published'): Promise<void> {
  await apiFetch(`/api/periods/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function deletePeriod(id: string): Promise<void> {
  await apiFetch(`/api/periods/${id}`, { method: 'DELETE' });
}

export async function getPeriodScores(periodId: string): Promise<PeriodScore[]> {
  return apiFetch(`/api/scores?periodId=${periodId}`);
}

// Counters from all published periods that started before the given period
export type CumulativeCounters = {
  astreinteD1: number; astreinteD2: number; astreinteD3: number; astreinteD4: number; astreinteD5: number;
  permanenceD1: number; permanenceD2: number; permanenceD3: number; permanenceD4: number; permanenceD5: number;
};

export async function getCumulativeScoresBefore(
  periodId: string
): Promise<Map<string, CumulativeCounters>> {
  const rows: ({ cadreId: string } & CumulativeCounters)[] =
    await apiFetch(`/api/scores/cumulative?periodId=${periodId}`);

  const map = new Map<string, CumulativeCounters>();
  for (const r of rows) {
    const { cadreId, ...counters } = r;
    map.set(cadreId, counters);
  }
  return map;
}

export async function getAllCumulativeScores(): Promise<Map<string, CumulativeCounters>> {
  const rows: ({ cadreId: string } & CumulativeCounters)[] =
    await apiFetch('/api/scores/cumulative-all');

  const map = new Map<string, CumulativeCounters>();
  for (const r of rows) {
    const { cadreId, ...counters } = r;
    map.set(cadreId, counters);
  }
  return map;
}

export async function upsertPeriodScores(
  periodId: string,
  scores: ({ cadreId: string } & CumulativeCounters)[]
): Promise<void> {
  if (scores.length === 0) return;
  await apiFetch('/api/scores/upsert', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodId, scores }),
  });
}

export async function deletePeriodScores(periodId: string): Promise<void> {
  await apiFetch(`/api/scores?periodId=${periodId}`, { method: 'DELETE' });
}

export async function recalculateCadreGlobalScores(): Promise<void> {
  await apiFetch('/api/scores/recalculate', { method: 'POST' });
}

/** Resync period_scores from actual slot assignments for a given period,
 *  then recalculate global cadre scores. Safe: does not modify any slots. */
export async function resyncPeriodScores(periodId: string): Promise<void> {
  await apiFetch(`/api/scores/resync/${periodId}`, { method: 'POST' });
}

export type PerPeriodScore = CumulativeCounters & {
  cadreId: string;
  periodId: string;
  periodLabel: string;
  periodStatus: 'draft' | 'published';
  startDate: string;
  endDate: string;
};

export async function getAllPeriodScores(): Promise<PerPeriodScore[]> {
  return apiFetch('/api/scores/all-periods');
}
