"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  GitCommitHorizontal,
  History,
  LayoutList,
  Package,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Pagination } from "@/components/Pagination";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchWithCache, getCached } from "@/lib/client-cache";
import {
  ENTITY_TYPE_LABELS,
  formatDateES,
  formatDateTimeES,
} from "@/lib/constants";

interface ActivityEntry {
  id: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  actor: string;
  summary: string;
  details?: string | null;
  createdAt: string;
}

interface ActivityResponse {
  logs: ActivityEntry[];
  total: number;
  page: number;
}

const ENTITY_ICON_MAP: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  LOTE: {
    icon: Package,
    tone: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400",
  },
  PRODUCTO: {
    icon: Package,
    tone: "bg-sky-50 text-sky-600 dark:bg-sky-950/70 dark:text-sky-400",
  },
  INSPECCION: {
    icon: ClipboardCheck,
    tone: "bg-teal-50 text-teal-600 dark:bg-teal-950/70 dark:text-teal-400",
  },
  AVERIA: {
    icon: ShieldAlert,
    tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/70 dark:text-orange-400",
  },
  ALERTA: {
    icon: Bell,
    tone: "bg-red-50 text-red-600 dark:bg-red-950/70 dark:text-red-400",
  },
  REPORTE: {
    icon: FileSpreadsheet,
    tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400",
  },
  SISTEMA: {
    icon: Wrench,
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

export default function HistorialPage() {
  const { warehouseName } = useAppSession();
  const [entityType, setEntityType] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedLog, setSelectedLog] = useState<ActivityEntry | null>(null);

  const initialCacheKey = `activity:::::${page}:${pageSize}`;
  const [logs, setLogs] = useState<ActivityEntry[]>(
    () => getCached<ActivityResponse>(initialCacheKey)?.logs ?? []
  );
  const [totalItems, setTotalItems] = useState(
    () => getCached<ActivityResponse>(initialCacheKey)?.total ?? 0
  );
  const [loading, setLoading] = useState(() => !getCached(initialCacheKey));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadLogs = useCallback(async () => {
    const cacheKey = `activity:${entityType}:${actionFilter}:${dateFrom}:${dateTo}:${debouncedSearch}:${page}:${pageSize}`;
    if (!getCached(cacheKey)) {
      setLoading(true);
    }
    try {
      const json = await fetchWithCache<ActivityResponse | null>(
        cacheKey,
        async () => {
          const q = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
          });
          if (entityType) q.set("entityType", entityType);
          if (actionFilter) q.set("action", actionFilter);
          if (dateFrom) q.set("dateFrom", dateFrom);
          if (dateTo) q.set("dateTo", dateTo);
          if (debouncedSearch) q.set("search", debouncedSearch);
          const res = await fetch(`/api/activity?${q.toString()}`);
          if (!res.ok) throw new Error("No se pudo consultar el historial");
          return res.json();
        },
        { ttlMs: 10_000 }
      );
      if (json) {
        setLogs(json.logs ?? []);
        setTotalItems(json.total ?? 0);
        if (json.page && json.page !== page) {
          setPage(json.page);
        }
      }
    } catch {
      // Ignorar fallo transitorio sin sobrescribir caché
    } finally {
      setLoading(false);
    }
  }, [entityType, actionFilter, dateFrom, dateTo, debouncedSearch, page, pageSize]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const log of logs) {
      const dayKey = formatDateES(log.createdAt);
      const list = map.get(dayKey) ?? [];
      list.push(log);
      map.set(dayKey, list);
    }
    return Array.from(map.entries());
  }, [logs]);

  const parsedDetails = useMemo(() => {
    if (!selectedLog?.details) return null;
    try {
      return JSON.stringify(JSON.parse(selectedLog.details), null, 2);
    } catch {
      return selectedLog.details;
    }
  }, [selectedLog]);

  const hasFilters = Boolean(
    search || entityType || actionFilter || dateFrom || dateTo
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial y Auditoría"
        badge={warehouseName}
        description="Trazabilidad cronológica completa de inventario, inspecciones, averías, alertas y exportaciones."
        exports={[
          {
            label: "Excel (.xlsx)",
            href: "/api/reports/export?type=activity",
            format: "xlsx",
          },
          {
            label: "PDF (.pdf)",
            href: "/api/reports/export?type=activity&format=pdf",
            format: "pdf",
          },
        ]}
      />

      {/* Filtros avanzados y selector de vista */}
      <FilterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Buscar por responsable, producto, acción o descripción..."
        resultCount={totalItems}
        resultLabel="evento(s) registrados"
        hasActiveFilters={hasFilters}
        onClearFilters={() => {
          setSearch("");
          setEntityType("");
          setActionFilter("");
          setDateFrom("");
          setDateTo("");
          setPage(1);
        }}
        tabs={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setEntityType("");
                  setPage(1);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  entityType === ""
                    ? "bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                    : "text-slate-600 hover:bg-white/60 dark:text-slate-400"
                }`}
              >
                Todos
              </button>
              {Object.entries(ENTITY_TYPE_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setEntityType(k);
                    setPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    entityType === k
                      ? "bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                      : "text-slate-600 hover:bg-white/60 dark:text-slate-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  viewMode === "timeline"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                Línea de tiempo
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  viewMode === "table"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Tabla
              </button>
            </div>
          </div>
        }
        filters={
          <>
            <input
              type="text"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Acción (ej. CREAR, ELIMINAR)"
              aria-label="Filtrar por acción"
              className="ui-input sm:w-44"
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Fecha desde"
              title="Desde fecha"
              className="ui-input sm:w-36"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="Fecha hasta"
              title="Hasta fecha"
              className="ui-input sm:w-36"
            />
          </>
        }
      />

      {/* Vista Línea de Tiempo */}
      {viewMode === "timeline" ? (
        loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando historial...
          </div>
        ) : logs.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon={<History className="h-6 w-6" />}
              title="No se encontraron eventos"
              description="Ajusta los filtros de fecha, módulo o búsqueda."
            />
          </div>
        ) : (
          <div className="space-y-5">
            {groupedByDay.map(([day, items]) => (
              <div key={day} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {day}
                  </span>
                  <div className="h-px flex-1 bg-slate-200/80 dark:bg-slate-800" />
                  <span className="tabular-nums text-[11px] text-slate-400">
                    {items.length} evento(s)
                  </span>
                </div>

                <div className="ui-card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
                  {items.map((log) => {
                    const meta =
                      ENTITY_ICON_MAP[log.entityType] ??
                      ENTITY_ICON_MAP.SISTEMA;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="flex cursor-pointer items-start justify-between gap-3 p-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {ENTITY_TYPE_LABELS[log.entityType] ??
                                  log.entityType}
                              </span>
                              <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                                {log.action}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-sm text-slate-800 dark:text-slate-200">
                              {log.summary}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Responsable: <strong>{log.actor}</strong>
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">
                            {formatDateTimeES(log.createdAt)}
                          </span>
                          <Eye className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Vista Tabla Consistente */
        <div className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3">Módulo</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Detalle del Evento</th>
                  <th className="px-4 py-3 text-right">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                    >
                      Cargando historial...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<History className="h-6 w-6" />}
                        title="No se encontraron eventos"
                        description="Ajusta los filtros aplicados para ver más resultados."
                      />
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                    >
                      <td className="tabular-nums whitespace-nowrap px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {formatDateTimeES(log.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-medium text-indigo-700 dark:text-indigo-400">
                        {log.action}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {log.actor}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                        {log.summary}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          aria-label="Inspeccionar evento"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        currentPage={page}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        itemLabel="eventos"
      />

      {/* Drawer Detalle del Evento de Auditoría */}
      <DetailDrawer
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? selectedLog.action : ""}
        subtitle={
          selectedLog
            ? `${formatDateTimeES(selectedLog.createdAt)} · ${selectedLog.actor}`
            : undefined
        }
        icon={<History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
        badge={
          selectedLog && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {ENTITY_TYPE_LABELS[selectedLog.entityType] ??
                selectedLog.entityType}
            </span>
          )
        }
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Resumen del Evento
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {selectedLog.summary}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <dl className="space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Responsable:</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedLog.actor}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Módulo:</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">
                    {ENTITY_TYPE_LABELS[selectedLog.entityType] ??
                      selectedLog.entityType}
                  </dd>
                </div>
                {selectedLog.entityId && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">ID Entidad:</dt>
                    <dd className="font-mono text-slate-700 dark:text-slate-300">
                      {selectedLog.entityId}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {parsedDetails && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Metadatos Técnicos
                </p>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
                  {parsedDetails}
                </pre>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
