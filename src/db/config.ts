import type { VacationPeriod, ClosedDay } from '../types';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getVacations(): Promise<VacationPeriod[]> {
  return apiFetch('/api/vacations');
}

export async function addVacation(v: Omit<VacationPeriod, 'id'>): Promise<VacationPeriod> {
  return apiFetch('/api/vacations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(v),
  });
}

export async function deleteVacation(id: number): Promise<void> {
  await apiFetch(`/api/vacations/${id}`, { method: 'DELETE' });
}

export async function getClosedDays(): Promise<ClosedDay[]> {
  return apiFetch('/api/closed-days');
}

export async function addClosedDay(d: Omit<ClosedDay, 'id'>): Promise<ClosedDay> {
  return apiFetch('/api/closed-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  });
}

export async function deleteClosedDay(id: number): Promise<void> {
  await apiFetch(`/api/closed-days/${id}`, { method: 'DELETE' });
}

export async function initializeDefaults(): Promise<void> {
  await apiFetch('/api/config/init', { method: 'POST' });
}
