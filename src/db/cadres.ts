import type { Cadre } from '../types';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCadres(): Promise<Cadre[]> {
  return apiFetch('/api/cadres');
}

export async function getCadre(id: string): Promise<Cadre | null> {
  const res = await fetch(`/api/cadres/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addCadre(cadre: Omit<Cadre, 'id'>): Promise<Cadre> {
  return apiFetch('/api/cadres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cadre),
  });
}

export async function updateCadre(id: string, updates: Partial<Cadre>): Promise<void> {
  await apiFetch(`/api/cadres/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

/** Soft-delete: sets quitte_le to today and actif=0. Historical slots are preserved. */
export async function archiveCadre(id: string): Promise<void> {
  await apiFetch(`/api/cadres/${id}`, { method: 'DELETE' });
}

export async function getArchivedCadres(): Promise<Cadre[]> {
  return apiFetch('/api/cadres/archived');
}

export async function restoreCadre(id: string): Promise<void> {
  await apiFetch(`/api/cadres/${id}/restore`, { method: 'POST' });
}

export async function countSlotsByCadre(id: string): Promise<number> {
  const data = await apiFetch(`/api/cadres/${id}/slot-count`);
  return data.count as number;
}

export async function resetAllScores(): Promise<void> {
  await apiFetch('/api/cadres/reset-scores', { method: 'POST' });
}
