import { useState, useEffect } from 'react';
import { X, AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { toastBus, type ToastMessage, type ToastLevel } from '../utils/toast';

const ICONS: Record<ToastLevel, React.ElementType> = {
  error:   AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle,
  info:    Info,
};

const STYLES: Record<ToastLevel, string> = {
  error:   'bg-red-600',
  warning: 'bg-amber-500',
  success: 'bg-emerald-600',
  info:    'bg-slate-700',
};

const VISIBLE_MS = 5000;
const FADE_MS    = 300;

type ActiveToast = ToastMessage & { fading: boolean };

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    return toastBus.subscribe(t => {
      setToasts(prev => [...prev, { ...t, fading: false }]);

      // Start fade-out after VISIBLE_MS
      setTimeout(() => {
        setToasts(prev => prev.map(p => p.id === t.id ? { ...p, fading: true } : p));
        // Remove from DOM after fade completes
        setTimeout(() => {
          setToasts(prev => prev.filter(p => p.id !== t.id));
        }, FADE_MS);
      }, VISIBLE_MS);
    });
  }, []);

  function dismiss(id: number) {
    setToasts(prev => prev.map(p => p.id === id ? { ...p, fading: true } : p));
    setTimeout(() => setToasts(prev => prev.filter(p => p.id !== id)), FADE_MS);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map(t => {
        const Icon = ICONS[t.level];
        return (
          <div
            key={t.id}
            className={`
              flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-white
              transition-all duration-300 pointer-events-auto
              ${STYLES[t.level]}
              ${t.fading ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
            `}
          >
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm font-medium flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-70 hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
