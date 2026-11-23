import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/corta-fecha";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor =
      req.nextUrl.searchParams.get("actor")?.trim() || "Supervisor de Calidad";

    const existing = await prisma.inspection.findUnique({
      where: { id },
      include: {
        warehouse: true,
        lot: { include: { product: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Registro de inspección no encontrado" },
        { status: 404 }
      );
    }

    await prisma.inspection.delete({ where: { id } });

    await logActivity({
      entityType: "INSPECCION",
      entityId: id,
      action: "ELIMINAR_INSPECCION",
      actor,
      summary: `Inspección eliminada en ${existing.warehouse.name}${
        existing.lot
          ? ` — Lote ${existing.lot.lotNumber} (${existing.lot.product.name})`
          : " (Inspección general)"
      }`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en DELETE /api/inspections/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar la inspección" },
      { status: 400 }
    );
  }
}
