import nodemailer from "nodemailer";
import { ALERT_TYPE_LABELS, formatDateES } from "./constants";

export const DEFAULT_ALERT_EMAIL_TO = "despachos.distrimarcas@grupobetancur.co";

export interface EmailAlertItem {
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

export interface EmailConfigStatus {
  configured: boolean;
  recipient: string;
  host: string;
  port: number;
  secure: boolean;
  from: string;
  hasUser: boolean;
  hasPass: boolean;
}

export function getEmailConfigStatus(): EmailConfigStatus {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587) || 587;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const recipient =
    (process.env.ALERT_EMAIL_TO || DEFAULT_ALERT_EMAIL_TO).trim() ||
    DEFAULT_ALERT_EMAIL_TO;
  const from =
    (process.env.SMTP_FROM || "").trim() ||
    (user ? `Alertas Corta Fecha <${user}>` : `Alertas Corta Fecha <${recipient}>`);

  return {
    configured: Boolean(host && user && pass),
    recipient,
    host,
    port,
    secure,
    from,
    hasUser: Boolean(user),
    hasPass: Boolean(pass),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getUrgencyBadge(days: number | null): {
  label: string;
  bg: string;
  color: string;
} {
  if (days === null) {
    return { label: "Alerta", bg: "#f1f5f9", color: "#334155" };
  }
  if (days < 0) {
    return {
      label: `Vencido (${Math.abs(days)}d)`,
      bg: "#fee2e2",
      color: "#991b1b",
    };
  }
  if (days <= 15) {
    return {
      label: `Crítico (${days}d)`,
      bg: "#ffedd5",
      color: "#9a3412",
    };
  }
  return {
    label: `Próximo (${days}d)`,
    bg: "#fef3c7",
    color: "#92400e",
  };
}

export interface SendAlertEmailResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  recipient: string;
  count: number;
  messageId?: string;
}

export async function sendExpirationAlertsEmail(
  alerts: EmailAlertItem[],
  options?: { isDigest?: boolean; actor?: string }
): Promise<SendAlertEmailResult> {
  const cfg = getEmailConfigStatus();

  if (alerts.length === 0) {
    return {
      sent: false,
      skipped: true,
      reason: "No hay alertas pendientes con ≤ 60 días para enviar.",
      recipient: cfg.recipient,
      count: 0,
    };
  }

  if (!cfg.configured) {
    return {
      sent: false,
      skipped: true,
      reason:
        "Faltan credenciales SMTP en .env (SMTP_HOST, SMTP_USER, SMTP_PASS).",
      recipient: cfg.recipient,
      count: alerts.length,
    };
  }

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

  const subjectPrefix = options?.isDigest
    ? "[Resumen Corta Fecha]"
    : "[Alerta Corta Fecha]";
  const subject = `${subjectPrefix} ${sorted.length} producto(s) próximo(s) a vencer o vencido(s) (≤ 60 días)`;

  const rowsHtml = sorted
    .map((item) => {
      const badge = getUrgencyBadge(item.daysToExpiry);
      const productName = item.lot?.product.name ?? item.title;
      const sku = item.lot?.product.sku ?? "—";
      const warehouse = item.lot?.warehouse.name ?? "—";
      const lotNumber = item.lot?.lotNumber ?? "—";
      const expiryText = item.lot
        ? item.lot.expiryDisplay || formatDateES(item.lot.expiryDate)
        : "—";
      const stockText = item.lot
        ? item.lot.totalUnits > 0
          ? `${item.lot.quantityText} (${item.lot.totalUnits} u.)`
          : item.lot.quantityText
        : "—";
      const typeLabel = ALERT_TYPE_LABELS[item.type] ?? item.type;

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">
            <strong>${escapeHtml(productName)}</strong><br/>
            <span style="color:#64748b;font-size:12px;">SKU: ${escapeHtml(sku)} · ${escapeHtml(typeLabel)}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">
            ${escapeHtml(warehouse)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-family:monospace;color:#0f172a;">
            ${escapeHtml(lotNumber)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">
            ${escapeHtml(expiryText)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">
            ${escapeHtml(stockText)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">
            <span style="display:inline-block;padding:3px 8px;border-radius:999px;font-weight:600;background:${badge.bg};color:${badge.color};">
              ${escapeHtml(badge.label)}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#4f46e5;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:18px;">Sistema Corta Fecha — Distrimarcas</h1>
          <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">
            Alerta de productos vencidos o próximos a vencer (≤ 60 días)
          </p>
        </div>
        <div style="padding:20px 24px;">
          <p style="margin:0 0 16px;font-size:14px;color:#334155;">
            Se reportan <strong>${sorted.length}</strong> lote(s) con novedad de vencimiento que requieren priorización de despacho o revisión en bodega:
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
            <span style="background:#fee2e2;color:#991b1b;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;">Vencidos: ${expiredCount}</span>
            <span style="background:#ffedd5;color:#9a3412;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;">Críticos (0-15d): ${criticalCount}</span>
            <span style="background:#fef3c7;color:#92400e;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;">Próximos (16-60d): ${upcomingCount}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;">
            <thead>
              <tr style="background:#f1f5f9;text-align:left;">
                <th style="padding:10px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Producto</th>
                <th style="padding:10px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Bodega</th>
                <th style="padding:10px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Lote</th>
                <th style="padding:10px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Vencimiento</th>
                <th style="padding:10px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Stock</th>
                <th style="padding:10px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
            Generado el ${escapeHtml(new Date().toLocaleString("es-CO"))} por ${escapeHtml(options?.actor || "Sistema Corta Fecha")}.
          </p>
        </div>
      </div>
    </div>
  `;

  const textLines = sorted.map((item) => {
    const badge = getUrgencyBadge(item.daysToExpiry);
    const productName = item.lot?.product.name ?? item.title;
    const sku = item.lot?.product.sku ?? "—";
    const warehouse = item.lot?.warehouse.name ?? "—";
    const lotNumber = item.lot?.lotNumber ?? "—";
    const expiryText = item.lot
      ? item.lot.expiryDisplay || formatDateES(item.lot.expiryDate)
      : "—";
    const stockText = item.lot
      ? `${item.lot.quantityText} (${item.lot.totalUnits} u.)`
      : "—";
    return `- [${badge.label}] ${productName} (SKU: ${sku}) | Bodega: ${warehouse} | Lote: ${lotNumber} | Vence: ${expiryText} | Stock: ${stockText}`;
  });

  const text = [
    `Sistema Corta Fecha — Distrimarcas`,
    `Alertas de vencimiento (<= 60 días): ${sorted.length} lote(s)`,
    `Vencidos: ${expiredCount} | Críticos (0-15d): ${criticalCount} | Próximos (16-60d): ${upcomingCount}`,
    "",
    ...textLines,
  ].join("\n");

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: (process.env.SMTP_USER || "").trim(),
      pass: (process.env.SMTP_PASS || "").trim(),
    },
  });

  const info = await transporter.sendMail({
    from: cfg.from,
    to: cfg.recipient,
    subject,
    text,
    html,
  });

  return {
    sent: true,
    recipient: cfg.recipient,
    count: sorted.length,
    messageId: info.messageId,
  };
}
