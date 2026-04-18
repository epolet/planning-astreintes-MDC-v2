import { useState, useEffect } from 'react';
import { getVacations, getClosedDays } from '../db/config';
import type { VacationPeriod, ClosedDay } from '../types';
import { toast } from '../utils/toast';

/**
 * Loads both vacations and closed days in parallel.
 * Both start as `null` (loading) then become arrays.
 * Used by CalendarView, GeneratePlanning and Settings.
 */
export function useConfig() {
  const [vacations, setVacations] = useState<VacationPeriod[] | null>(null);
  const [closedDays, setClosedDays] = useState<ClosedDay[] | null>(null);

  useEffect(() => {
    Promise.all([getVacations(), getClosedDays()])
      .then(([v, cd]) => { setVacations(v); setClosedDays(cd); })
      .catch(() => {
        toast.error('Impossible de charger la configuration (vacances / jours fermés)');
        setVacations([]);
        setClosedDays([]);
      });
  }, []);

  return { vacations, closedDays };
}

/**
 * Loads only the vacation periods.
 * Returns `null` while loading (allows skeleton / guards in CalendarView).
 */
export function useVacations() {
  const [vacations, setVacations] = useState<VacationPeriod[] | null>(null);

  useEffect(() => {
    getVacations()
      .then(setVacations)
      .catch(() => {
        toast.error('Impossible de charger les périodes de vacances');
        setVacations([]);
      });
  }, []);

  return vacations;
}
