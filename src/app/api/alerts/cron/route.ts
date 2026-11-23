import { NextRequest, NextResponse } from "next/server";
import {
  dispatchExpiryAlertWhatsApp,
  logActivity,
  syncAlertsAndStatuses,
} from "@/lib/corta-fecha";

function hasValidCronSecret(req: NextRequest): boolean {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected) return false;
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  return bearer === expected || headerSecret === expected;
}

async function handleCron(req: NextRequest) {
  try {
    const sendDigest = req.nextUrl.searchParams.get("digest") === "true";
    const actor = hasValidCronSecret(req)
      ? "Tarea Programada (Cron)"
      : "Escaneo Programado";

    const syncResult = await syncAlertsAndStatuses(actor, {
      sendWhatsApp: !sendDigest,
    });

    const whatsappResult = sendDigest
      ? await dispatchExpiryAlertWhatsApp({
          actor,
          onlyUnsent: false,
          isDigest: true,
        })
      : syncResult.whatsappResult;

    await logActivity({
      entityType: "ALERTA",
      action: "CRON_ALERTAS",
      actor,
      summary: `Escaneo programado ejecutado: ${syncResult.scannedLots} lotes evaluados, ${syncResult.createdAlerts} alertas nuevas, ${syncResult.resolvedAlerts} cerradas.`,
      details: { ...syncResult, whatsappResult },
    });

    return NextResponse.json({
      ok: true,
      result: syncResult,
      whatsappResult,
    });
  } catch (error) {
    console.error("Error en /api/alerts/cron:", error);
    return NextResponse.json(
      { error: "Error al ejecutar escaneo programado de alertas" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
