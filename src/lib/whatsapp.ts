import { ALERT_TYPE_LABELS, formatDateES } from "./constants";

export const DEFAULT_WHATSAPP_TO = "573126387834";

export interface WhatsAppAlertItem {
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

export type WhatsAppProvider =
  | "meta"
  | "callmebot"
  | "twilio"
  | "webhook"
  | "none";

export interface WhatsAppConfigStatus {
  configured: boolean;
  provider: WhatsAppProvider;
  recipient: string;
  displayRecipient: string;
  missingReason?: string;
}

export interface SendAlertWhatsAppResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  recipient: string;
  displayRecipient: string;
  count: number;
  messageId?: string;
  messageText?: string;
  waUrl?: string;
}

/**
 * Normaliza números celulares (por defecto Colombia +57 si tiene 10 dígitos iniciando en 3).
 */
export function normalizeWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return DEFAULT_WHATSAPP_TO;
  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }
  return digits;
}

export function formatWhatsAppDisplay(normalized: string): string {
  if (normalized.startsWith("57") && normalized.length === 12) {
    const local = normalized.slice(2);
    return `+57 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+${normalized}`;
}

export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const rawRecipient =
    (process.env.ALERT_WHATSAPP_TO || DEFAULT_WHATSAPP_TO).trim() ||
    DEFAULT_WHATSAPP_TO;
  const recipient = normalizeWhatsAppNumber(rawRecipient);
  const displayRecipient = formatWhatsAppDisplay(recipient);

  const explicitProvider = (process.env.WHATSAPP_PROVIDER || "")
    .trim()
    .toLowerCase();

  const hasMeta = Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
      process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  );
  const hasCallMeBot = Boolean(process.env.CALLMEBOT_API_KEY?.trim());
  const hasTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim()
  );
  const hasWebhook = Boolean(process.env.WHATSAPP_WEBHOOK_URL?.trim());

  let provider: WhatsAppProvider = "none";
  if (explicitProvider === "meta" && hasMeta) provider = "meta";
  else if (explicitProvider === "callmebot" && hasCallMeBot)
    provider = "callmebot";
  else if (explicitProvider === "twilio" && hasTwilio) provider = "twilio";
  else if (explicitProvider === "webhook" && hasWebhook) provider = "webhook";
  else if (!explicitProvider || explicitProvider === "auto") {
    if (hasMeta) provider = "meta";
    else if (hasCallMeBot) provider = "callmebot";
    else if (hasTwilio) provider = "twilio";
    else if (hasWebhook) provider = "webhook";
  }

  const configured = provider !== "none";
  return {
    configured,
    provider,
    recipient,
    displayRecipient,
    missingReason: configured
      ? undefined
      : "Envío automático vía API pendiente de credenciales en .env (WHATSAPP_PROVIDER / CALLMEBOT_API_KEY / Meta Cloud API). Disponible envío directo por WhatsApp Web.",
  };
}

function getUrgencyTag(days: number | null): string {
  if (days === null) return "Alerta";
  if (days < 0) return `VENCIDO hace ${Math.abs(days)}d`;
  if (days <= 15) return `CRÍTICO (${days}d)`;
  return `Próximo (${days}d)`;
}

