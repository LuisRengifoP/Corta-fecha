"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Package,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { getCached } from "@/lib/client-cache";

interface QuickLotItem {
  id: string;
  lotNumber: string;
  quantityText: string;
  status: string;
  product: { name: string; sku: string };
}

const COMMAND_ROUTES = [
  {
    href: "/",
    title: "Panel Principal",
    desc: "Resumen ejecutivo, semáforo FEFO y KPIs",
    icon: LayoutDashboard,
  },
  {
    href: "/inventario",
    title: "Inventario y Lotes",
    desc: "Catálogo, multi-empaque y fechas de vencimiento",
    icon: Package,
  },
  {
    href: "/alertas",
    title: "Alertas Automáticas",
    desc: "Vencimientos ≤60d y notificaciones Telegram",
    icon: Bell,
  },
  {
    href: "/inspecciones",
    title: "Control de Inspecciones",
    desc: "Verificaciones físicas y ajuste de stock",
    icon: ClipboardCheck,
  },
  {
    href: "/averias",
    title: "Productos Averiados",
    desc: "Novedades físicas, pérdidas y cuarentena",
    icon: ShieldAlert,
  },
  {
    href: "/historial",
    title: "Historial de Auditoría",
    desc: "Trazabilidad completa de movimientos",
    icon: History,
  },
  {
    href: "/reportes",
    title: "Centro de Reportes",
    desc: "Planillas oficiales en Excel y PDF",
    icon: FileSpreadsheet,
  },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [lots, setLots] = useState<QuickLotItem[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 10);
    const cached = getCached<QuickLotItem[]>("inventory:::");
    if (cached && cached.length > 0) {
      setLots(cached);
    } else {
      fetch("/api/inventory")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j?.lots) setLots(j.lots);
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();

  const matchingRoutes = useMemo(() => {
    if (!q) return COMMAND_ROUTES;
    return COMMAND_ROUTES.filter((r) =>
      `${r.title} ${r.desc}`.toLowerCase().includes(q)
    );
  }, [q]);

  const matchingLots = useMemo(() => {
    if (!q) return lots.slice(0, 4);
    return lots
      .filter((l) =>
        `${l.lotNumber} ${l.product.sku} ${l.product.name}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 6);
  }, [lots, q]);

  if (!open) return null;

  const navigate = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div
      className="cf-animate-fade fixed inset-0 z-[75] flex items-start justify-center bg-slate-900/55 p-4 pt-[12vh] backdrop-blur-[2px] dark:bg-black/75"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda rápida del sistema"
      onClick={onClose}
    >
      <div
        className="cf-animate-modal w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111622]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ir a módulo o buscar SKU, producto o número de lote..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              ESC
            </kbd>
          )}
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-3">
          {matchingRoutes.length > 0 && (
            <div>
              <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Módulos del sistema
              </p>
              <div className="space-y-0.5">
                {matchingRoutes.map((route) => {
                  const Icon = route.icon;
                  return (
                    <button
                      key={route.href}
                      type="button"
                      onClick={() => navigate(route.href)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-100/90 dark:hover:bg-slate-800/70"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {route.title}
                          </p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {route.desc}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {matchingLots.length > 0 && (
            <div>
              <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Lotes en inventario
              </p>
              <div className="space-y-0.5">
                {matchingLots.map((lot) => (
                  <button
                    key={lot.id}
                    type="button"
                    onClick={() =>
                      navigate(
                        `/inventario?lotId=${encodeURIComponent(lot.id)}`
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                          {lot.product.sku}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          Lote {lot.lotNumber}
                        </span>
                      </div>
                      <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                        {lot.product.name}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {lot.quantityText}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchingRoutes.length === 0 && matchingLots.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No se encontraron módulos ni lotes para &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
