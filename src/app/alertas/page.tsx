"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/components/AppSessionContext";
import { Modal } from "@/components/Modal";
import { Pagination, paginateItems } from "@/components/Pagination";
import { SeverityBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";
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
  const { user, refreshAlertsCount } = useAppSession();
  const [actorName, setActorName] = useState(
    () => user?.fullName || "Encargada Distrimarcas"
  );

  useEffect(() => {
    if (user?.fullName) {
      setActorName((prev) =>
        prev === "Encargada Distrimarcas" ? user.fullName : prev
      );
    }
  }, [user?.fullName]);

  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
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
        notify({ title: "Error en escaneo", description: errText, variant: "error" });
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
      notify({ title: "Error de conexión", description: errText, variant: "error" });
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
      notify({ title: "Error de conexión", description: errText, variant: "error" });
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
        notify({ title: "Error al eliminar", description: errText, variant: "error" });
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

  const pagedAlerts = paginateItems(alerts, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Alertas Preventivas Automáticas
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Detección automática de lotes vencidos, críticos (≤15 días) y
            próximos a vencer (≤60 días) con envío automático a Telegram.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={handleSendSummaryTelegram}
            disabled={sendingTelegram}
            className="ui-btn ui-btn-secondary w-full border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950 sm:w-auto"
          >
            <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            {sendingTelegram ? "Enviando..." : "Enviar resumen por Telegram"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="ui-btn ui-btn-primary w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Escaneando inventario..." : "Ejecutar Escaneo Automático"}
          </button>
        </div>
      </div>

      {telegramConfig && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <span>
              Telegram Bot para alertas automáticas (≤ 60 días):{" "}
              <strong className="font-semibold">
                {telegramConfig.configured
                  ? `Chat ${telegramConfig.displayRecipient}`
                  : "Pendiente de configurar"}
              </strong>
            </span>
          </div>
          <span className="font-medium text-sky-800 dark:text-sky-300">
            {telegramConfig.configured
              ? "Envío automático activo al detectar productos próximos a vencer"
              : "Agrega TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env / Vercel"}
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

      {/* Barra de control */}
      <div className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 sm:inline-flex sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setShowAcknowledged(false);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:px-3.5 sm:py-1.5 sm:text-sm ${
              !showAcknowledged
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100"
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
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:px-3.5 sm:py-1.5 sm:text-sm ${
              showAcknowledged
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Atendidas
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
          <input
            type="text"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            placeholder="Tu nombre (responsable)"
            aria-label="Nombre del responsable"
            className="ui-input sm:w-56"
          />
        </div>
      </div>

      {/* Lista de alertas */}
      <div className="space-y-3">
        {loading ? (
          <div className="ui-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando alertas...
          </div>
        ) : alerts.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <Bell className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {showAcknowledged
                ? "No hay alertas atendidas registradas."
                : "No hay alertas pendientes en este momento."}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {!showAcknowledged &&
                "Ejecuta un escaneo automático si agregaste nuevos lotes recientemente."}
            </p>
          </div>
        ) : (
          pagedAlerts.items.map((alert) => {
            const leftBorder =
              alert.severity === "ALTA"
                ? "border-l-red-500"
                : alert.severity === "MEDIA"
                ? "border-l-amber-500"
                : "border-l-sky-500";
            return (
              <div
                key={alert.id}
                className={`ui-card flex flex-col justify-between gap-4 border-l-4 p-5 transition-shadow hover:shadow-md lg:flex-row lg:items-center ${leftBorder}`}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={alert.severity} />
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                    </span>
                    <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">
                      {formatDateTimeES(alert.createdAt)}
                    </span>
                    {alert.emailSentAt && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Notificada
                      </span>
                    )}
                  </div>
                  <h3 className="break-words text-base font-bold text-slate-900 dark:text-slate-100">
                    {alert.title}
                  </h3>
                  <p className="break-words text-sm text-slate-600 dark:text-slate-300">
                    {alert.message}
                  </p>
                  {alert.lot && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Bodega: <strong>{alert.lot.warehouse.name}</strong> · Lote:{" "}
                      <strong className="font-mono text-slate-800 dark:text-slate-200">
                        {alert.lot.lotNumber}
                      </strong>{" "}
                      · Stock actual:{" "}
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

                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  {alert.lot && (
                    <>
                      <Link
                        href={`/inspecciones?lotId=${alert.lot.id}`}
                        className="ui-btn ui-btn-secondary px-3 py-2 text-xs sm:py-1.5"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Inspeccionar
                      </Link>
                      <Link
                        href={`/averias?lotId=${alert.lot.id}`}
                        className="ui-btn border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 hover:bg-orange-100 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-300 dark:hover:bg-orange-950 sm:py-1.5"
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
                      className="ui-btn ui-btn-emerald px-3 py-2 text-xs sm:py-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Atendida
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(alert.id, false)}
                      className="ui-btn ui-btn-secondary px-3 py-2 text-xs sm:py-1.5"
                    >
                      Reabrir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeletingAlert(alert)}
                    title="Eliminar alerta errónea"
                    aria-label={`Eliminar alerta ${alert.title}`}
                    className="ui-btn col-span-2 border border-red-200 bg-white px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/60 sm:col-span-1 sm:py-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
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
