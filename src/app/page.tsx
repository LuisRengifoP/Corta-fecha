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
  Eye,
  History,
  Layers,
  MapPin,
  Package,
  RefreshCw,
  ShieldAlert,
  Warehouse,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import {
  DaysRemainingBadge,
  InspectionStatusBadge,
  LotStatusBadge,
  SeverityBadge,
} from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { DonutSegment, ExpiryDonutChart } from "@/components/ui/Charts";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { EntityTimeline } from "@/components/ui/EntityTimeline";
import { KpiCard } from "@/components/ui/KpiCard";
import { ExportActions, PageHeader } from "@/components/ui/PageHeader";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import {
  formatCurrencyCOP,
  formatDateTimeES,
  INSPECTION_TYPE_LABELS,
} from "@/lib/constants";
import { formatExpiryLabel } from "@/lib/packaging";

interface UrgentLot {
  id: string;
  lotNumber: string;
  boxes: number;
  packs: number;
  dispacks: number;
  displays: number;
  bags: number;
  looseUnits: number;
  totalUnits: number;
  quantityText: string;
  expiryDate: string;
  expiryPrecision: string;
  expiryDisplay: string | null;
  daysToExpiry: number;
  status: string;
  locationCode: string | null;
  notes: string | null;
  product: { name: string; sku: string; unitsPerBox: number; unitCost: number };
  warehouse: { name: string };
}

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
  urgentLots: UrgentLot[];
  activeAlerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    createdAt: string;
  }>;
  recentInspections?: Array<{
    id: string;
    inspectorName: string;
    inspectionType: string;
    status: string;
    inspectedAt: string;
    lot: { lotNumber: string; product: { name: string } } | null;
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

const BUCKET_META: Record<
  string,
  { stroke: string; dotClass: string; href: string }
> = {
  Vencidos: {
    stroke: "#ef4444",
    dotClass: "bg-red-500",
    href: "/inventario?expiryWindow=expired",
  },
  "Críticos (0-15d)": {
    stroke: "#f97316",
    dotClass: "bg-orange-500",
    href: "/inventario?expiryWindow=15",
  },
  "Preventivo (16-30d)": {
    stroke: "#f59e0b",
    dotClass: "bg-amber-400",
    href: "/inventario?expiryWindow=30",
  },
  "Observación (31-60d)": {
    stroke: "#0ea5e9",
    dotClass: "bg-sky-500",
    href: "/inventario?expiryWindow=60",
  },
  "Vigentes (>60d)": {
    stroke: "#10b981",
    dotClass: "bg-emerald-500",
    href: "/inventario?status=ACTIVO",
  },
};

export default function DashboardPage() {
  const { notify } = useToast();
  const { warehouseName, refreshAlertsCount } = useAppSession();
  const [data, setData] = useState<DashboardData | null>(
    () => getCached<DashboardData>("dashboard:summary") ?? null
  );
  const [loading, setLoading] = useState(() => !getCached("dashboard:summary"));
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [selectedLot, setSelectedLot] = useState<UrgentLot | null>(null);

  const fetchDashboard = useCallback(async (force = false) => {
    if (!getCached("dashboard:summary")) {
      setLoading(true);
    }
    try {
      const json = await fetchWithCache<DashboardData | null>(
        "dashboard:summary",
        async () => {
          const res = await fetch("/api/dashboard");
          if (!res.ok) throw new Error("No se pudo cargar el dashboard");
          return res.json();
        },
        { force, ttlMs: 15_000 }
      );
      if (json) {
        setData(json);
      }
    } catch {
      // Mantiene el estado anterior si ya había datos cacheados
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
        const errJson = await res.json().catch(() => ({}));
        notify({
          title: "No se pudo ejecutar el análisis",
          description:
            errJson.error || "Inténtalo nuevamente en unos segundos.",
          variant: "error",
        });
      }
    } catch {
      notify({
        title: "Error de conexión",
        description:
          "No se pudo conectar con el servidor para ejecutar el análisis.",
        variant: "error",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-72 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800 lg:col-span-2" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ui-card border-red-200 bg-red-50/70 p-6 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
        No se pudo cargar el panel de indicadores. Verifique la conexión con la
        base de datos.
      </div>
    );
  }

  const { kpis } = data;
  const donutSegments: DonutSegment[] = data.expiryDistribution.map((b) => {
    const meta = BUCKET_META[b.label] ?? {
      stroke: "#6366f1",
      dotClass: "bg-indigo-500",
      href: "/inventario",
    };
    return {
      label: b.label,
      value: b.count,
      stroke: meta.stroke,
      dotClass: meta.dotClass,
      href: meta.href,
    };
  });

  const sortedCategories = [...data.categoryBreakdown].sort(
    (a, b) => b.atRiskUnits - a.atRiskUnits || b.units - a.units
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard de Control"
        badge={warehouseName}
        description="Visibilidad ejecutiva de vencimientos FEFO, stock multi-empaque, inspecciones y averías en tiempo real."
        exports={[
          {
            label: "Corta Fecha",
            href: "/api/reports/export?type=corta_fecha",
            format: "xlsx",
          },
          {
            label: "PDF",
            href: "/api/reports/export?type=corta_fecha&format=pdf",
            format: "pdf",
          },
          {
            label: "General",
            href: "/api/reports/export?type=general",
            format: "xlsx",
          },
        ]}
        primaryAction={
          <button
            type="button"
            onClick={handleSyncAlerts}
            disabled={syncing}
            className="ui-btn ui-btn-primary"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Analizando..." : "Ejecutar Análisis"}
          </button>
        }
      />

      {syncMsg && (
        <div
          role="status"
          className="cf-animate-popover flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm font-medium text-indigo-900 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span>{syncMsg}</span>
        </div>
      )}

      {/* KPIs principales estilo Stripe */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <KpiCard
          label="Riesgo Crítico (≤15d)"
          value={kpis.expiredLotsCount + kpis.criticalLotsCount}
          sublabel={`${kpis.expiredLotsCount} vencidos · ${kpis.criticalLotsCount} críticos`}
          icon={<AlertOctagon className="h-4 w-4" />}
          tone="red"
          href="/inventario?expiryWindow=critical"
        />
        <KpiCard
          label="Preventivo (16–30d)"
          value={kpis.upcoming30Count}
          sublabel={`+${kpis.upcoming60Count} en ventana 31–60d`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="amber"
          href="/inventario?expiryWindow=30"
        />
        <KpiCard
          label="Inventario Activo"
          value={kpis.totalUnits.toLocaleString("es-CO")}
          sublabel={`${kpis.totalActiveLots} lotes · ${formatCurrencyCOP(
            kpis.totalInventoryValue
          )}`}
          icon={<Boxes className="h-4 w-4" />}
          tone="indigo"
          href="/inventario"
        />
        <KpiCard
          label="Averías Pendientes"
          value={kpis.pendingDamagedCount}
          sublabel={`Pérdida: ${formatCurrencyCOP(kpis.totalDamagedLoss)}`}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone="orange"
          href="/averias"
        />
        <KpiCard
          label="Alertas Activas"
          value={kpis.activeAlertsCount}
          sublabel={`${kpis.totalInspectionsCount} inspecciones registradas`}
          icon={<Bell className="h-4 w-4" />}
          tone="sky"
          href="/alertas"
          className="col-span-2 xl:col-span-1"
        />
      </div>

      {/* Semáforo + Categorías y Bodegas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="ui-card flex flex-col justify-between p-5 lg:col-span-2">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Semáforo General de Vencimientos
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distribución por ventana FEFO — pulsa un segmento para filtrar
                  lotes
                </p>
              </div>
              <Link
                href="/inventario"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Ver inventario <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-5">
              <ExpiryDonutChart
                segments={donutSegments}
                centerValue={kpis.totalActiveLots}
                centerLabel="Lotes activos"
              />
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Distribución por Categoría (en riesgo ≤30d vs. total)
                </h3>
              </div>
              <span className="tabular-nums text-[11px] text-slate-400">
                {sortedCategories.length} categorías
              </span>
            </div>

            {sortedCategories.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                No hay categorías con stock activo.
              </p>
            ) : (
              <div className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
                {sortedCategories.map((cat) => {
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
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {cat.category}
                        </span>
                        <span className="tabular-nums text-slate-500 dark:text-slate-400">
                          <strong className="text-slate-900 dark:text-slate-100">
                            {cat.atRiskUnits.toLocaleString("es-CO")}
                          </strong>{" "}
                          / {cat.units.toLocaleString("es-CO")} u. ({riskPct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${Math.min(100, riskPct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Estado por Bodega + Inspecciones recientes */}
        <div className="flex flex-col gap-6">
          <div className="ui-card p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                  <Warehouse className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Estado por Bodega
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Consolidado físico y urgencia
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {data.warehouseSummary.map((wh) => {
                const urgentRatio =
                  wh.totalLots > 0
                    ? Math.round((wh.urgentLots / wh.totalLots) * 100)
                    : 0;
                return (
                  <div
                    key={wh.id}
                    className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {wh.name}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {wh.code}
                        </p>
                      </div>
                      {wh.urgentLots > 0 ? (
                        <span className="tabular-nums rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300">
                          {wh.urgentLots} urgentes
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Al día
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-2.5 text-xs dark:border-slate-800">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Lotes
                        </p>
                        <p className="tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {wh.totalLots}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Unidades
                        </p>
                        <p className="tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {wh.totalUnits.toLocaleString("es-CO")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          En riesgo
                        </p>
                        <p className="tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {urgentRatio}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ui-card flex-1 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/70 dark:text-teal-400">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Últimas Inspecciones
                </h2>
              </div>
              <Link
                href="/inspecciones"
                className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Ver todas →
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {!data.recentInspections || data.recentInspections.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  Sin inspecciones registradas aún.
                </p>
              ) : (
                data.recentInspections.slice(0, 4).map((insp) => (
                  <div
                    key={insp.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        {insp.lot
                          ? `${insp.lot.product.name}`
                          : "Inspección general"}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {INSPECTION_TYPE_LABELS[insp.inspectionType] ??
                          insp.inspectionType}{" "}
                        · {insp.inspectorName}
                      </p>
                    </div>
                    <InspectionStatusBadge status={insp.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lotes prioritarios FEFO */}
      <div className="ui-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Lotes Prioritarios FEFO
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vencidos, próximos ≤45 días o en cuarentena. Pulsa un lote para
              abrir su ficha operativa.
            </p>
          </div>
          <ExportActions
            items={[
              {
                label: "Excel ≤30d",
                href: "/api/reports/export?type=expiring&days=30",
                format: "xlsx",
              },
              {
                label: "PDF ≤30d",
                href: "/api/reports/export?type=expiring&days=30&format=pdf",
                format: "pdf",
              },
            ]}
          />
        </div>

        {/* Vista móvil en tarjetas */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
          {data.urgentLots.length === 0 ? (
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="Sin lotes prioritarios"
              description="No hay lotes vencidos, críticos ni en cuarentena en este momento."
            />
          ) : (
            data.urgentLots.map((lot) => (
              <div key={lot.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLot(lot)}
                    className="min-w-0 text-left"
                  >
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
                  </button>
                  <LotStatusBadge status={lot.status} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
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
                    <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                      {formatExpiryLabel(
                        lot.expiryDate,
                        lot.expiryPrecision,
                        lot.expiryDisplay
                      )}
                    </span>
                    <DaysRemainingBadge days={lot.daysToExpiry} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLot(lot)}
                    className="ui-btn ui-btn-secondary py-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ficha
                  </button>
                  <Link
                    href={`/inspecciones?lotId=${lot.id}`}
                    className="ui-btn ui-btn-secondary py-1.5 text-xs"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Inspec.
                  </Link>
                  <Link
                    href={`/averias?lotId=${lot.id}`}
                    className="ui-btn ui-btn-secondary py-1.5 text-xs text-orange-700 dark:text-orange-300"
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
                <th className="px-4 py-3">Lote y Ubicación</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Vencimiento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.urgentLots.map((lot) => (
                <tr
                  key={lot.id}
                  onClick={() => setSelectedLot(lot)}
                  className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
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
                      </span>
                      <DaysRemainingBadge days={lot.daysToExpiry} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <LotStatusBadge status={lot.status} />
                  </td>
                  <td
                    className="px-4 py-3.5 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1.5">
                      <Link
                        href={`/inspecciones?lotId=${lot.id}`}
                        className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Inspeccionar
                      </Link>
                      <Link
                        href={`/averias?lotId=${lot.id}`}
                        className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs text-orange-700 hover:border-orange-300 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
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
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Package className="h-6 w-6" />}
                      title="Sin lotes prioritarios"
                      description="No hay lotes críticos o próximos a vencer en este momento."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alertas pendientes y actividad reciente */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/70 dark:text-red-400">
                <Bell className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Alertas Pendientes
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
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800/70"
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
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
                title="Todo al día"
                description="Todas las alertas han sido atendidas."
              />
            )}
          </div>
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                <History className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Actividad Reciente
              </h2>
            </div>
            <Link
              href="/historial"
              className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Ver auditoría →
            </Link>
          </div>
          <div className="mt-4">
            {data.recentActivity.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6" />}
                title="Sin actividad reciente"
              />
            ) : (
              <ol className="relative ml-2 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
                {data.recentActivity.slice(0, 8).map((act) => (
                  <li key={act.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500 dark:border-[#111622]" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-xs font-medium text-slate-900 dark:text-slate-100">
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
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* Ficha rápida de Lote Prioritario */}
      <DetailDrawer
        open={Boolean(selectedLot)}
        onClose={() => setSelectedLot(null)}
        title={selectedLot ? `Lote ${selectedLot.lotNumber}` : ""}
        subtitle={
          selectedLot
            ? `${selectedLot.product.sku} — ${selectedLot.product.name}`
            : undefined
        }
        icon={<Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
        badge={
          selectedLot && (
            <>
              <LotStatusBadge status={selectedLot.status} />
              <DaysRemainingBadge days={selectedLot.daysToExpiry} />
            </>
          )
        }
        footer={
          selectedLot && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Link
                href={`/inspecciones?lotId=${selectedLot.id}`}
                className="ui-btn ui-btn-secondary text-xs"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Inspeccionar
              </Link>
              <Link
                href={`/averias?lotId=${selectedLot.id}`}
                className="ui-btn ui-btn-secondary text-xs text-orange-700 dark:text-orange-300"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Reportar avería
              </Link>
              <Link
                href={`/inventario?lotId=${selectedLot.id}`}
                className="ui-btn ui-btn-primary col-span-2 text-xs sm:col-span-1"
              >
                Abrir en Inventario
              </Link>
            </div>
          )
        }
      >
        {selectedLot && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Stock Reportado
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {selectedLot.quantityText}
                </p>
                <p className="tabular-nums text-[11px] text-slate-500">
                  {selectedLot.totalUnits} u. equivalentes
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Vencimiento
                </p>
                <p className="tabular-nums mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {formatExpiryLabel(
                    selectedLot.expiryDate,
                    selectedLot.expiryPrecision,
                    selectedLot.expiryDisplay
                  )}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {selectedLot.warehouse.name}
                  {selectedLot.locationCode
                    ? ` · ${selectedLot.locationCode}`
                    : ""}
                </p>
              </div>
            </div>

            {selectedLot.notes && (
              <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Observaciones
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  {selectedLot.notes}
                </p>
              </div>
            )}

            <div>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Trazabilidad del Lote
              </h3>
              <EntityTimeline entityId={selectedLot.id} />
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
