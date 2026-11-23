import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeDaysToExpiry,
  computeLotStockMetrics,
  deriveLotStatus,
  logActivity,
  syncAlertsAndStatuses,
} from "@/lib/corta-fecha";
import { parseFlexibleExpiryInput, sanitizeCounts } from "@/lib/packaging";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const existing = await prisma.inventoryLot.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Lote no encontrado" },
        { status: 404 }
      );
    }

    const counts = sanitizeCounts({
      boxes: body.boxes !== undefined ? body.boxes : existing.boxes,
      packs: body.packs !== undefined ? body.packs : existing.packs,
      dispacks: body.dispacks !== undefined ? body.dispacks : existing.dispacks,
      displays: body.displays !== undefined ? body.displays : existing.displays,
      bags: body.bags !== undefined ? body.bags : existing.bags,
      looseUnits:
        body.looseUnits !== undefined ? body.looseUnits : existing.looseUnits,
    });

    const hasExpiryUpdate =
      body.expiryDate !== undefined ||
      body.expiryMonth !== undefined ||
      body.expiryPrecision !== undefined;

    const parsedExpiry = hasExpiryUpdate
      ? parseFlexibleExpiryInput({
          expiryDate:
            body.expiryDate ?? existing.expiryDate.toISOString().slice(0, 10),
          expiryMonth: body.expiryMonth,
          expiryPrecision: body.expiryPrecision ?? existing.expiryPrecision,
          expiryDisplay: body.expiryDisplay,
        })
      : {
          expiryDate: existing.expiryDate,
          expiryPrecision: existing.expiryPrecision,
          expiryDisplay: existing.expiryDisplay,
        };

    const locationCode =
      body.locationCode !== undefined
        ? body.locationCode
          ? String(body.locationCode).trim()
          : null
        : existing.locationCode;
    const notes =
      body.notes !== undefined
        ? body.notes
          ? String(body.notes).trim()
          : null
        : existing.notes;
    const requestedStatus = body.status ?? existing.status;

    const { hasStock, totalUnits, quantityText: autoQuantityText } =
      computeLotStockMetrics(counts, existing.product, body.manualTotalUnits);
    const quantityText =
      body.quantityText !== undefined && String(body.quantityText).trim()
        ? String(body.quantityText).trim()
        : autoQuantityText;

    const daysToExpiry = computeDaysToExpiry(parsedExpiry.expiryDate);
    const nextStatus = deriveLotStatus(
      daysToExpiry,
      totalUnits,
      requestedStatus,
      existing.product.alertThresholdDays,
      hasStock
    );

    const updated = await prisma.inventoryLot.update({
      where: { id },
      data: {
        boxes: counts.boxes,
        packs: counts.packs,
        dispacks: counts.dispacks,
        displays: counts.displays,
        bags: counts.bags,
        looseUnits: counts.looseUnits,
        totalUnits,
        quantityText,
        expiryDate: parsedExpiry.expiryDate,
        expiryPrecision: parsedExpiry.expiryPrecision,
        expiryDisplay: parsedExpiry.expiryDisplay,
        locationCode,
        notes,
        status: nextStatus,
      },
      include: { product: true, warehouse: true },
    });

    await logActivity({
      entityType: "LOTE",
      entityId: updated.id,
      action: "ACTUALIZAR",
      actor: body.actor || "Encargada de Bodega",
      summary: `Lote ${updated.lotNumber} (${updated.product.name}) actualizado: ${updated.quantityText}, estado ${updated.status}`,
    });

    await syncAlertsAndStatuses(body.actor || "Encargada de Bodega");

    return NextResponse.json({
      lot: { ...updated, daysToExpiry },
    });
  } catch (error) {
    console.error("Error en PATCH /api/inventory/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el lote" },
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
    const existing = await prisma.inventoryLot.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Lote no encontrado" },
        { status: 404 }
      );
    }

    await prisma.inventoryLot.delete({ where: { id } });

    const actor = req.nextUrl.searchParams.get("actor") || "Administrador";
    await logActivity({
      entityType: "LOTE",
      entityId: id,
      action: "ELIMINAR",
      actor,
      summary: `Lote ${existing.lotNumber} (${existing.product.name} en ${existing.warehouse.name}) eliminado del inventario`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en DELETE /api/inventory/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el lote" },
      { status: 400 }
    );
  }
}
