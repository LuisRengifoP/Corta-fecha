"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import { SeverityBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { EntityTimeline } from "@/components/ui/EntityTimeline";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchWithCache, getCached, invalidateCache } from "@/lib/client-cache";
import { ALERT_TYPE_LABELS, formatDateTimeES } from "@/lib/constants";

interface TelegramConfigInfo {
  configured: boolean;
  chatIds: string[];
  displayRecipient: string;
}

interface AutoTelegramResultInfo {
  sent?: boolean;
  count?: number;
  displayRecipient?: string;
}

interface AlertItem {
  id: string;
  lotId: string | null;
  type: string;
  severity: string;
  title: string;
  message: string;
  daysToExpiry: number | null;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  emailSentAt: string | null;
  createdAt: string;
  lot: {
    id: string;
    lotNumber: string;
    totalUnits: number;
    product: { name: string; sku: string };
    warehouse: { name: string };
  } | null;
}

interface AlertsResponse {
  alerts: AlertItem[];
  autoTelegramResult?: AutoTelegramResultInfo | null;
  telegramConfig?: TelegramConfigInfo;
}

export default function AlertasPage() {
  const { notify } = useToast();
  const { user, warehouseName, refreshAlertsCount } = useAppSession();
  const [actorName, setActorName] = useState(
    () => user?.fullName || "Encargada Distrimarcas"
  );
  const [editingActor, setEditingActor] = useState(false);

  useEffect(() => {
    if (user?.fullName) {
      setActorName((prev) =>
        prev === "Encargada Distrimarcas" ? user.fullName : prev
      );
    }
  }, [user?.fullName]);

  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [alerts, setAlerts] = useState<AlertItem[]>(
    () => getCached<AlertsResponse>("alerts:false:")?.alerts ?? []
  );
  const [telegramConfig, setTelegramConfig] =
    useState<TelegramConfigInfo | null>(
      () => getCached<AlertsResponse>("alerts:false:")?.telegramConfig ?? null
    );
  const [loading, setLoading] = useState(() => !getCached("alerts:false:"));
  const [syncing, setSyncing] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [deletingAlert, setDeletingAlert] = useState<AlertItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [banner, setBanner] = useState<{
    type: "info" | "warn";
    text: string;
  } | null>(null);

  const loadAlerts = useCallback(
    async (force = false) => {
      const cacheKey = `alerts:${showAcknowledged}:${severityFilter}`;
      if (!getCached(cacheKey)) {
        setLoading(true);
      }
      try {
        const json = await fetchWithCache<AlertsResponse | null>(
          cacheKey,
          async () => {
            const q = new URLSearchParams({
              acknowledged: String(showAcknowledged),
            });
            if (severityFilter) q.set("severity", severityFilter);
            const res = await fetch(`/api/alerts?${q.toString()}`);
            if (!res.ok) throw new Error("No se pudieron cargar las alertas");
            return res.json();
          },
          { force, ttlMs: 15_000 }
        );
        if (json) {
          setAlerts(json.alerts);
          if (json.telegramConfig) setTelegramConfig(json.telegramConfig);
          if (json.autoTelegramResult?.sent) {
            const autoMsg = `Alerta automática enviada a Telegram (Chat ${json.autoTelegramResult.displayRecipient}) con ${json.autoTelegramResult.count} lote(s) próximo(s) a vencer.`;
            setBanner({ type: "info", text: autoMsg });
            notify({
              title: "Telegram enviado automáticamente",
              description: autoMsg,
              variant: "success",
            });
          }
        }
      } catch {
        // Mantener estado previo si falla la red
      } finally {
        setLoading(false);
      }
    },
    [showAcknowledged, severityFilter, notify]
  );

  useEffect(() => {
    void loadAlerts(false);
  }, [loadAlerts]);

  const reloadAfterMutation = useCallback(async () => {
    invalidateCache("alerts:");
    invalidateCache("dashboard:");
    invalidateCache("inventory:");
    await Promise.all([loadAlerts(true), refreshAlertsCount()]);
  }, [loadAlerts, refreshAlertsCount]);

  const handleSync = async () => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: actorName }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errText = j.error || "No se pudo ejecutar el escaneo de alertas.";
        setBanner({ type: "warn", text: errText });
        notify({
          title: "Error en escaneo",
          description: errText,
          variant: "error",
        });
        return;
      }
      const tgInfo = j.result.telegramResult;
      let extraMsg = "";
      if (tgInfo?.sent) {
        extraMsg += ` Telegram enviado automáticamente (${tgInfo.count} alerta(s)).`;
      }
      const text = `Escaneo finalizado: ${j.result.scannedLots} lotes evaluados, ${j.result.createdAlerts} alertas nuevas, ${j.result.resolvedAlerts} cerradas automáticamente.${extraMsg}`;
      setBanner({ type: "info", text });
      notify({
        title: "Escaneo de alertas completado",
        description: text,
        variant: "success",
      });
      await reloadAfterMutation();
    } catch {
      const errText = "Error de conexión al ejecutar el escaneo automático.";
      setBanner({ type: "warn", text: errText });
      notify({
        title: "Error de conexión",
        description: errText,
        variant: "error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSendSummaryTelegram = async () => {
    setSendingTelegram(true);
    setBanner(null);
    try {
      const res = await fetch("/api/alerts/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: actorName, onlyUnsent: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errText =
          j.error || "No se pudo enviar la notificación por Telegram.";
        setBanner({ type: "warn", text: errText });
        notify({
          title: "Error en envío Telegram",
          description: errText,
          variant: "error",
        });
        return;
      }
      const tgResult = j.telegramResult;
      if (tgResult?.sent) {
        const okText = `Resumen enviado por Telegram (Chat ${tgResult.displayRecipient}) con ${tgResult.count} lote(s) con ≤ 60 días.`;
        setBanner({ type: "info", text: okText });
        notify({
          title: "Telegram enviado",
          description: okText,
          variant: "success",
        });
        await reloadAfterMutation();
      } else {
        const warnText =
          tgResult?.reason ||
          "No hay alertas activas con ≤ 60 días para enviar.";
        setBanner({ type: "warn", text: warnText });
        notify({
          title: "Telegram pendiente o sin alertas",
          description: warnText,
          variant: "info",
        });
      }
    } catch {
      const errText = "Error de conexión al enviar notificación por Telegram.";
      setBanner({ type: "warn", text: errText });
      notify({
        title: "Error de conexión",
        description: errText,
        variant: "error",
      });
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleAcknowledge = async (id: string, acknowledged: boolean) => {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acknowledged,
          acknowledgedBy: actorName || "Supervisor",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        notify({
          title: acknowledged
            ? "Alerta marcada como atendida"
            : "Alerta reabierta",
          variant: "success",
        });
        if (selectedAlert?.id === id) {
          setSelectedAlert(null);
        }
        await reloadAfterMutation();
      } else {
        notify({
          title: "No se pudo actualizar la alerta",
          description: json.error || "Intenta nuevamente.",
          variant: "error",
        });
      }
    } catch {
      notify({
        title: "Error de conexión",
        description: "No se pudo actualizar el estado de la alerta.",
        variant: "error",
      });
    }
  };

  const handleConfirmDeleteAlert = async () => {
    if (!deletingAlert) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(
        `/api/alerts/${deletingAlert.id}?actor=${encodeURIComponent(
          actorName || "Supervisor"
        )}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        if (selectedAlert?.id === deletingAlert.id) {
          setSelectedAlert(null);
        }
        setDeletingAlert(null);
        notify({
          title: "Alerta eliminada",
          variant: "info",
        });
        await reloadAfterMutation();
      } else {
        const json = await res.json().catch(() => ({}));
        const errText = json.error || "No se pudo eliminar la alerta.";
        setBanner({ type: "warn", text: errText });
        notify({
          title: "Error al eliminar",
          description: errText,
          variant: "error",
        });
        setDeletingAlert(null);
      }
    } catch {
      notify({
        title: "Error de conexión",
        description: "No se pudo eliminar la alerta.",
        variant: "error",
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const visibleAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return alerts;
    return alerts.filter((a) =>
      `${a.title} ${a.message} ${a.lot?.lotNumber ?? ""} ${
        a.lot?.product.sku ?? ""
      } ${a.lot?.product.name ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [alerts, search]);

  const summary = useMemo(() => {
    let high = 0;
    let medium = 0;
    let notified = 0;
    for (const a of visibleAlerts) {
      if (a.severity === "ALTA") high++;
      else if (a.severity === "MEDIA") medium++;
      if (a.emailSentAt) notified++;
    }
    return { total: visibleAlerts.length, high, medium, notified };
  }, [visibleAlerts]);

  const pagedAlerts = paginateItems(visibleAlerts, page, pageSize);
  const hasActiveFilters = Boolean(search || severityFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas Automáticas"
        badge={warehouseName}
        description="Seguimiento por prioridad de vencimientos ≤60 días, lotes vencidos y notificaciones automáticas a Telegram."
        secondaryActions={
          <button
            type="button"
            onClick={handleSendSummaryTelegram}
            disabled={sendingTelegram}
            className="ui-btn ui-btn-secondary"
          >
            <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            {sendingTelegram ? "Enviando..." : "Enviar resumen Telegram"}
          </button>
        }
        primaryAction={
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="ui-btn ui-btn-primary"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Escaneando..." : "Ejecutar Escaneo"}
          </button>
        }
      />

      {telegramConfig && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-2.5 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            <span>
              Canal Telegram Bot:{" "}
              <strong className="font-semibold">
                {telegramConfig.configured
                  ? `Chat ${telegramConfig.displayRecipient}`
                  : "Pendiente de configurar"}
              </strong>
            </span>
          </div>
          <span className="font-medium text-sky-700 dark:text-sky-300">
            {telegramConfig.configured
              ? "Notificación automática activa para lotes ≤60 días"
              : "Agrega TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID"}
          </span>
        </div>
      )}

      {banner && (
        <div
          role="status"
          className={`cf-animate-popover flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${
            banner.type === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200"
              : "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-200"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{banner.text}</span>
        </div>
      )}

      {/* Resumen de alertas por prioridad */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label={showAcknowledged ? "Atendidas" : "Pendientes"}
          value={summary.total}
          sublabel="Alertas en esta vista"
          icon={<Bell className="h-4 w-4" />}
          tone="indigo"
          onClick={() => {
            setSeverityFilter("");
            setPage(1);
          }}
          active={severityFilter === ""}
        />
        <KpiCard
          label="Prioridad Alta"
          value={summary.high}
          sublabel="Vencidos o ≤15 días"
          icon={<AlertOctagon className="h-4 w-4" />}
          tone="red"
          onClick={() => {
            setSeverityFilter(severityFilter === "ALTA" ? "" : "ALTA");
            setPage(1);
          }}
          active={severityFilter === "ALTA"}
        />
        <KpiCard
          label="Prioridad Media"
          value={summary.medium}
          sublabel="Preventivos 16–60 días"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="amber"
          onClick={() => {
            setSeverityFilter(severityFilter === "MEDIA" ? "" : "MEDIA");
            setPage(1);
          }}
          active={severityFilter === "MEDIA"}
        />
        <KpiCard
          label="Notificadas"
          value={summary.notified}
          sublabel="Enviadas vía Telegram"
          icon={<Send className="h-4 w-4" />}
          tone="sky"
        />
      </div>

      {/* Barra de filtros */}
      <FilterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Buscar por producto, SKU, lote o descripción de alerta..."
        resultCount={visibleAlerts.length}
        resultLabel={
          showAcknowledged ? "alerta(s) atendidas" : "alerta(s) pendientes"
        }
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          setSearch("");
          setSeverityFilter("");
          setPage(1);
        }}
        tabs={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowAcknowledged(false);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  !showAcknowledged
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Pendientes
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAcknowledged(true);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  showAcknowledged
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Atendidas
              </button>
            </div>
          </div>
        }
        filters={
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por severidad"
            className="ui-select sm:w-48"
          >
            <option value="">Todas las severidades</option>
            <option value="ALTA">Severidad Alta</option>
            <option value="MEDIA">Severidad Media</option>
            <option value="BAJA">Severidad Baja</option>
          </select>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {editingActor ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  onBlur={() => setEditingActor(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingActor(false);
                  }}
                  autoFocus
                  aria-label="Nombre del responsable"
                  className="ui-input h-7 w-44 py-0.5 text-xs"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingActor(true)}
                className="text-xs text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                Responsable: <strong className="text-slate-900 dark:text-slate-100">{actorName}</strong> (cambiar)
              </button>
            )}
          </div>
        }
      />

      {/* Listado organizado */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando alertas...
          </div>
        ) : visibleAlerts.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title={
                showAcknowledged
                  ? "No hay alertas atendidas"
                  : "No hay alertas pendientes"
              }
              description={
                !showAcknowledged
                  ? "Ejecuta un escaneo automático si registraste o actualizaste lotes recientemente."
                  : undefined
              }
            />
          </div>
        ) : (
          pagedAlerts.items.map((alert) => {
            const dotColor =
              alert.severity === "ALTA"
                ? "bg-red-500"
                : alert.severity === "MEDIA"
                ? "bg-amber-500"
                : "bg-sky-500";
            return (
              <div
                key={alert.id}
                onClick={() => setSelectedAlert(alert)}
                className="ui-card-interactive flex cursor-pointer flex-col justify-between gap-4 p-4 sm:p-5 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                    <SeverityBadge severity={alert.severity} />
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                    </span>
                    <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">
                      {formatDateTimeES(alert.createdAt)}
                    </span>
                    {alert.emailSentAt && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Telegram
                      </span>
                    )}
                  </div>

                  <h3 className="break-words text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
                    {alert.title}
                  </h3>
                  <p className="break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
                    {alert.message}
                  </p>

                  {alert.lot && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {alert.lot.warehouse.name} · Lote{" "}
                      <strong className="font-mono text-slate-800 dark:text-slate-200">
                        {alert.lot.lotNumber}
                      </strong>{" "}
                      · Stock:{" "}
                      <strong className="tabular-nums">
                        {alert.lot.totalUnits} u.
                      </strong>
                    </p>
                  )}

                  {alert.acknowledged && alert.acknowledgedBy && (
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Atendida por <strong>{alert.acknowledgedBy}</strong> el{" "}
                      {formatDateTimeES(alert.acknowledgedAt)}
                    </p>
                  )}
                </div>

                <div
                  className="flex shrink-0 flex-wrap items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(alert)}
                    className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Detalle
                  </button>
                  {alert.lot && (
                    <>
                      <Link
                        href={`/inspecciones?lotId=${alert.lot.id}`}
                        className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Inspeccionar
                      </Link>
                      <Link
                        href={`/averias?lotId=${alert.lot.id}`}
                        className="ui-btn ui-btn-secondary px-2.5 py-1.5 text-xs text-orange-700 dark:text-orange-300"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Avería
                      </Link>
                    </>
                  )}
                  {!alert.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(alert.id, true)}
                      className="ui-btn ui-btn-primary px-3 py-1.5 text-xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Atender
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(alert.id, false)}
                      className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs"
                    >
                      Reabrir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeletingAlert(alert)}
                    title="Eliminar alerta"
                    aria-label={`Eliminar alerta ${alert.title}`}
                    className="ui-btn ui-btn-ghost border border-slate-200 px-2 py-1.5 text-xs text-red-600 hover:border-red-200 hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Pagination
        currentPage={pagedAlerts.safePage}
        totalItems={pagedAlerts.totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        itemLabel="alertas"
      />

      {/* Drawer Detalle y Seguimiento de Alerta */}
      <DetailDrawer
        open={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert?.title ?? ""}
        subtitle={
          selectedAlert
            ? `Creada el ${formatDateTimeES(selectedAlert.createdAt)}`
            : undefined
        }
        icon={<Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
        badge={
          selectedAlert && (
            <>
              <SeverityBadge severity={selectedAlert.severity} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {ALERT_TYPE_LABELS[selectedAlert.type] ?? selectedAlert.type}
              </span>
            </>
          )
        }
        footer={
          selectedAlert && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDeletingAlert(selectedAlert)}
                className="ui-btn ui-btn-ghost px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
              <div className="flex flex-wrap gap-2">
                {selectedAlert.lot && (
                  <Link
                    href={`/inspecciones?lotId=${selectedAlert.lot.id}`}
                    className="ui-btn ui-btn-secondary py-1.5 text-xs"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Inspeccionar
                  </Link>
                )}
                {!selectedAlert.acknowledged ? (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(selectedAlert.id, true)}
                    className="ui-btn ui-btn-primary py-1.5 text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Marcar atendida
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(selectedAlert.id, false)}
                    className="ui-btn ui-btn-secondary py-1.5 text-xs"
                  >
                    Reabrir alerta
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedAlert && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Descripción de la Alerta
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {selectedAlert.message}
              </p>
            </div>

            {selectedAlert.lot && (
              <div className="rounded-xl border border-slate-200 p-4 text-xs dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Lote Asociado
                </p>
                <p className="mt-1.5 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                  {selectedAlert.lot.product.sku} · Lote{" "}
                  {selectedAlert.lot.lotNumber}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedAlert.lot.product.name}
                </p>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  {selectedAlert.lot.warehouse.name} · Stock actual:{" "}
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                    {selectedAlert.lot.totalUnits} u.
                  </strong>
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 p-4 text-xs dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Seguimiento de Atención y Notificación
              </p>
              <dl className="mt-2.5 space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Notificación Telegram:</dt>
                  <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {selectedAlert.emailSentAt
                      ? formatDateTimeES(selectedAlert.emailSentAt)
                      : "Pendiente de envío"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Estado de atención:</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedAlert.acknowledged ? "Atendida" : "Pendiente"}
                  </dd>
                </div>
                {selectedAlert.acknowledged && selectedAlert.acknowledgedBy && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Atendida por:</dt>
                    <dd className="font-medium text-emerald-700 dark:text-emerald-400">
                      {selectedAlert.acknowledgedBy} (
                      {formatDateTimeES(selectedAlert.acknowledgedAt)})
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {selectedAlert.lot && (
              <div>
                <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Trazabilidad del Lote
                </h3>
                <EntityTimeline entityId={selectedAlert.lot.id} />
              </div>
            )}
          </div>
        )}
      </DetailDrawer>

      {/* Modal Eliminar Alerta */}
      <Modal
        open={Boolean(deletingAlert)}
        onClose={() => setDeletingAlert(null)}
        title="Eliminar alerta"
        icon={
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        }
        maxWidthClass="max-w-md"
        closeDisabled={deletingBusy}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setDeletingAlert(null)}
              disabled={deletingBusy}
              className="ui-btn ui-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteAlert}
              disabled={deletingBusy}
              className="ui-btn ui-btn-danger"
            >
              {deletingBusy ? "Eliminando..." : "Eliminar alerta"}
            </button>
          </div>
        }
      >
        {deletingAlert && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Deseas eliminar la alerta{" "}
            <strong className="text-slate-900 dark:text-slate-100">
              {deletingAlert.title}
            </strong>
            ? Si corresponde a un lote activo, volverá a generarse en el
            próximo escaneo automático.
          </p>
        )}
      </Modal>
    </div>
  );
}
