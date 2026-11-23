import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/corta-fecha";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: { lots: true, damagedRecords: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    if (existing._count.lots > 0 || existing._count.damagedRecords > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar "${existing.name}" porque tiene ${existing._count.lots} lote(s) y ${existing._count.damagedRecords} avería(s) asociadas. Elimina primero sus lotes vinculados.`,
        },
        { status: 400 }
      );
    }

    await prisma.product.delete({ where: { id } });

    const actor = req.nextUrl.searchParams.get("actor")?.trim() || "Administrador";
    await logActivity({
      entityType: "PRODUCTO",
      entityId: id,
      action: "ELIMINAR",
      actor,
      summary: `Producto eliminado del catálogo: ${existing.name} (Código: ${existing.sku})`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en DELETE /api/products/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el producto" },
      { status: 400 }
    );
  }
}
