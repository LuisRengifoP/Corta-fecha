"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  searchText?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionLabel?: string;
  allowEmpty?: boolean;
  emptyText?: string;
  maxVisible?: number;
  disabled?: boolean;
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Escribe para filtrar...",
  emptyOptionLabel,
  allowEmpty = false,
  emptyText = "Sin coincidencias",
  maxVisible = 80,
  disabled = false,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, maxVisible);
    return options
      .filter((o) =>
        `${o.label} ${o.sublabel ?? ""} ${o.badge ?? ""} ${o.searchText ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, maxVisible);
  }, [options, query, maxVisible]);

  const totalMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.length;
    return options.filter((o) =>
      `${o.label} ${o.sublabel ?? ""} ${o.badge ?? ""} ${o.searchText ?? ""}`
        .toLowerCase()
        .includes(q)
    ).length;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery("");
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="ui-input flex items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          {selected ? (
            <div className="flex items-center gap-2 truncate">
              {selected.badge && (
                <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                  {selected.badge}
                </span>
              )}
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {selected.label}
              </span>
            </div>
          ) : (
            <span className="truncate text-slate-400 dark:text-slate-500">
              {emptyOptionLabel || placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="cf-animate-popover absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/10">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar filtro"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {allowEmpty && emptyOptionLabel && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  value === ""
                    ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span>{emptyOptionLabel}</span>
                {value === "" && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {emptyText}
              </p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200"
                        : "text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/80"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {opt.badge && (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {opt.badge}
                          </span>
                        )}
                        <span className="truncate font-semibold">
                          {opt.label}
                        </span>
                      </div>
                      {opt.sublabel && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {opt.sublabel}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </button>
                );
              })
            )}

            {totalMatches > maxVisible && (
              <p className="border-t border-slate-100 px-2.5 py-1.5 text-center text-[10px] text-amber-600 dark:border-slate-800 dark:text-amber-400">
                Mostrando {maxVisible} de {totalMatches}. Escribe para precisar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
