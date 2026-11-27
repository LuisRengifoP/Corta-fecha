"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  maxWidthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  badge,
  maxWidthClass = "sm:max-w-lg lg:max-w-xl",
  footer,
  children,
}: DetailDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="cf-animate-fade fixed inset-0 z-[58] flex justify-end bg-slate-900/50 backdrop-blur-[2px] dark:bg-black/75"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`cf-animate-drawer-right flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111622] ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {badge && <div className="mb-1 flex flex-wrap gap-1.5">{badge}</div>}
              <h2 className="break-words text-base font-bold leading-snug text-slate-900 dark:text-slate-100">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel lateral"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="pb-safe shrink-0 border-t border-slate-200 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/70">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
