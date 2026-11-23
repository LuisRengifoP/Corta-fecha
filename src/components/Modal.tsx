"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidthClass?: string;
  closeDisabled?: boolean;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = "max-w-lg",
  closeDisabled = false,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closeDisabled, onClose]);

  if (!open) return null;

  return (
    <div
      className="cf-animate-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-0 backdrop-blur-[2px] dark:bg-black/75 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        className={`cf-animate-modal-responsive flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-2xl sm:border-b ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950/60 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-snug text-slate-900 dark:text-slate-100 sm:text-lg">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Cerrar ventana"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:p-1.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="pb-safe flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
