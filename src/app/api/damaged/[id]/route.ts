import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeDaysToExpiry,
  computeLotStockMetrics,
  deriveLotStatus,
  logActivity,
  syncAlertsAndStatuses,
} from "@/lib/corta-fecha";
import { buildQuantityText } from "@/lib/packaging";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const existing = await prisma.damagedRecord.findUnique({
      where: { id },
      include: { product: true, lot: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Registro de avería no encontrado" },
        { status: 404 }
      );
    }

    const resolutionStatus = body.resolutionStatus ?? existing.resolutionStatus;
    const actionTaken = body.actionTaken ?? existing.actionTaken;
    const notes =
      body.notes !== undefined ? String(body.notes).trim() : existing.notes;
    const resolvedAt =
      resolutionStatus === "RESUELTO"
        ? existing.resolvedAt ?? new Date()
        : null;

    const updated = await prisma.damagedRecord.update({
      where: { id },
      data: {
        resolutionStatus,
        actionTaken,
        notes,
        resolvedAt,
      },
      include: { product: true, warehouse: true, lot: true },
    });

    await logActivity({
      entityType: "AVERIA",
      entityId: updated.id,
      action:
        resolutionStatus === "RESUELTO"
          ? "RESOLVER_AVERIA"
          : "ACTUALIZAR_AVERIA",
      actor: body.actor || "Supervisor de Calidad",
      summary: `Avería de ${updated.product.name} (Lote ${updated.lot.lotNumber}) actualizada a estado ${resolutionStatus} — Acción: ${actionTaken}`,
    });

    return NextResponse.json({ record: updated });
  } catch (error) {
    console.error("Error en PATCH /api/damaged/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el registro de avería" },
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
    const restoreStock = req.nextUrl.searchParams.get("restoreStock") !== "false";
    const actor =
      req.nextUrl.searchParams.get("actor")?.trim() || "Supervisor de Calidad";

    const existing = await prisma.damagedRecord.findUnique({
      where: { id },
      include: { product: true, lot: true, warehouse: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Registro de avería no encontrado" },
        { status: 404 }
      );
    }

    const shouldRestoreStock = Boolean(
      existing.stockDeducted && restoreStock && existing.lot
    );

    if (shouldRestoreStock && existing.lot) {
      const restoredUnits = existing.lot.totalUnits + existing.unitsAffected;
      const perBox = Math.max(1, existing.product.unitsPerBox);
      const nextBoxes = Math.floor(restoredUnits / perBox);
      const nextLoose = restoredUnits % perBox;

      const updatedCounts = {
        boxes: nextBoxes,
        packs: 0,
        dispacks: 0,
        displays: 0,
        bags: 0,
        looseUnits: nextLoose,
      };
      const metrics = computeLotStockMetrics(updatedCounts, existing.product);
      const days = computeDaysToExpiry(existing.lot.expiryDate);
      const baseStatus =
        existing.lot.status === "AGOTADO" ? "ACTIVO" : existing.lot.status;
      const nextStatus = deriveLotStatus(
        days,
        restoredUnits,
        baseStatus,
        existing.product.alertThresholdDays,
        metrics.hasStock
      );

      await prisma.inventoryLot.update({
        where: { id: existing.lot.id },
        data: {
          ...updatedCounts,
          totalUnits: restoredUnits,
          quantityText: buildQuantityText(updatedCounts, existing.product),
          status: nextStatus,
        },
      });
    }

    await prisma.damagedRecord.delete({ where: { id } });

    await logActivity({
      entityType: "AVERIA",
      entityId: id,
      action: "ELIMINAR_AVERIA",
      actor,
      summary: `Registro de avería eliminado: ${existing.product.name} — Lote ${existing.lot.lotNumber} (${existing.unitsAffected} u.)${
        shouldRestoreStock ? " — Stock restaurado al lote" : ""
      }`,
      details: {
        unitsAffected: existing.unitsAffected,
        stockRestored: shouldRestoreStock,
      },
    });

    if (shouldRestoreStock) {
      await syncAlertsAndStatuses(actor);
    }

    return NextResponse.json({
      ok: true,
      stockRestored: shouldRestoreStock,
    });
  } catch (error) {
    console.error("Error en DELETE /api/damaged/[id]:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el registro de avería" },
      { status: 400 }
    );
  }
}
