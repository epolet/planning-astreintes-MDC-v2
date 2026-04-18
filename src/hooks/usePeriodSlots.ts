import { useState, useEffect, useCallback } from 'react';
import { getSlotsByPeriod } from '../db/slots';
import type { Slot } from '../types';
import { toast } from '../utils/toast';

/**
 * Loads slots for the given period and reloads whenever `periodId` changes.
 * Returns a `refresh` callback for manual reloads after mutations (e.g. SlotModal save).
 * `setSlots` is exposed for the rare case where a page needs an optimistic update.
 */
export function usePeriodSlots(periodId: string | undefined) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!periodId) {
      setSlots([]);
      return;
    }
    setLoading(true);
    try {
      setSlots(await getSlotsByPeriod(periodId));
    } catch {
      toast.error('Impossible de charger les créneaux de la période');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { slots, loading, refresh, setSlots };
}
