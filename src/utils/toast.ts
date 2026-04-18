/**
 * Minimal event-bus toast system.
 * Works outside React (importable from hooks and db layer).
 * One listener at a time — perfectly fine for a single-user app.
 */

export type ToastLevel = 'error' | 'warning' | 'success' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  level: ToastLevel;
}

type Listener = (t: ToastMessage) => void;

let _listener: Listener | null = null;
let _counter = 0;

export const toastBus = {
  subscribe(fn: Listener): () => void {
    _listener = fn;
    return () => { _listener = null; };
  },
  emit(message: string, level: ToastLevel = 'error'): void {
    _listener?.({ id: ++_counter, message, level });
  },
};

/** Convenience shorthand helpers — usable from anywhere (hooks, db layer, etc.) */
export const toast = {
  error:   (message: string) => toastBus.emit(message, 'error'),
  warning: (message: string) => toastBus.emit(message, 'warning'),
  success: (message: string) => toastBus.emit(message, 'success'),
  info:    (message: string) => toastBus.emit(message, 'info'),
};
