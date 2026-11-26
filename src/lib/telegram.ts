import { ALERT_TYPE_LABELS, formatDateES } from "./constants";

export interface TelegramAlertItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  daysToExpiry: number | null;
  lot: {
    lotNumber: string;
    quantityText: string;
    totalUnits: number;
    expiryDate: Date;
    expiryDisplay: string | null;
    product: {
      name: string;
      sku: string;
    };
    warehouse: {
      name: string;
    };
  } | null;
}

export interface TelegramConfigStatus {
  configured: boolean;
  chatIds: string[];
  displayRecipient: string;
  missingReason?: string;
}

export interface SendAlertTelegramResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  chatIds: string[];
  displayRecipient: string;
  count: number;
  messageId?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseChatIds(raw: string): string[] {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getTelegramConfigStatus(): TelegramConfigStatus {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatIds = parseChatIds(process.env.TELEGRAM_CHAT_ID || "");
  const configured = Boolean(token && chatIds.length > 0);

  return {
    configured,
    chatIds,
    displayRecipient:
      chatIds.length > 0 ? chatIds.join(", ") : "Sin chat ID configurado",
    missingReason: configured
      ? undefined
      : "Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env (o en las variables de entorno de Vercel).",
  };
}

function getUrgencyTag(days: number | null): string {
  if (days === null) return "Alerta";
  if (days < 0) return `VENCIDO hace ${Math.abs(days)}d`;
  if (days <= 15) return `CRÍTICO (${days}d)`;
  return `Próximo (${days}d)`;
}

export function buildTelegramAlertsHtml(
  alerts: TelegramAlertItem[],
  options?: { isDigest?: boolean; actor?: string }
): string {
  const sorted = [...alerts].sort(
    (a, b) => (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999)
  );

  const expiredCount = sorted.filter(
    (a) => a.daysToExpiry !== null && a.daysToExpiry < 0
  ).length;
  const criticalCount = sorted.filter(
    (a) => a.daysToExpiry !== null && a.daysToExpiry >= 0 && a.daysToExpiry <= 15
  ).length;
  const upcomingCount = sorted.filter(
    (a) =>
      a.daysToExpiry !== null && a.daysToExpiry > 15 && a.daysToExpiry <= 60
  ).length;

  const headerTitle = options?.isDigest
    ? "RESUMEN CORTA FECHA — DISTRIMARCAS"
    : "ALERTA CORTA FECHA — DISTRIMARCAS";

  const actor = escapeHtml(options?.actor || "Sistema Corta Fecha");
  const generatedAt = escapeHtml(new Date().toLocaleString("es-CO"));

  const buildMessage = (limit: number) => {
    const shown = sorted.slice(0, limit);
    const lines = shown.map((item, index) => {
      const tag = escapeHtml(getUrgencyTag(item.daysToExpiry));
      const productName = escapeHtml(item.lot?.product.name ?? item.title);
      const sku = escapeHtml(item.lot?.product.sku ?? "—");
      const lotNumber = escapeHtml(item.lot?.lotNumber ?? "—");
      const warehouse = escapeHtml(item.lot?.warehouse.name ?? "Bodega");
      const expiryText = escapeHtml(
        item.lot
          ? item.lot.expiryDisplay || formatDateES(item.lot.expiryDate)
          : "—"
      );
      const stockText = escapeHtml(
        item.lot
          ? item.lot.totalUnits > 0
            ? `${item.lot.quantityText} (${item.lot.totalUnits} u.)`
            : item.lot.quantityText
          : "—"
      );
      const typeLabel = escapeHtml(ALERT_TYPE_LABELS[item.type] ?? item.type);

      return [
        `${index + 1}. <b>[${tag}]</b> ${productName}`,
        `   SKU: <code>${sku}</code> | Lote: <code>${lotNumber}</code> | ${typeLabel}`,
        `   Vence: <b>${expiryText}</b> | Stock: ${stockText} (${warehouse})`,
      ].join("\n");
    });

    const extraLine =
      sorted.length > limit
        ? `\n<i>...y ${sorted.length - limit} lote(s) adicional(es) en el sistema.</i>`
        : "";

    return [
      `<b>${escapeHtml(headerTitle)}</b>`,
      `Lotes con novedad de vencimiento (&lt;= 60 días): <b>${sorted.length}</b>`,
      `Vencidos: <b>${expiredCount}</b> | Críticos (0-15d): <b>${criticalCount}</b> | Próximos (16-60d): <b>${upcomingCount}</b>`,
      "",
      ...lines,
      extraLine,
      "",
      `Generado: ${generatedAt} (${actor})`,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n");
  };

  let limit = Math.min(20, sorted.length);
  let fullText = buildMessage(limit);
  while (fullText.length > 4096 && limit > 1) {
    limit--;
    fullText = buildMessage(limit);
  }

  if (fullText.length <= 4096) {
    return fullText;
  }

  return `${buildMessage(0).slice(0, 4050)}`;
}

export async function sendExpirationAlertsTelegram(
  alerts: TelegramAlertItem[],
  options?: { isDigest?: boolean; actor?: string }
): Promise<SendAlertTelegramResult> {
  const cfg = getTelegramConfigStatus();

  if (alerts.length === 0) {
    return {
      sent: false,
      skipped: true,
      reason: "No hay alertas pendientes con <= 60 días para enviar.",
      chatIds: cfg.chatIds,
      displayRecipient: cfg.displayRecipient,
      count: 0,
    };
  }

  if (!cfg.configured) {
    return {
      sent: false,
      skipped: true,
      reason: cfg.missingReason,
      chatIds: cfg.chatIds,
      displayRecipient: cfg.displayRecipient,
      count: alerts.length,
    };
  }

  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const html = buildTelegramAlertsHtml(alerts, options);
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  const messageIds: string[] = [];

  for (const chatId of cfg.chatIds) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(
        data?.description || `Telegram Bot API respondió ${res.status}`
      );
    }
    if (data?.result?.message_id !== undefined) {
      messageIds.push(String(data.result.message_id));
    }
  }

  return {
    sent: true,
    chatIds: cfg.chatIds,
    displayRecipient: cfg.displayRecipient,
    count: alerts.length,
    messageId: messageIds.join(",") || undefined,
  };
}
