import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeDaysToExpiry,
  computeLotStockMetrics,
  deriveLotStatus,
  dispatchPendingExpiryNotifications,
  logActivity,
  syncAlertsAndStatuses,
} from "@/lib/corta-fecha";
import { buildQuantityText } from "@/lib/packaging";

export async function GET(req: NextRequest) {
  try {
    const resolutionStatus = req.nextUrl.searchParams.get("resolutionStatus") ?? "";
    const warehouseId = req.nextUrl.searchParams.get("warehouseId") ?? "";

    const records = await prisma.damagedRecord.findMany({
      where: {
        ...(resolutionStatus ? { resolutionStatus } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: {
        product: true,
        warehouse: true,
        lot: true,
      },
      orderBy: { reportedAt: "desc" },
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error("Error en GET /api/damaged:", error);
    return NextResponse.json(
      { error: "Error al listar productos averiados" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const lotId = String(body.lotId ?? "");
    const reportedBy = String(body.reportedBy ?? "").trim();
    const damageType = String(body.damageType ?? "EMPAQUE_DANADO");
    const severity = String(body.severity ?? "MODERADA");
    const rawBoxes = Number(body.boxesAffected ?? 0);
    const rawLoose = Number(body.looseUnitsAffected ?? 0);
    const boxesAffected = Number.isFinite(rawBoxes)
      ? Math.max(0, Math.floor(rawBoxes))
      : 0;
    const looseUnitsAffected = Number.isFinite(rawLoose)
      ? Math.max(0, Math.floor(rawLoose))
      : 0;
    const actionTaken = String(body.actionTaken ?? "CUARENTENA");
    const stockDeducted = Boolean(body.stockDeducted ?? true);
    const quarantineLot = Boolean(body.quarantineLot ?? false);
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!lotId || !reportedBy) {
      return NextResponse.json(
        { error: "Debe seleccionar un lote y especificar quien reporta la avería" },
        { status: 400 }
      );
    }

    const lot = await prisma.inventoryLot.findUnique({
      where: { id: lotId },
      include: { product: true, warehouse: true },
    });
    if (!lot) {
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }

    const unitsAffected =
      boxesAffected * lot.product.unitsPerBox + looseUnitsAffected;
    if (unitsAffected <= 0) {
      return NextResponse.json(
        { error: "La cantidad afectada (cajas o unidades) debe ser mayor a 0" },
        { status: 400 }
      );
    }

    const estimatedLoss =
      body.estimatedLoss !== undefined && Number(body.estimatedLoss) > 0
        ? Number(body.estimatedLoss)
        : unitsAffected * lot.product.unitCost;

    const record = await prisma.damagedRecord.create({
      data: {
        lotId: lot.id,
        productId: lot.productId,
        warehouseId: lot.warehouseId,
        reportedBy,
        damageType,
        severity,
        boxesAffected,
        unitsAffected,
        estimatedLoss,
        actionTaken,
        resolutionStatus: "PENDIENTE",
        stockDeducted,
        notes,
      },
      include: {
        product: true,
        warehouse: true,
        lot: true,
      },
    });

    if (stockDeducted || quarantineLot) {
      const remainingUnits = stockDeducted
        ? Math.max(0, lot.totalUnits - unitsAffected)
        : lot.totalUnits;
      const perBox = Math.max(1, lot.product.unitsPerBox);
      const nextBoxes = stockDeducted
        ? Math.floor(remainingUnits / perBox)
        : lot.boxes;
      const nextLoose = stockDeducted ? remainingUnits % perBox : lot.looseUnits;

      const updatedCounts = {
        boxes: nextBoxes,
        packs: stockDeducted ? 0 : lot.packs,
        dispacks: stockDeducted ? 0 : lot.dispacks,
        displays: stockDeducted ? 0 : lot.displays,
        bags: stockDeducted ? 0 : lot.bags,
        looseUnits: nextLoose,
      };
      const metrics = computeLotStockMetrics(updatedCounts, lot.product);
      const days = computeDaysToExpiry(lot.expiryDate);
      const nextStatus = quarantineLot
        ? remainingUnits > 0 || metrics.hasStock
          ? "CUARENTENA"
          : "AGOTADO"
        : deriveLotStatus(
            days,
            remainingUnits,
            lot.status,
            lot.product.alertThresholdDays,
            metrics.hasStock
          );

      await prisma.inventoryLot.update({
        where: { id: lot.id },
        data: {
          ...updatedCounts,
          totalUnits: remainingUnits,
          quantityText: stockDeducted
            ? buildQuantityText(updatedCounts, lot.product)
            : lot.quantityText,
          status: nextStatus,
        },
      });
    }

    await logActivity({
      entityType: "AVERIA",
      entityId: record.id,
      action: "REPORTAR_AVERIA",
      actor: reportedBy,
      summary: `Avería reportada (${damageType}) en ${lot.product.name} — Lote ${lot.lotNumber}: ${unitsAffected} u. afectadas`,
      details: {
        boxesAffected,
        looseUnitsAffected,
        unitsAffected,
        estimatedLoss,
        stockDeducted,
        actionTaken,
      },
    });

    await syncAlertsAndStatuses(reportedBy, {
      sendWhatsApp: false,
      sendTelegram: false,
    });
    after(() => {
      void dispatchPendingExpiryNotifications(reportedBy).catch((err) =>
        console.error("Error enviando notificaciones en segundo plano:", err)
      );
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/damaged:", error);
    return NextResponse.json(
      { error: "No se pudo registrar el producto averiado" },
      { status: 400 }
    );
  }
}
