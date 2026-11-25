"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  MessageCircle,
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

interface WhatsAppConfigInfo {
  configured: boolean;
  provider: string;
  recipient: string;
  displayRecipient: string;
}

interface TelegramConfigInfo {
  configured: boolean;
  chatIds: string[];
  displayRecipient: string;
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
  whatsappConfig?: WhatsAppConfigInfo;
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
  const [whatsappConfig, setWhatsappConfig] =
    useState<WhatsAppConfigInfo | null>(
      () => getCached<AlertsResponse>("alerts:false:")?.whatsappConfig ?? null
    );
  const [telegramConfig, setTelegramConfig] =
    useState<TelegramConfigInfo | null>(
      () => getCached<AlertsResponse>("alerts:false:")?.telegramConfig ?? null
    );
  const [loading, setLoading] = useState(() => !getCached("alerts:false:"));
  const [syncing, setSyncing] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [deletingAlert, setDeletingAlert] = useState<AlertItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [waPreviewModal, setWaPreviewModal] = useState<{
    waUrl: string;
    messageText: string;
    displayRecipient: string;
    count: number;
  } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);
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
            if (!res.ok) return null;
            return res.json();
          },
          { force, ttlMs: 15_000 }
        );
        if (json) {
          setAlerts(json.alerts);
          if (json.whatsappConfig) setWhatsappConfig(json.whatsappConfig);
          if (json.telegramConfig) setTelegramConfig(json.telegramConfig);
        }
      } finally {
        setLoading(false);
      }
    },
    [showAcknowledged, severityFilter]
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
      if (res.ok) {
        const j = await res.json();
        const waInfo = j.result.whatsappResult;
        const tgInfo = j.result.telegramResult;
        let extraMsg = "";
        if (tgInfo?.sent) {
          extraMsg += ` Telegram enviado (${tgInfo.count} alerta(s)).`;
        }
        if (waInfo?.sent) {
          extraMsg += ` WhatsApp enviado a ${waInfo.displayRecipient} (${waInfo.count} alerta(s)).`;
        } else if (waInfo?.waUrl && waInfo.count > 0) {
          extraMsg += ` Lista para enviar por WhatsApp a ${waInfo.displayRecipient} (${waInfo.count} alerta(s)).`;
        }
        const text = `Escaneo finalizado: ${j.result.scannedLots} lotes evaluados, ${j.result.createdAlerts} alertas nuevas, ${j.result.resolvedAlerts} cerradas automáticamente.${extraMsg}`;
        setBanner({ type: "info", text });
        notify({
          title: "Escaneo de alertas completado",
          description: text,
          variant: "success",
        });
        await reloadAfterMutation();
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleSendSummaryWhatsApp = async () => {
    setSendingWhatsApp(true);
    setBanner(null);
    try {
      const res = await fetch("/api/alerts/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: actorName, onlyUnsent: false }),
      });
      const j = await res.json();
      if (!res.ok) {
        const errText =
          j.error || "No se pudo enviar la notificación por WhatsApp.";
        setBanner({ type: "warn", text: errText });
        notify({
          title: "Error en envío WhatsApp",
          description: errText,
          variant: "error",
        });
        return;
      }
      const waResult = j.whatsappResult;
      if (waResult?.sent) {
        const okText = `Resumen enviado por WhatsApp a ${waResult.displayRecipient} (${waResult.count} lote(s) con ≤ 60 días).`;
        setBanner({ type: "info", text: okText });
        notify({
          title: "WhatsApp enviado",
          description: okText,
          variant: "success",
        });
        await reloadAfterMutation();
      } else if (waResult?.waUrl && waResult.count > 0) {
        setCopiedMsg(false);
        setWaPreviewModal({
          waUrl: waResult.waUrl,
          messageText: waResult.messageText || "",
          displayRecipient: waResult.displayRecipient,
          count: waResult.count,
        });
      } else {
        setBanner({
          type: "info",
          text:
            waResult?.reason ||
            "No hay alertas activas con ≤ 60 días para enviar.",
        });
      }
    } finally {
      setSendingWhatsApp(false);
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
      const j = await res.json();
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
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleMarkManualWhatsAppSent = async () => {
    await fetch("/api/alerts/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: actorName, markManualSent: true }),
    });
    setWaPreviewModal(null);
    const msg = `Alertas marcadas como notificadas por WhatsApp hacia ${
      whatsappConfig?.displayRecipient || "+57 312 638 7834"
    }.`;
    setBanner({ type: "info", text: msg });
    notify({
      title: "Notificación registrada",
      description: msg,
      variant: "success",
    });
    await reloadAfterMutation();
  };

  const handleAcknowledge = async (id: string, acknowledged: boolean) => {
    const res = await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acknowledged,
        acknowledgedBy: actorName || "Supervisor",
      }),
    });
    if (res.ok) {
      notify({
        title: acknowledged ? "Alerta marcada como atendida" : "Alerta reabierta",
        variant: "success",
      });
      await reloadAfterMutation();
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
        setBanner({
          type: "warn",
          text: json.error || "No se pudo eliminar la alerta.",
        });
        setDeletingAlert(null);
      }
    } finally {
      setDeletingBusy(false);
    }
  };

  const buildSingleAlertWaUrl = (alert: AlertItem) => {
    const phone = whatsappConfig?.recipient || "573126387834";
    const lotInfo = alert.lot
      ? `\nBodega: ${alert.lot.warehouse.name} | Lote: ${alert.lot.lotNumber} | Stock: ${alert.lot.totalUnits} u.`
      : "";
    const text = `*ALERTA CORTA FECHA*\n*${alert.title}*\n${alert.message}${lotInfo}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
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
            próximos a vencer (≤60 días) con notificación a Telegram y WhatsApp.
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
            {sendingTelegram ? "Enviando..." : "Enviar por Telegram"}
          </button>
          <button
            type="button"
            onClick={handleSendSummaryWhatsApp}
            disabled={sendingWhatsApp}
            className="ui-btn ui-btn-emerald-soft w-full sm:w-auto"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {sendingWhatsApp ? "Preparando..." : "Enviar por WhatsApp"}
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

      {(telegramConfig || whatsappConfig) && (
        <div className="space-y-2">
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
                  ? "Bot oficial de Telegram activo (envío automático sin costo)"
                  : "Agrega TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env / Vercel"}
              </span>
            </div>
          )}
          {whatsappConfig && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  WhatsApp asociado para alertas (≤ 60 días):{" "}
                  <strong className="font-semibold">
                    {whatsappConfig.displayRecipient}
                  </strong>
                </span>
              </div>
              <span className="font-medium text-emerald-800 dark:text-emerald-300">
                {whatsappConfig.configured
                  ? `Envío automático API activo (${whatsappConfig.provider})`
                  : "Envío directo por WhatsApp Web activo (1 clic)"}
              </span>
            </div>
          )}
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
                <div className="space-y-1.5">
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
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {alert.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
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
                  <a
                    href={buildSingleAlertWaUrl(alert)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-btn ui-btn-emerald-soft px-3 py-2 text-xs sm:py-1.5"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
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

      {/* Modal envío por WhatsApp Web */}
      <Modal
        open={Boolean(waPreviewModal)}
        onClose={() => setWaPreviewModal(null)}
        title="Enviar Alertas a WhatsApp"
        subtitle={
          waPreviewModal
            ? `Destino: ${waPreviewModal.displayRecipient} · ${waPreviewModal.count} lote(s) con vencimiento ≤ 60 días`
            : undefined
        }
        icon={
          <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        }
        maxWidthClass="max-w-lg"
      >
        {waPreviewModal && (
          <>
            <textarea
              readOnly
              rows={9}
              value={waPreviewModal.messageText}
              className="ui-textarea bg-slate-50 font-mono text-xs text-slate-800 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    waPreviewModal.messageText
                  );
                  setCopiedMsg(true);
                  notify({
                    title: "Mensaje copiado al portapapeles",
                    variant: "success",
                  });
                }}
                className="ui-btn ui-btn-secondary text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedMsg ? "Mensaje copiado ✓" : "Copiar mensaje"}
              </button>

              <a
                href={waPreviewModal.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleMarkManualWhatsAppSent}
                className="ui-btn ui-btn-emerald text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir en WhatsApp y Marcar Enviado
              </a>
            </div>
          </>
        )}
      </Modal>

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
      >
        {deletingAlert && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ¿Deseas eliminar la alerta{" "}
              <strong className="text-slate-900 dark:text-slate-100">
                {deletingAlert.title}
              </strong>
              ? Si corresponde a un lote activo, volverá a generarse en el
              próximo escaneo automático.
            </p>
            <div className="mt-5 flex justify-end gap-2">
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
          </>
        )}
      </Modal>
    </div>
  );
}
