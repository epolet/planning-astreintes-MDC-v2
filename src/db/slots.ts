import type { Slot } from '../types';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSlots(): Promise<Slot[]> {
  return apiFetch('/api/slots');
}

export async function getSlotsByPeriod(periodId: string): Promise<Slot[]> {
  return apiFetch(`/api/slots?periodId=${periodId}`);
}

export async function countSlotsByPeriod(periodId: string): Promise<number> {
  const data = await apiFetch(`/api/slots/count?periodId=${periodId}`);
  return data.count as number;
}

export async function addSlots(slots: Omit<Slot, 'id'>[]): Promise<void> {
  if (slots.length === 0) return;
  await apiFetch('/api/slots/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slots),
  });
}

export async function updateSlot(id: string, updates: Partial<Slot>): Promise<void> {
  await apiFetch(`/api/slots/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function updateSlotWithScores(
  slotId: string,
  payload: { cadreId: string | null; difficulty: number; periodId: string | null }
): Promise<void> {
  await apiFetch(`/api/slots/${slotId}/with-scores`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteSlotsByPeriod(periodId: string): Promise<void> {
  await apiFetch(`/api/slots?periodId=${periodId}`, { method: 'DELETE' });
}

export async function deleteSlot(slotId: string): Promise<void> {
  await apiFetch(`/api/slots/${slotId}`, { method: 'DELETE' });
}

export async function clearAssignmentsByPeriod(
  periodId: string,
  type?: 'astreinte' | 'permanence',
  /** When true, only wipe auto-assigned slots (status='auto') — keeps manual ones. */
  autoOnly?: boolean,
): Promise<void> {
  const params = new URLSearchParams({ periodId });
  if (type) params.set('type', type);
  if (autoOnly) params.set('statusFilter', 'auto');
  await apiFetch(`/api/slots/clear?${params}`, { method: 'POST' });
}
