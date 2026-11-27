"use client";

import { FilterX, Search, X } from "lucide-react";

interface FilterToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  tabs?: React.ReactNode;
  resultCount?: number;
  resultLabel?: string;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  rightSlot?: React.ReactNode;
}

export function FilterToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  tabs,
  resultCount,
  resultLabel = "registros",
  hasActiveFilters = false,
  onClearFilters,
  rightSlot,
}: FilterToolbarProps) {
  return (
    <div className="ui-card overflow-hidden">
      {tabs && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/50 sm:px-4">
          {tabs}
        </div>
      )}

      <div className="space-y-3 p-3.5 sm:p-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          {onSearchChange !== undefined && (
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="ui-input pl-9 pr-8"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {filters && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {filters}
            </div>
          )}
        </div>

        {(resultCount !== undefined || hasActiveFilters || rightSlot) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              {resultCount !== undefined && (
                <span className="tabular-nums">
                  <strong className="font-semibold text-slate-900 dark:text-slate-100">
                    {resultCount.toLocaleString("es-CO")}
                  </strong>{" "}
                  {resultLabel}
                </span>
              )}
              {hasActiveFilters && onClearFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/60"
                >
                  <FilterX className="h-3.5 w-3.5" />
                  Limpiar filtros
                </button>
              )}
            </div>
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  );
}
