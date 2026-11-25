"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, FileText, FilterX, History, Search } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { fetchWithCache, getCached } from "@/lib/client-cache";
import { ENTITY_TYPE_LABELS, formatDateTimeES } from "@/lib/constants";

interface ActivityEntry {
  id: string;
  entityType: string;
  action: string;
  actor: string;
  summary: string;
  createdAt: string;
}

interface ActivityResponse {
  logs: ActivityEntry[];
  total: number;
  page: number;
}

export default function HistorialPage() {
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const initialCacheKey = `activity:::${page}:${pageSize}`;
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
    const cacheKey = `activity:${entityType}:${debouncedSearch}:${page}:${pageSize}`;
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
  }, [entityType, debouncedSearch, page, pageSize]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const hasFilters = Boolean(search || entityType);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Historial de Actividades y Auditoría
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Trazabilidad completa de movimientos de inventario, inspecciones,
            averías, alertas atendidas y descargas de reportes.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <a
            href="/api/reports/export?type=activity"
            className="ui-btn ui-btn-emerald"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            <span className="truncate">Excel (.xlsx)</span>
          </a>
          <a
            href="/api/reports/export?type=activity&format=pdf"
            className="ui-btn ui-btn-rose"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">PDF (.pdf)</span>
          </a>
        </div>
      </div>

      {/* Filtros */}
      <div className="ui-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por responsable, producto o descripción..."
              className="ui-input pl-9"
            />
          </div>
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar historial por módulo"
            className="ui-select"
          >
            <option value="">Todos los módulos</option>
            {Object.entries(ENTITY_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <div className="mt-3 flex justify-end border-t border-slate-100 pt-2.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setEntityType("");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
            >
              <FilterX className="h-3.5 w-3.5" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Vista móvil en tarjetas */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando historial...
          </div>
        ) : logs.length === 0 ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <History className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-slate-600" />
            No se encontraron registros de actividad.
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="ui-card space-y-2 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType}
                </span>
                <span className="tabular-nums text-slate-400 dark:text-slate-500">
                  {formatDateTimeES(log.createdAt)}
                </span>
              </div>
              <p className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">
                {log.action}
              </p>
              <p className="break-words text-slate-700 dark:text-slate-300">{log.summary}</p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Responsable: {log.actor}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Tabla escritorio */}
      <div className="ui-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Fecha y Hora</th>
                <th className="px-4 py-3">Módulo</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Detalle del Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    Cargando historial...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    <History className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-slate-600" />
                    No se encontraron registros de actividad.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}
