import { useState } from 'react';
import { ChevronDown, Lock, Pencil, Plus, Calendar } from 'lucide-react';
import { usePeriod } from '../context/PeriodContext';

export default function PeriodSelector() {
  const { periods, activePeriod, setActivePeriodId } = usePeriod();
  const [open, setOpen] = useState(false);

  if (!activePeriod) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors w-full text-left"
      >
        <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{activePeriod.label}</p>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            {activePeriod.status === 'published' ? (
              <><Lock className="w-2.5 h-2.5" /> Publie</>
            ) : (
              <><Pencil className="w-2.5 h-2.5" /> Brouillon</>
            )}
          </p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-50 max-h-64 overflow-y-auto">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePeriodId(p.id!);
                  setOpen(false);
                }}
                className={`flex items-center gap-2.5 px-3 py-2.5 w-full text-left hover:bg-slate-700/60 transition-colors ${
                  p.id === activePeriod.id ? 'bg-blue-600/20' : ''
                }`}
              >
                {p.status === 'published' ? (
                  <Lock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                ) : (
                  <Pencil className="w-3 h-3 text-blue-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{p.label}</p>
                  <p className="text-[10px] text-slate-400">
                    {p.startDate} / {p.endDate}
                  </p>
                </div>
              </button>
            ))}
            {periods.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-slate-400">Aucune periode</p>
              </div>
            )}
            <div className="border-t border-slate-700">
              <a
                href="/generer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-blue-400 hover:bg-slate-700/60 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Nouvelle periode
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
