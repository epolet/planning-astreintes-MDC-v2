import { useState, useEffect, useCallback } from 'react';
import { getCadres } from '../db/cadres';
import type { Cadre } from '../types';
import { toast } from '../utils/toast';

/**
 * Loads the active cadres list once on mount and exposes a `refresh` callback
 * for triggering a manual reload (e.g. after a mutation).
 */
export function useCadres() {
  const [cadres, setCadres] = useState<Cadre[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCadres(await getCadres());
    } catch {
      toast.error('Impossible de charger la liste des cadres');
      setCadres([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { cadres, loading, refresh };
}
