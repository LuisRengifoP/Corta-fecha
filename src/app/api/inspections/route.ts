import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeDaysToExpiry,
  computeLotStockMetrics,
  deriveLotStatus,
  logActivity,
  syncAlertsAndStatuses,
} from "@/lib/corta-fecha";

export async function GET(req: NextRequest) {
  try {
    const warehouseId = req.nextUrl.searchParams.get("warehouseId") ?? "";
    const status = req.nextUrl.searchParams.get("status") ?? "";

    const inspections = await prisma.inspection.findMany({
      where: {
        ...(warehouseId ? { warehouseId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        warehouse: true,
        lot: {
          include: { product: true },
        },
      },
      orderBy: { inspectedAt: "desc" },
    });

    return NextResponse.json({ inspections });
  } catch (error) {
    console.error("Error en GET /api/inspections:", error);
    return NextResponse.json(
      { error: "Error al listar inspecciones" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let warehouseId = String(body.warehouseId ?? "").trim();
    const lotId = body.lotId ? String(body.lotId).trim() : null;
    const inspectorName = String(body.inspectorName ?? "").trim();
    const inspectionType = String(body.inspectionType ?? "PROGRAMADA");
    const status = String(body.status ?? "APROBADA");
    const rawBoxes = Number(body.checkedBoxes ?? 0);
    const rawUnits = Number(body.checkedUnits ?? 0);
    const checkedBoxes = Number.isFinite(rawBoxes)
      ? Math.max(0, Math.floor(rawBoxes))
      : 0;
    const checkedUnits = Number.isFinite(rawUnits)
      ? Math.max(0, Math.floor(rawUnits))
      : 0;
    const expiryVerified = Boolean(body.expiryVerified ?? true);
    const findings = String(body.findings ?? "").trim();
    const correctiveAction = body.correctiveAction
      ? String(body.correctiveAction).trim()
      : null;
    const syncStockFromInspection = Boolean(body.syncStockFromInspection ?? false);

    if (!warehouseId) {
      const defaultWh = await prisma.warehouse.findFirst({
        orderBy: { createdAt: "asc" },
      });
      warehouseId = defaultWh?.id ?? "";
    }

    if (!warehouseId || !inspectorName || !findings) {
      return NextResponse.json(
        { error: "Bodega, nombre del inspector y hallazgos son obligatorios" },
        { status: 400 }
      );
    }

    const now = new Date();
    const inspection = await prisma.inspection.create({
      data: {
        warehouseId,
        lotId,
        inspectorName,
        inspectionType,
        status,
        checkedBoxes,
        checkedUnits,
        expiryVerified,
        findings,
        correctiveAction,
        inspectedAt: now,
      },
      include: {
        warehouse: true,
        lot: { include: { product: true } },
      },
    });

    if (lotId) {
      const lot = await prisma.inventoryLot.findUnique({
        where: { id: lotId },
        include: { product: true },
      });
      if (lot) {
        const updateData: {
          lastInspectedAt: Date;
          boxes?: number;
          looseUnits?: number;
          totalUnits?: number;
          quantityText?: string;
          status?: string;
        } = { lastInspectedAt: now };

        if (syncStockFromInspection) {
          const metrics = computeLotStockMetrics(
            {
              boxes: checkedBoxes,
              packs: lot.packs,
              dispacks: lot.dispacks,
              displays: lot.displays,
              bags: lot.bags,
              looseUnits: checkedUnits,
            },
            lot.product
          );
          const days = computeDaysToExpiry(lot.expiryDate, now);
          updateData.boxes = checkedBoxes;
          updateData.looseUnits = checkedUnits;
          updateData.totalUnits = metrics.totalUnits;
          updateData.quantityText = metrics.quantityText;
          updateData.status = deriveLotStatus(
            days,
            metrics.totalUnits,
            lot.status,
            lot.product.alertThresholdDays,
            metrics.hasStock
          );
        }

        await prisma.inventoryLot.update({
          where: { id: lotId },
          data: updateData,
        });
      }
    }

    await logActivity({
      entityType: "INSPECCION",
      entityId: inspection.id,
      action: "INSPECCIONAR",
      actor: inspectorName,
      summary: `Inspección ${inspection.status} en ${inspection.warehouse.name}${
        inspection.lot
          ? ` — Lote ${inspection.lot.lotNumber} (${inspection.lot.product.name})`
          : ""
      }`,
      details: {
        inspectionType,
        checkedBoxes,
        checkedUnits,
        syncStockFromInspection,
      },
    });

    if (syncStockFromInspection) {
      await syncAlertsAndStatuses(inspectorName).catch((err) =>
        console.error("Error sincronizando y enviando alertas por Telegram:", err)
      );
    }

    return NextResponse.json({ inspection }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/inspections:", error);
    return NextResponse.json(
      { error: "No se pudo registrar la inspección" },
      { status: 400 }
    );
  }
}
