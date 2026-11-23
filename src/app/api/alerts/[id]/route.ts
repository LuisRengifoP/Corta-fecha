import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/corta-fecha";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const acknowledged = Boolean(body.acknowledged ?? true);
    const acknowledgedBy = String(body.acknowledgedBy ?? "Supervisor").trim();

    const alert = await prisma.alert.update({
      where: { id },
      data: {
        acknowledged,
        acknowledgedBy: acknowledged ? acknowledgedBy : null,
        acknowledgedAt: acknowledged ? new Date() : null,
      },
      include: {
        lot: { include: { product: true, warehouse: true } },
      },
    });

    await logActivity({
      entityType: "ALERTA",
      entityId: alert.id,
      action: acknowledged ? "ATENDER_ALERTA" : "REABRIR_ALERTA",
      actor: acknowledgedBy,
      summary: `${acknowledged ? "Alerta atendida" : "Alerta reabierta"}: ${alert.title}`,
    });

    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Error en PATCH /api/alerts/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la alerta" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor =
      req.nextUrl.searchParams.get("actor")?.trim() || "Supervisor";

    const existing = await prisma.alert.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Alerta no encontrada" },
        { status: 404 }
      );
    }

    await prisma.alert.delete({ where: { id } });

    await logActivity({
      entityType: "ALERTA",
      entityId: id,
      action: "ELIMINAR_ALERTA",
      actor,
      summary: `Alerta eliminada: ${existing.title}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en DELETE /api/alerts/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar la alerta" },
      { status: 400 }
    );
  }
}
