import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity, syncAlertsAndStatuses } from "@/lib/corta-fecha";
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

    const autoSync = await syncAlertsAndStatuses("Detección Automática").catch(
      (err) => {
        console.error("Error en sincronización automática GET /api/alerts:", err);
        return null;
      }
    );

    const rawAlerts = await prisma.alert.findMany({
      where,
      include: {
        lot: {
          include: {
            product: true,
            warehouse: true,
          },
        },
      },
      orderBy: [{ acknowledged: "asc" }, { createdAt: "desc" }],
    });

    const severityOrder: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    const alerts = rawAlerts.sort((a, b) => {
      const sDiff =
        (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      if (sDiff !== 0) return sDiff;
      const dDiff = (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999);
      if (dDiff !== 0) return dDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const telegramCfg = getTelegramConfigStatus();

    return NextResponse.json({
      alerts,
      autoTelegramResult: autoSync?.telegramResult ?? null,
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
