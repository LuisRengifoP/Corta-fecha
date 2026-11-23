"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  notify: (opts: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    ({
      title,
      description,
      variant = "success",
      durationMs = 4200,
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
      durationMs?: number;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [
        ...prev.slice(-3),
        { id, title, description, variant },
      ]);
      window.setTimeout(() => {
        dismiss(id);
      }, durationMs);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-full sm:max-w-sm"
      >
        {toasts.map((toast) => {
          const styleMap: Record<
            ToastVariant,
            { wrap: string; icon: React.ReactNode }
          > = {
            success: {
              wrap: "border-emerald-200 bg-white text-slate-900 shadow-lg ring-1 ring-emerald-500/15 dark:border-emerald-800/80 dark:bg-slate-900 dark:text-slate-100 dark:ring-emerald-500/25",
              icon: (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ),
            },
            error: {
              wrap: "border-red-200 bg-white text-slate-900 shadow-lg ring-1 ring-red-500/15 dark:border-red-800/80 dark:bg-slate-900 dark:text-slate-100 dark:ring-red-500/25",
              icon: (
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              ),
            },
            info: {
              wrap: "border-indigo-200 bg-white text-slate-900 shadow-lg ring-1 ring-indigo-500/15 dark:border-indigo-800/80 dark:bg-slate-900 dark:text-slate-100 dark:ring-indigo-500/25",
              icon: (
                <Info className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              ),
            },
          };
          const s = styleMap[toast.variant];
          return (
            <div
              key={toast.id}
              role="status"
              className={`cf-animate-popover pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 ${s.wrap}`}
            >
              {s.icon}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Cerrar notificación"
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      notify: () => {},
    };
  }
  return ctx;
}
