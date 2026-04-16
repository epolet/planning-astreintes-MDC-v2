async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Returns a map slotId → cadreIds[] for the given period */
export async function getWishesByPeriod(periodId: string): Promise<Map<string, string[]>> {
  const obj: Record<string, string[]> = await apiFetch(`/api/wishes?periodId=${periodId}`);
  return new Map(Object.entries(obj));
}

/** Set the cadres who wish for a specific slot (replaces previous selection) */
export async function setSlotWishes(slotId: string, cadreIds: string[]): Promise<void> {
  await apiFetch('/api/wishes/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId, cadreIds }),
  });
}

/** Clear all wishes for a period (e.g. when slots are regenerated) */
export async function clearWishesByPeriod(periodId: string): Promise<void> {
  await apiFetch(`/api/wishes?periodId=${periodId}`, { method: 'DELETE' });
}
