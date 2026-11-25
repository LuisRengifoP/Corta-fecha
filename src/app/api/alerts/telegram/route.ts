import { NextRequest, NextResponse } from "next/server";
import { dispatchExpiryAlertTelegram } from "@/lib/corta-fecha";
import { getTelegramConfigStatus } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = String(body.actor ?? "Usuario").trim() || "Usuario";
    const onlyUnsent = Boolean(body.onlyUnsent ?? false);

    const cfg = getTelegramConfigStatus();
    const telegramResult = await dispatchExpiryAlertTelegram({
      actor,
      onlyUnsent,
      isDigest: !onlyUnsent,
    });

    if (!telegramResult.sent && !telegramResult.skipped) {
      return NextResponse.json(
        {
          error:
            telegramResult.reason ||
            "No se pudo enviar la notificación por Telegram",
          telegramResult,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      telegramResult,
      telegramConfig: {
        configured: cfg.configured,
        chatIds: cfg.chatIds,
        displayRecipient: cfg.displayRecipient,
      },
    });
  } catch (error) {
    console.error("Error en POST /api/alerts/telegram:", error);
    return NextResponse.json(
      { error: "No se pudo procesar el envío de alertas por Telegram" },
      { status: 500 }
    );
  }
}
