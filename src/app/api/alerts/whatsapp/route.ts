import { NextRequest, NextResponse } from "next/server";
import { dispatchExpiryAlertWhatsApp, logActivity } from "@/lib/corta-fecha";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfigStatus } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = String(body.actor ?? "Usuario").trim() || "Usuario";
    const onlyUnsent = Boolean(body.onlyUnsent ?? false);
    const markManualSent = Boolean(body.markManualSent ?? false);

    const cfg = getWhatsAppConfigStatus();

    if (markManualSent) {
      const now = new Date();
      const updated = await prisma.alert.updateMany({
        where: {
          acknowledged: false,
          type: {
            in: [
              "PRODUCTO_VENCIDO",
              "VENCIMIENTO_CRITICO",
              "VENCIMIENTO_PREVENTIVO",
            ],
          },
          daysToExpiry: { lte: 30 },
        },
        data: { emailSentAt: now },
      });

      await logActivity({
        entityType: "ALERTA",
        action: "WHATSAPP_ALERTA_MANUAL",
        actor,
        summary: `Resumen de alertas enviado manualmente por WhatsApp a ${cfg.displayRecipient} (${updated.count} alerta(s) marcadas como notificadas).`,
      });

      return NextResponse.json({ ok: true, updatedCount: updated.count });
    }

    const whatsappResult = await dispatchExpiryAlertWhatsApp({
      actor,
      onlyUnsent,
      isDigest: !onlyUnsent,
    });

    if (!whatsappResult.sent && !whatsappResult.skipped) {
      return NextResponse.json(
        {
          error:
            whatsappResult.reason ||
            "No se pudo enviar la notificación por WhatsApp",
          whatsappResult,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      whatsappResult,
      whatsappConfig: {
        configured: cfg.configured,
        provider: cfg.provider,
        recipient: cfg.recipient,
        displayRecipient: cfg.displayRecipient,
      },
    });
  } catch (error) {
    console.error("Error en POST /api/alerts/whatsapp:", error);
    return NextResponse.json(
      { error: "No se pudo procesar el envío de alertas por WhatsApp" },
      { status: 500 }
    );
  }
}
