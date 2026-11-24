"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  History,
  RefreshCw,
  ShieldAlert,
  Warehouse,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import {
  DaysRemainingBadge,
  LotStatusBadge,
  SeverityBadge,
} from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import { formatCurrencyCOP, formatDateTimeES } from "@/lib/constants";
import { formatExpiryLabel } from "@/lib/packaging";

interface DashboardData {
  kpis: {
    totalActiveLots: number;
    totalBoxes: number;
    totalUnits: number;
    totalInventoryValue: number;
    expiredLotsCount: number;
    criticalLotsCount: number;
    upcoming30Count: number;
    upcoming60Count: number;
    healthyCount: number;
    quarantineCount: number;
    activeAlertsCount: number;
    pendingDamagedCount: number;
    totalDamagedLoss: number;
    totalInspectionsCount: number;
  };
  expiryDistribution: Array<{ label: string; count: number; color: string }>;
  categoryBreakdown: Array<{
    category: string;
    units: number;
    atRiskUnits: number;
  }>;
  warehouseSummary: Array<{
    id: string;
    code: string;
    name: string;
    totalLots: number;
    totalUnits: number;
    urgentLots: number;
  }>;
  urgentLots: Array<{
    id: string;
    lotNumber: string;
    boxes: number;
    looseUnits: number;
    totalUnits: number;
    quantityText: string;
    expiryDate: string;
    expiryPrecision: string;
    expiryDisplay: string | null;
    daysToExpiry: number;
    status: string;
    locationCode: string | null;
    product: { name: string; sku: string; unitsPerBox: number };
    warehouse: { name: string };
  }>;
  activeAlerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    entityType: string;
    action: string;
    actor: string;
    summary: string;
    createdAt: string;
  }>;
}

