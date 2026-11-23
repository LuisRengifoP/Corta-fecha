import { NextRequest, NextResponse } from "next/server";
import { dispatchExpiryAlertWhatsApp } from "@/lib/corta-fecha";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = String(body.actor ?? "Usuario").trim() || "Usuario";
    const onlyUnsent = Boolean(body.onlyUnsent ?? false);

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

    return NextResponse.json({ whatsappResult });
  } catch (error) {
    console.error("Error en POST /api/alerts/email (redirigido a WhatsApp):", error);
    return NextResponse.json(
      { error: "No se pudo procesar la notificación por WhatsApp" },
      { status: 500 }
    );
  }
}
