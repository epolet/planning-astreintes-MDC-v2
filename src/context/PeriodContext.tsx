import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { PlanningPeriod } from '../types';
import { getPeriods } from '../db/periods';

interface PeriodContextValue {
  periods: PlanningPeriod[];
  activePeriod: PlanningPeriod | null;
  setActivePeriodId: (id: string) => void;
  refreshPeriods: () => Promise<void>;
  loading: boolean;
}

const PeriodContext = createContext<PeriodContextValue>({
  periods: [],
  activePeriod: null,
  setActivePeriodId: () => {},
  refreshPeriods: async () => {},
  loading: true,
});

export function usePeriod() {
  return useContext(PeriodContext);
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [periods, setPeriods] = useState<PlanningPeriod[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(() => {
    return sessionStorage.getItem('active_period_id');
  });
  const [loading, setLoading] = useState(true);

  // Ref allows refreshPeriods to read the current activePeriodId without
  // taking it as a dependency, preventing the useCallback → useEffect loop.
  const activePeriodIdRef = useRef(activePeriodId);
  activePeriodIdRef.current = activePeriodId;

  const refreshPeriods = useCallback(async () => {
    try {
      const data = await getPeriods();
      setPeriods(data);

      if (data.length > 0) {
        // sessionStorage is the authoritative source: it's updated synchronously by
        // handleSetActivePeriodId, whereas activePeriodIdRef.current only updates
        // after the next render — causing a stale-ref window on first creation.
        const currentId =
          sessionStorage.getItem('active_period_id') ?? activePeriodIdRef.current;
        if (!currentId || !data.find(p => p.id === currentId)) {
          const draft = data.find(p => p.status === 'draft');
          const first = draft || data[0];
          setActivePeriodId(first.id!);
          sessionStorage.setItem('active_period_id', first.id!);
        }
      }
    } catch (err) {
      console.error('Failed to load periods:', err);
    } finally {
      setLoading(false);
    }
  }, []); // stable reference — no dependencies needed thanks to the ref

  useEffect(() => {
    refreshPeriods();
  }, [refreshPeriods]);

  const handleSetActivePeriodId = useCallback((id: string) => {
    setActivePeriodId(id);
    sessionStorage.setItem('active_period_id', id);
  }, []);

  const activePeriod = periods.find(p => p.id === activePeriodId) || null;

  return (
    <PeriodContext.Provider
      value={{
        periods,
        activePeriod,
        setActivePeriodId: handleSetActivePeriodId,
        refreshPeriods,
        loading,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
}