export default function DashboardPage() {
  const { notify } = useToast();
  const { refreshAlertsCount } = useAppSession();
  const [data, setData] = useState<DashboardData | null>(
    () => getCached<DashboardData>("dashboard:summary") ?? null
  );
  const [loading, setLoading] = useState(() => !getCached("dashboard:summary"));
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (force = false) => {
    if (!getCached("dashboard:summary")) {
      setLoading(true);
    }
    try {
      const json = await fetchWithCache<DashboardData | null>(
        "dashboard:summary",
        async () => {
          const res = await fetch("/api/dashboard");
          if (!res.ok) return null;
          return res.json();
        },
        { force, ttlMs: 15_000 }
      );
      if (json) {
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard(false);
  }, [fetchDashboard]);

  const handleSyncAlerts = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: "Panel Principal" }),
      });
      if (res.ok) {
        const json = await res.json();
        const msg = `Análisis completado: ${json.result.scannedLots} lotes verificados, ${json.result.createdAlerts} alertas nuevas.`;
        setSyncMsg(msg);
        notify({
          title: "Análisis de vencimientos completado",
          description: msg,
          variant: "success",
        });
        invalidateCache("dashboard:");
        invalidateCache("alerts:");
        invalidateCache("inventory:");
        await Promise.all([fetchDashboard(true), refreshAlertsCount()]);
      } else {
        notify({
          title: "No se pudo ejecutar el análisis",
          description: "Inténtalo nuevamente en unos segundos.",
          variant: "error",
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-8 w-72 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300">
        No se pudo cargar el panel de indicadores. Verifique la conexión con la
        base de datos.
      </div>
    );
  }

  const { kpis } = data;
  const totalBuckets = Math.max(
    1,
    data.expiryDistribution.reduce((acc, b) => acc + b.count, 0)
  );

  return (
    <div className="space-y-6">
      {/* Encabezado y barra de acciones */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[26px]">
            Dashboard de Control — Corta Fecha
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Visibilidad en tiempo real de vencimientos, inventario multi-empaque
            (CJ, PC, DPL, DISP, BL, UN), inspecciones y averías.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={handleSyncAlerts}
            disabled={syncing}
            className="ui-btn ui-btn-primary w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Analizando..." : "Ejecutar Análisis"}
          </button>

          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900 sm:flex sm:flex-wrap sm:items-center">
            <a
              href="/api/reports/export?type=corta_fecha"
              className="ui-btn ui-btn-emerald-soft border-0 px-2 py-2 text-xs sm:px-2.5 sm:py-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Excel</span>
            </a>
            <a
              href="/api/reports/export?type=corta_fecha&format=pdf"
              className="ui-btn ui-btn-rose-soft border-0 px-2 py-2 text-xs sm:px-2.5 sm:py-1.5"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">PDF</span>
            </a>
            <a
              href="/api/reports/export?type=general"
              className="ui-btn ui-btn-emerald px-2 py-2 text-xs sm:px-2.5 sm:py-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">General</span>
            </a>
          </div>
        </div>
      </div>

      {syncMsg && (
        <div
          role="status"
          className="cf-animate-popover flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span>{syncMsg}</span>
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Link
          href="/inventario?expiryWindow=15"
          className="ui-card-interactive group flex flex-col justify-between border-l-4 border-l-red-500 p-3.5 sm:p-4"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 sm:text-[11px]">
                Riesgo Crítico (≤15d)
              </span>
              <span className="shrink-0 rounded-lg bg-red-50 p-1.5 text-red-600 dark:bg-red-950/70 dark:text-red-400">
                <AlertOctagon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {kpis.expiredLotsCount + kpis.criticalLotsCount}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs">
            <span className="truncate">
              {kpis.expiredLotsCount} vencidos · {kpis.criticalLotsCount}{" "}
              críticos
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-red-600 dark:group-hover:text-red-400" />
          </div>
        </Link>

        <Link
          href="/inventario?expiryWindow=30"
          className="ui-card-interactive group flex flex-col justify-between border-l-4 border-l-amber-500 p-3.5 sm:p-4"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 sm:text-[11px]">
                Preventivo (16–30d)
              </span>
              <span className="shrink-0 rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {kpis.upcoming30Count}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs">
            <span className="truncate">+{kpis.upcoming60Count} en 31–60d</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
          </div>
        </Link>

        <Link
          href="/inventario"
          className="ui-card-interactive group flex flex-col justify-between border-l-4 border-l-indigo-500 p-3.5 sm:p-4"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 sm:text-[11px]">
                Inventario Activo
              </span>
              <span className="shrink-0 rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                <Boxes className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {kpis.totalUnits.toLocaleString("es-CO")}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs">
            <span className="tabular-nums truncate">
              {kpis.totalActiveLots} lotes ·{" "}
              {formatCurrencyCOP(kpis.totalInventoryValue)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </div>
        </Link>

        <Link
          href="/averias"
          className="ui-card-interactive group flex flex-col justify-between border-l-4 border-l-orange-500 p-3.5 sm:p-4"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 sm:text-[11px]">
                Averías Pendientes
              </span>
              <span className="shrink-0 rounded-lg bg-orange-50 p-1.5 text-orange-600 dark:bg-orange-950/70 dark:text-orange-400">
                <ShieldAlert className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {kpis.pendingDamagedCount}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs">
            <span className="tabular-nums truncate">
              Pérdida: {formatCurrencyCOP(kpis.totalDamagedLoss)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-600 dark:group-hover:text-orange-400" />
          </div>
        </Link>

        <Link
          href="/alertas"
          className="ui-card-interactive group col-span-2 flex flex-col justify-between border-l-4 border-l-slate-700 p-3.5 dark:border-l-slate-500 sm:col-span-2 sm:p-4 xl:col-span-1"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 sm:text-[11px]">
                Alertas e Inspecciones
              </span>
              <span className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {kpis.activeAlertsCount}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs">
            <span className="tabular-nums">
              Sin atender · {kpis.totalInspectionsCount} inspecciones
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          </div>
        </Link>
      </div>

      {/* Distribución por semáforo y resumen por bodega */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="ui-card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Semáforo de Vencimientos por Lote
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Distribución porcentual y cantidad de lotes activos por ventana
              </p>
            </div>
            <Link
              href="/inventario"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
            >
              Ver inventario completo <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700">
            {data.expiryDistribution.map((item) => {
              const pct = (item.count / totalBuckets) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={item.label}
                  className={`${item.color} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                  title={`${item.label}: ${item.count} lotes (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
            {data.expiryDistribution.map((item) => {
              const pct = Math.round((item.count / totalBuckets) * 100);
              return (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 transition-colors last:col-span-2 hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800 sm:last:col-span-1"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`}
                    />
                    <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                      {item.label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <p className="tabular-nums text-xl font-bold text-slate-900 dark:text-slate-100">
                      {item.count}
                    </p>
                    <span className="tabular-nums text-[11px] font-medium text-slate-400">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Exposición por Categoría (unidades totales vs. ≤30 días)
            </h3>
            <div className="mt-3 space-y-3">
              {data.categoryBreakdown.map((cat) => {
                const riskPct =
                  cat.units > 0
                    ? Math.round((cat.atRiskUnits / cat.units) * 100)
                    : 0;
                const barColor =
                  riskPct >= 50
                    ? "bg-red-500"
                    : riskPct >= 20
                    ? "bg-amber-500"
                    : "bg-emerald-500";
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {cat.category}
                      </span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {cat.atRiskUnits.toLocaleString("es-CO")}
                        </strong>{" "}
                        u. en riesgo de {cat.units.toLocaleString("es-CO")} u. (
                        {riskPct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.min(100, riskPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bodegas */}
        <div className="ui-card p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                <Warehouse className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Estado por Bodega
              </h2>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {data.warehouseSummary.map((wh) => (
              <div
                key={wh.id}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-colors hover:border-indigo-200 hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {wh.name}
                    </p>
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {wh.code}
                    </p>
                  </div>
                  {wh.urgentLots > 0 ? (
                    <span className="tabular-nums rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300">
                      {wh.urgentLots} urgentes
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Al día
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200/70 pt-3 text-xs dark:border-slate-700">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">
                      Lotes activos
                    </p>
                    <p className="tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {wh.totalLots}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 dark:text-slate-400">
                      Unidades totales
                    </p>
                    <p className="tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {wh.totalUnits.toLocaleString("es-CO")} u.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lotes prioritarios FEFO */}
      <div className="ui-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Lotes Prioritarios (Vencidos, ≤45 días o en Cuarentena)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ordenados por fecha de vencimiento más próxima (criterio FEFO).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/reports/export?type=expiring&days=30"
              className="ui-btn ui-btn-emerald-soft py-1.5 text-xs"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel próximos ≤30d
            </a>
            <a
              href="/api/reports/export?type=expiring&days=30&format=pdf"
              className="ui-btn ui-btn-rose-soft py-1.5 text-xs"
            >
              <FileText className="h-4 w-4" />
              PDF próximos ≤30d
            </a>
          </div>
        </div>

        {/* Vista móvil en tarjetas */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
          {data.urgentLots.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No hay lotes críticos o próximos a vencer en este momento.
            </div>
          ) : (
            data.urgentLots.map((lot) => (
              <div key={lot.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                      {lot.product.sku} · Lote {lot.lotNumber}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {lot.product.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lot.warehouse.name}
                      {lot.locationCode ? ` · ${lot.locationCode}` : ""}
                    </p>
                  </div>
                  <LotStatusBadge status={lot.status} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {lot.quantityText}
                    </p>
                    {lot.totalUnits > 0 && (
                      <p className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {lot.totalUnits} u. equivalentes
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {formatExpiryLabel(
                        lot.expiryDate,
                        lot.expiryPrecision,
                        lot.expiryDisplay
                      )}
                    </span>
                    <DaysRemainingBadge days={lot.daysToExpiry} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/inspecciones?lotId=${lot.id}`}
                    className="ui-btn ui-btn-secondary py-1.5 text-xs"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Inspeccionar
                  </Link>
                  <Link
                    href={`/averias?lotId=${lot.id}`}
                    className="ui-btn border border-orange-200 bg-orange-50 py-1.5 text-xs text-orange-800 hover:bg-orange-100 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-300 dark:hover:bg-orange-950"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Avería
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Vista escritorio tabla */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Código / Producto</th>
                <th className="px-4 py-3">Lote y Bodega</th>
                <th className="px-4 py-3">Cantidad Reportada</th>
                <th className="px-4 py-3">Fecha Vencimiento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.urgentLots.map((lot) => (
                <tr
                  key={lot.id}
                  className="transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                      {lot.product.sku}
                    </p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {lot.product.name}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {lot.lotNumber}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lot.warehouse.name}
                      {lot.locationCode ? ` · ${lot.locationCode}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {lot.quantityText}
                    </p>
                    {lot.totalUnits > 0 && (
                      <p className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                        {lot.totalUnits} u. equivalentes
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1">
                      <span className="tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300">
                        {formatExpiryLabel(
                          lot.expiryDate,
                          lot.expiryPrecision,
                          lot.expiryDisplay
                        )}
                        {lot.expiryPrecision === "MES_ANO" && (
                          <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Mes/Año
                          </span>
                        )}
                      </span>
                      <DaysRemainingBadge days={lot.daysToExpiry} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <LotStatusBadge status={lot.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/inspecciones?lotId=${lot.id}`}
                        className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Inspeccionar
                      </Link>
                      <Link
                        href={`/averias?lotId=${lot.id}`}
                        className="ui-btn border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800 hover:bg-orange-100 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-300 dark:hover:bg-orange-950"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Avería
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {data.urgentLots.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No hay lotes críticos o próximos a vencer en este momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alertas activas y actividad reciente */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-red-50 p-1.5 text-red-600 dark:bg-red-950/70 dark:text-red-400">
                <Bell className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Alertas Automáticas Activas
              </h2>
            </div>
            <Link
              href="/alertas"
              className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Gestionar todas →
            </Link>
          </div>
          <div className="mt-4 space-y-2.5">
            {data.activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {alert.title}
                  </p>
                  <SeverityBadge severity={alert.severity} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {alert.message}
                </p>
              </div>
            ))}
            {data.activeAlerts.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Todas las alertas han sido atendidas.
              </div>
            )}
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                <History className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Historial Reciente de Operaciones
              </h2>
            </div>
            <Link
              href="/historial"
              className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Ver auditoría →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {data.recentActivity.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    {act.summary}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {act.actor} · {act.entityType}
                  </p>
                </div>
                <span className="tabular-nums shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                  {formatDateTimeES(act.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
