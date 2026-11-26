import { after } from "next/server";
import { prisma } from "./prisma";
import {
  buildQuantityText,
  calculateUnitsFromPackaging,
  hasAnyPackagingStock,
  PackagingCounts,
  ProductEquivalences,
} from "./packaging";
import {
  getWhatsAppConfigStatus,
  sendExpirationAlertsWhatsApp,
  SendAlertWhatsAppResult,
} from "./whatsapp";
import {
  getTelegramConfigStatus,
  sendExpirationAlertsTelegram,
  SendAlertTelegramResult,
} from "./telegram";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeDaysToExpiry(
  expiryDate: Date,
  referenceDate = new Date()
): number {
  const exp = startOfDay(expiryDate);
  const ref = startOfDay(referenceDate);
  return Math.round((exp.getTime() - ref.getTime()) / MS_PER_DAY);
}

export function calculateTotalUnits(
  boxes: number,
  looseUnits: number,
  unitsPerBox: number
): number {
  const safeBoxes = Number.isFinite(boxes) ? Math.max(0, Math.floor(boxes)) : 0;
  const safeLoose = Number.isFinite(looseUnits)
    ? Math.max(0, Math.floor(looseUnits))
    : 0;
  const safePerBox = Number.isFinite(unitsPerBox)
    ? Math.max(1, Math.floor(unitsPerBox))
    : 1;
  return safeBoxes * safePerBox + safeLoose;
}

export function deriveLotStatus(
  daysToExpiry: number,
  totalUnits: number,
  currentStatus: string,
  alertThresholdDays = 60,
  hasPackagingStock = totalUnits > 0
): string {
  if (totalUnits <= 0 && !hasPackagingStock) return "AGOTADO";
  if (currentStatus === "CUARENTENA") return "CUARENTENA";
  if (daysToExpiry < 0) return "VENCIDO";
  if (daysToExpiry <= 15) return "CRITICO";
  if (daysToExpiry <= Math.max(16, alertThresholdDays)) return "PROXIMO_VENCER";
  return "ACTIVO";
}

export function computeLotStockMetrics(
  counts: PackagingCounts,
  product: ProductEquivalences,
  manualTotalUnits?: number
) {
  const hasStock = hasAnyPackagingStock(counts);
  const computedUnits = calculateUnitsFromPackaging(counts, product);
  const totalUnits =
    manualTotalUnits !== undefined && manualTotalUnits > 0 && computedUnits === 0
      ? Math.floor(manualTotalUnits)
      : computedUnits;
  const quantityText = buildQuantityText(counts, product);
  return { hasStock, totalUnits, quantityText };
}

