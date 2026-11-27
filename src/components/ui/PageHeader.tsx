"use client";

import { FileSpreadsheet, FileText } from "lucide-react";

export interface ExportActionItem {
  label: string;
  href: string;
  format: "xlsx" | "pdf";
  onClick?: () => void;
}

export function ExportActions({
  items,
}: {
  items: ExportActionItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
      role="group"
      aria-label="Exportar reportes"
    >
      {items.map((item) => {
        const isXlsx = item.format === "xlsx";
        return (
          <a
            key={`${item.label}-${item.href}`}
            href={item.href}
            onClick={item.onClick}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {isXlsx ? (
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span>{item.label}</span>
          </a>
        );
      })}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description: string;
  badge?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  exports?: ExportActionItem[];
}

export function PageHeader({
  title,
  description,
  badge,
  primaryAction,
  secondaryActions,
  exports,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800/80 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            {title}
          </h1>
          {badge && (
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {badge}
            </span>
          )}
        </div>
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>

      {(primaryAction || secondaryActions || (exports && exports.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {exports && exports.length > 0 && <ExportActions items={exports} />}
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