export function buildWhatsAppAlertsMessage(
  alerts: WhatsAppAlertItem[],
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
    ? "*RESUMEN CORTA FECHA — DISTRIMARCAS*"
    : "*ALERTA CORTA FECHA — DISTRIMARCAS*";

  const maxLines = 20;
  const shown = sorted.slice(0, maxLines);

  const itemLines = shown.map((item, index) => {
    const tag = getUrgencyTag(item.daysToExpiry);
    const productName = item.lot?.product.name ?? item.title;
    const sku = item.lot?.product.sku ?? "—";
    const lotNumber = item.lot?.lotNumber ?? "—";
    const warehouse = item.lot?.warehouse.name ?? "Bodega";
    const expiryText = item.lot
      ? item.lot.expiryDisplay || formatDateES(item.lot.expiryDate)
      : "—";
    const stockText = item.lot
      ? item.lot.totalUnits > 0
        ? `${item.lot.quantityText} (${item.lot.totalUnits} u.)`
        : item.lot.quantityText
      : "—";
    const typeLabel = ALERT_TYPE_LABELS[item.type] ?? item.type;

    return [
      `${index + 1}. *[${tag}]* ${productName}`,
      `   SKU: ${sku} | Lote: ${lotNumber} | ${typeLabel}`,
      `   Vence: ${expiryText} | Stock: ${stockText} (${warehouse})`,
    ].join("\n");
  });

  const extraLine =
    sorted.length > maxLines
      ? `\n_...y ${sorted.length - maxLines} lote(s) adicional(es) en el sistema._`
      : "";

  return [
    headerTitle,
    `Lotes con novedad de vencimiento (<= 60 días): *${sorted.length}*`,
    `Vencidos: *${expiredCount}* | Críticos (0-15d): *${criticalCount}* | Próximos (16-60d): *${upcomingCount}*`,
    "",
    ...itemLines,
    extraLine,
    "",
    `Generado: ${new Date().toLocaleString("es-CO")} (${options?.actor || "Sistema Corta Fecha"})`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

export function buildWhatsAppWebUrl(recipient: string, message: string): string {
  const normalized = normalizeWhatsAppNumber(recipient);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

async function sendViaMetaCloudApi(
  recipient: string,
  messageText: string
): Promise<{ messageId?: string }> {
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || "v21.0").trim();
  const templateName = (process.env.WHATSAPP_TEMPLATE_NAME || "").trim();
  const templateLang = (process.env.WHATSAPP_TEMPLATE_LANG || "es").trim();

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: messageText.slice(0, 1024) }],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: { preview_url: false, body: messageText.slice(0, 4096) },
      };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error?.message || `Meta WhatsApp API respondió ${res.status}`
    );
  }
  return { messageId: data?.messages?.[0]?.id };
}

async function sendViaCallMeBot(
  recipient: string,
  messageText: string
): Promise<{ messageId?: string }> {
  const apiKey = (process.env.CALLMEBOT_API_KEY || "").trim();
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
    recipient
  )}&text=${encodeURIComponent(messageText.slice(0, 2000))}&apikey=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok || /error/i.test(text)) {
    throw new Error(text || `CallMeBot respondió ${res.status}`);
  }
  return { messageId: `callmebot-${Date.now()}` };
}

async function sendViaTwilio(
  recipient: string,
  messageText: string
): Promise<{ messageId?: string }> {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
  const normalizedFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

  const body = new URLSearchParams({
    From: normalizedFrom,
    To: `whatsapp:+${recipient}`,
    Body: messageText.slice(0, 1600),
  });

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(8000),
      body: body.toString(),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Twilio respondió ${res.status}`);
  }
  return { messageId: data?.sid };
}

async function sendViaWebhook(
  recipient: string,
  messageText: string,
  alertsCount: number
): Promise<{ messageId?: string }> {
  const webhookUrl = (process.env.WHATSAPP_WEBHOOK_URL || "").trim();
  const token = (process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      to: recipient,
      phone: `+${recipient}`,
      message: messageText,
      alertsCount,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error || data?.message || `Webhook respondió ${res.status}`
    );
  }
  return { messageId: data?.id || data?.messageId || `webhook-${Date.now()}` };
}

export async function sendExpirationAlertsWhatsApp(
  alerts: WhatsAppAlertItem[],
  options?: { isDigest?: boolean; actor?: string }
): Promise<SendAlertWhatsAppResult> {
  const cfg = getWhatsAppConfigStatus();

  if (alerts.length === 0) {
    return {
      sent: false,
      skipped: true,
      reason: "No hay alertas pendientes con ≤ 60 días para enviar.",
      recipient: cfg.recipient,
      displayRecipient: cfg.displayRecipient,
      count: 0,
    };
  }

  const messageText = buildWhatsAppAlertsMessage(alerts, options);
  const waUrl = buildWhatsAppWebUrl(cfg.recipient, messageText);

  if (!cfg.configured) {
    return {
      sent: false,
      skipped: true,
      reason: cfg.missingReason,
      recipient: cfg.recipient,
      displayRecipient: cfg.displayRecipient,
      count: alerts.length,
      messageText,
      waUrl,
    };
  }

  let delivery: { messageId?: string } = {};
  if (cfg.provider === "meta") {
    delivery = await sendViaMetaCloudApi(cfg.recipient, messageText);
  } else if (cfg.provider === "callmebot") {
    delivery = await sendViaCallMeBot(cfg.recipient, messageText);
  } else if (cfg.provider === "twilio") {
    delivery = await sendViaTwilio(cfg.recipient, messageText);
  } else if (cfg.provider === "webhook") {
    delivery = await sendViaWebhook(cfg.recipient, messageText, alerts.length);
  }

  return {
    sent: true,
    recipient: cfg.recipient,
    displayRecipient: cfg.displayRecipient,
    count: alerts.length,
    messageId: delivery.messageId,
    messageText,
    waUrl,
  };
}
