import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity, syncAlertsAndStatuses } from "@/lib/corta-fecha";
import { getWhatsAppConfigStatus } from "@/lib/whatsapp";
import { getTelegramConfigStatus } from "@/lib/telegram";

export async function GET(req: NextRequest) {
  try {
    const showAcknowledged =
      req.nextUrl.searchParams.get("acknowledged") === "true";
    const severity = req.nextUrl.searchParams.get("severity") ?? "";
    const countOnly = req.nextUrl.searchParams.get("countOnly") === "true";

    const where = {
      acknowledged: showAcknowledged,
      ...(severity ? { severity } : {}),
    };

    if (countOnly) {
      const count = await prisma.alert.count({ where });
      return NextResponse.json({ count });
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        lot: {
          include: {
            product: true,
            warehouse: true,
          },
        },
      },
      orderBy: [{ acknowledged: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
    });

    const whatsappCfg = getWhatsAppConfigStatus();
    const telegramCfg = getTelegramConfigStatus();

    return NextResponse.json({
      alerts,
      whatsappConfig: {
        configured: whatsappCfg.configured,
        provider: whatsappCfg.provider,
        recipient: whatsappCfg.recipient,
        displayRecipient: whatsappCfg.displayRecipient,
      },
      telegramConfig: {
        configured: telegramCfg.configured,
        chatIds: telegramCfg.chatIds,
        displayRecipient: telegramCfg.displayRecipient,
      },
    });
  } catch (error) {
    console.error("Error en GET /api/alerts:", error);
    return NextResponse.json(
      { error: "Error al listar alertas" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = String(body.actor ?? "Usuario").trim() || "Usuario";
    const result = await syncAlertsAndStatuses(actor);

    await logActivity({
      entityType: "ALERTA",
      action: "SINCRONIZAR_ALERTAS",
      actor,
      summary: `Escaneo automático ejecutado: ${result.scannedLots} lotes revisados, ${result.createdAlerts} alertas nuevas, ${result.resolvedAlerts} cerradas.`,
      details: result,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Error en POST /api/alerts:", error);
    return NextResponse.json(
      { error: "No se pudo ejecutar el análisis automático de alertas" },
      { status: 500 }
    );
  }
}