export async function logActivity(params: {
  entityType: string;
  entityId?: string | null;
  action: string;
  actor?: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  return prisma.activityLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      actor: params.actor?.trim() || "Sistema Corta Fecha",
      summary: params.summary,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}

export async function dispatchExpiryAlertWhatsApp(options?: {
  actor?: string;
  onlyUnsent?: boolean;
  isDigest?: boolean;
  markAsSent?: boolean;
}): Promise<SendAlertWhatsAppResult> {
  const actor = options?.actor?.trim() || "Motor Automático";
  const onlyUnsent = options?.onlyUnsent ?? true;
  const markAsSent = options?.markAsSent ?? true;
  const cfg = getWhatsAppConfigStatus();

  const alerts = await prisma.alert.findMany({
    where: {
      acknowledged: false,
      type: {
        in: [
          "PRODUCTO_VENCIDO",
          "VENCIMIENTO_CRITICO",
          "VENCIMIENTO_PREVENTIVO",
        ],
      },
      daysToExpiry: { lte: 60 },
      ...(onlyUnsent ? { emailSentAt: null } : {}),
    },
    include: {
      lot: {
        include: {
          product: true,
          warehouse: true,
        },
      },
    },
    orderBy: [{ daysToExpiry: "asc" }, { createdAt: "desc" }],
  });

  if (alerts.length === 0) {
    return {
      sent: false,
      skipped: true,
      reason: onlyUnsent
        ? "No hay alertas nuevas (≤ 60 días) pendientes de envío por WhatsApp."
        : "No hay alertas activas con ≤ 60 días para enviar.",
      recipient: cfg.recipient,
      displayRecipient: cfg.displayRecipient,
      count: 0,
    };
  }

  try {
    const result = await sendExpirationAlertsWhatsApp(alerts, {
      isDigest: options?.isDigest,
      actor,
    });

    if (result.sent) {
      if (markAsSent) {
        await prisma.alert.updateMany({
          where: { id: { in: alerts.map((a) => a.id) } },
          data: { emailSentAt: new Date() },
        });
      }

      await logActivity({
        entityType: "ALERTA",
        action: "WHATSAPP_ALERTA_ENVIADO",
        actor,
        summary: `Notificación WhatsApp enviada a ${result.displayRecipient} con ${result.count} alerta(s) de vencimiento (≤ 60 días).`,
        details: {
          recipient: result.recipient,
          provider: cfg.provider,
          count: result.count,
          messageId: result.messageId ?? null,
          isDigest: Boolean(options?.isDigest),
        },
      });
    }

    return result;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Error desconocido al enviar notificación por WhatsApp";
    console.error("Error enviando alertas por WhatsApp:", error);

    await logActivity({
      entityType: "ALERTA",
      action: "WHATSAPP_ALERTA_ERROR",
      actor,
      summary: `Error al enviar alerta por WhatsApp a ${cfg.displayRecipient}: ${reason}`,
      details: { recipient: cfg.recipient, count: alerts.length, reason },
    });

    return {
      sent: false,
      skipped: false,
      reason,
      recipient: cfg.recipient,
      displayRecipient: cfg.displayRecipient,
      count: alerts.length,
    };
  }
}

export async function dispatchExpiryAlertTelegram(options?: {
  actor?: string;
  onlyUnsent?: boolean;
  isDigest?: boolean;
  markAsSent?: boolean;
}): Promise<SendAlertTelegramResult> {
  const actor = options?.actor?.trim() || "Motor Automático";
  const onlyUnsent = options?.onlyUnsent ?? true;
  const markAsSent = options?.markAsSent ?? true;
  const cfg = getTelegramConfigStatus();

  const alerts = await prisma.alert.findMany({
    where: {
      acknowledged: false,
      type: {
        in: [
          "PRODUCTO_VENCIDO",
          "VENCIMIENTO_CRITICO",
          "VENCIMIENTO_PREVENTIVO",
        ],
      },
      daysToExpiry: { lte: 60 },
      ...(onlyUnsent ? { emailSentAt: null } : {}),
    },
    include: {
      lot: {
        include: {
          product: true,
          warehouse: true,
        },
      },
    },
    orderBy: [{ daysToExpiry: "asc" }, { createdAt: "desc" }],
  });

  if (alerts.length === 0) {
    return {
      sent: false,
      skipped: true,
      reason: onlyUnsent
        ? "No hay alertas nuevas (≤ 60 días) pendientes de envío por Telegram."
        : "No hay alertas activas con ≤ 60 días para enviar.",
      chatIds: cfg.chatIds,
      displayRecipient: cfg.displayRecipient,
      count: 0,
    };
  }

  try {
    const result = await sendExpirationAlertsTelegram(alerts, {
      isDigest: options?.isDigest,
      actor,
    });

    if (result.sent) {
      if (markAsSent) {
        await prisma.alert.updateMany({
          where: { id: { in: alerts.map((a) => a.id) } },
          data: { emailSentAt: new Date() },
        });
      }

      await logActivity({
        entityType: "ALERTA",
        action: "TELEGRAM_ALERTA_ENVIADO",
        actor,
        summary: `Notificación Telegram enviada (${result.displayRecipient}) con ${result.count} alerta(s) de vencimiento (≤ 60 días).`,
        details: {
          chatIds: result.chatIds,
          count: result.count,
          messageId: result.messageId ?? null,
          isDigest: Boolean(options?.isDigest),
        },
      });
    }

    return result;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Error desconocido al enviar notificación por Telegram";
    console.error("Error enviando alertas por Telegram:", error);

    await logActivity({
      entityType: "ALERTA",
      action: "TELEGRAM_ALERTA_ERROR",
      actor,
      summary: `Error al enviar alerta por Telegram (${cfg.displayRecipient}): ${reason}`,
      details: { chatIds: cfg.chatIds, count: alerts.length, reason },
    });

    return {
      sent: false,
      skipped: false,
      reason,
      chatIds: cfg.chatIds,
      displayRecipient: cfg.displayRecipient,
      count: alerts.length,
    };
  }
}

export async function dispatchPendingExpiryNotifications(
  actor = "Motor Automático"
) {
  const [whatsappResult, telegramResult] = await Promise.all([
    dispatchExpiryAlertWhatsApp({
      actor,
      onlyUnsent: true,
      isDigest: false,
      markAsSent: false,
    }),
    dispatchExpiryAlertTelegram({
      actor,
      onlyUnsent: true,
      isDigest: false,
      markAsSent: false,
    }),
  ]);

  if (whatsappResult?.sent || telegramResult?.sent) {
    await prisma.alert.updateMany({
      where: {
        acknowledged: false,
        emailSentAt: null,
        type: {
          in: [
            "PRODUCTO_VENCIDO",
            "VENCIMIENTO_CRITICO",
            "VENCIMIENTO_PREVENTIVO",
          ],
        },
        daysToExpiry: { lte: 60 },
      },
      data: { emailSentAt: new Date() },
    });
  }

  return { whatsappResult, telegramResult };
}

export function schedulePendingExpiryNotifications(
  actor = "Motor Automático"
) {
  after(async () => {
    try {
      await dispatchPendingExpiryNotifications(actor);
    } catch (err) {
      console.error("Error enviando notificaciones en segundo plano:", err);
    }
  });
}

/**
 * Recalcula estados de todos los lotes y sincroniza alertas preventivas/críticas
 * sin duplicar alertas activas para un mismo lote y tipo.
 */
export async function syncAlertsAndStatuses(
  actor = "Motor Automático",
  options?: { sendWhatsApp?: boolean; sendTelegram?: boolean }
) {
  const now = new Date();
  const EXPIRY_ALERT_TYPES = [
    "PRODUCTO_VENCIDO",
    "VENCIMIENTO_CRITICO",
    "VENCIMIENTO_PREVENTIVO",
  ];

  const [lots, allActiveExpiryAlerts] = await Promise.all([
    prisma.inventoryLot.findMany({
      include: {
        product: true,
        warehouse: true,
      },
    }),
    prisma.alert.findMany({
      where: {
        acknowledged: false,
        type: { in: EXPIRY_ALERT_TYPES },
      },
    }),
  ]);

  const alertsByLot = new Map<string, typeof allActiveExpiryAlerts>();
  for (const alert of allActiveExpiryAlerts) {
    if (!alert.lotId) continue;
    const arr = alertsByLot.get(alert.lotId) ?? [];
    arr.push(alert);
    alertsByLot.set(alert.lotId, arr);
  }

  let updatedStatuses = 0;
  let createdAlerts = 0;
  let resolvedAlerts = 0;

  for (const lot of lots) {
    const daysToExpiry = computeDaysToExpiry(lot.expiryDate, now);
    const counts: PackagingCounts = {
      boxes: lot.boxes,
      packs: lot.packs,
      dispacks: lot.dispacks,
      displays: lot.displays,
      bags: lot.bags,
      looseUnits: lot.looseUnits,
    };
    const hasStock = hasAnyPackagingStock(counts);
    const computedUnits = calculateUnitsFromPackaging(counts, lot.product);
    const totalUnits =
      computedUnits > 0
        ? computedUnits
        : hasStock
        ? lot.totalUnits
        : 0;
    const quantityText = lot.quantityText?.trim()
      ? lot.quantityText
      : buildQuantityText(counts, lot.product);

    const nextStatus = deriveLotStatus(
      daysToExpiry,
      totalUnits,
      lot.status,
      lot.product.alertThresholdDays,
      hasStock
    );

    if (
      nextStatus !== lot.status ||
      totalUnits !== lot.totalUnits ||
      quantityText !== lot.quantityText
    ) {
      await prisma.inventoryLot.update({
        where: { id: lot.id },
        data: { status: nextStatus, totalUnits, quantityText },
      });
      updatedStatuses++;
    }

    const stockDesc =
      totalUnits > 0 ? `${quantityText} (${totalUnits} u.)` : quantityText;

    let targetAlert: {
      type: string;
      severity: string;
      title: string;
      message: string;
    } | null = null;

    if ((totalUnits > 0 || hasStock) && nextStatus !== "CUARENTENA") {
      if (daysToExpiry < 0) {
        targetAlert = {
          type: "PRODUCTO_VENCIDO",
          severity: "ALTA",
          title: `Lote vencido: ${lot.product.name}`,
          message: `El lote ${lot.lotNumber} (${lot.product.sku}) en ${
            lot.warehouse.name
          } venció hace ${Math.abs(
            daysToExpiry
          )} día(s). Cantidad: ${stockDesc}. Retirar de venta inmediatamente.`,
        };
      } else if (daysToExpiry <= 15) {
        targetAlert = {
          type: "VENCIMIENTO_CRITICO",
          severity: "ALTA",
          title: `Vencimiento crítico (${daysToExpiry}d): ${lot.product.name}`,
          message: `El lote ${lot.lotNumber} (${lot.product.sku}) en ${lot.warehouse.name} vence en ${daysToExpiry} día(s). Cantidad: ${stockDesc}. Priorizar despacho o liquidación.`,
        };
      } else if (daysToExpiry <= Math.max(60, lot.product.alertThresholdDays)) {
        targetAlert = {
          type: "VENCIMIENTO_PREVENTIVO",
          severity: "MEDIA",
          title: `Próximo a vencer (${daysToExpiry}d): ${lot.product.name}`,
          message: `El lote ${lot.lotNumber} (${lot.product.sku}) en ${lot.warehouse.name} vence en ${daysToExpiry} día(s). Cantidad reportada: ${stockDesc}.`,
        };
      }
    }

    const activeLotAlerts = alertsByLot.get(lot.id) ?? [];

    if (!targetAlert) {
      if (activeLotAlerts.length > 0) {
        await prisma.alert.updateMany({
          where: { id: { in: activeLotAlerts.map((a) => a.id) } },
          data: {
            acknowledged: true,
            acknowledgedBy: actor,
            acknowledgedAt: now,
          },
        });
        resolvedAlerts += activeLotAlerts.length;
      }
    } else {
      const sameType = activeLotAlerts.find((a) => a.type === targetAlert.type);
      const otherTypes = activeLotAlerts.filter((a) => a.type !== targetAlert.type);

      if (otherTypes.length > 0) {
        await prisma.alert.updateMany({
          where: { id: { in: otherTypes.map((a) => a.id) } },
          data: {
            acknowledged: true,
            acknowledgedBy: actor,
            acknowledgedAt: now,
          },
        });
        resolvedAlerts += otherTypes.length;
      }

      if (sameType) {
        if (
          sameType.daysToExpiry !== daysToExpiry ||
          sameType.severity !== targetAlert.severity ||
          sameType.title !== targetAlert.title ||
          sameType.message !== targetAlert.message
        ) {
          await prisma.alert.update({
            where: { id: sameType.id },
            data: {
              daysToExpiry,
              severity: targetAlert.severity,
              title: targetAlert.title,
              message: targetAlert.message,
            },
          });
        }
      } else {
        await prisma.alert.create({
          data: {
            lotId: lot.id,
            type: targetAlert.type,
            severity: targetAlert.severity,
            title: targetAlert.title,
            message: targetAlert.message,
            daysToExpiry,
          },
        });
        createdAlerts++;
      }
    }
  }

  let whatsappResult: SendAlertWhatsAppResult | null = null;
  if (options?.sendWhatsApp !== false) {
    whatsappResult = await dispatchExpiryAlertWhatsApp({
      actor,
      onlyUnsent: true,
      isDigest: false,
      markAsSent: false,
    });
  }

  let telegramResult: SendAlertTelegramResult | null = null;
  if (options?.sendTelegram !== false) {
    telegramResult = await dispatchExpiryAlertTelegram({
      actor,
      onlyUnsent: true,
      isDigest: false,
      markAsSent: false,
    });
  }

  if (whatsappResult?.sent || telegramResult?.sent) {
    await prisma.alert.updateMany({
      where: {
        acknowledged: false,
        emailSentAt: null,
        type: { in: EXPIRY_ALERT_TYPES },
        daysToExpiry: { lte: 60 },
      },
      data: { emailSentAt: new Date() },
    });
  }

  return {
    scannedLots: lots.length,
    updatedStatuses,
    createdAlerts,
    resolvedAlerts,
    whatsappResult,
    telegramResult,
  };
}
