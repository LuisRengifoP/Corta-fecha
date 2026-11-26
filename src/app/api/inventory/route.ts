import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeDaysToExpiry,
  computeLotStockMetrics,
  deriveLotStatus,
  logActivity,
  syncAlertsAndStatuses,
} from "@/lib/corta-fecha";
import {
  hasAnyPackagingStock,
  parseFlexibleExpiryInput,
  sanitizeCounts,
} from "@/lib/packaging";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const search = params.get("search")?.trim().toLowerCase() ?? "";
    const warehouseId = params.get("warehouseId") ?? "";
    const status = params.get("status") ?? "";
    const expiryWindow = params.get("expiryWindow") ?? "";

    if (!search && !warehouseId && !status && !expiryWindow) {
      await syncAlertsAndStatuses("Detección Automática").catch((err) =>
        console.error("Error en sincronización automática GET /api/inventory:", err)
      );
    }

    const lots = await prisma.inventoryLot.findMany({
      where: {
        ...(warehouseId ? { warehouseId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        product: { include: { supplier: true } },
        warehouse: true,
        _count: {
          select: { inspections: true, damagedRecords: true },
        },
      },
      orderBy: { expiryDate: "asc" },
    });

    const now = new Date();
    const enriched = lots
      .map((lot) => ({
        ...lot,
        daysToExpiry: computeDaysToExpiry(lot.expiryDate, now),
      }))
      .filter((lot) => {
        const active =
          lot.totalUnits > 0 ||
          hasAnyPackagingStock({
            boxes: lot.boxes,
            packs: lot.packs,
            dispacks: lot.dispacks,
            displays: lot.displays,
            bags: lot.bags,
            looseUnits: lot.looseUnits,
          });
        if (search) {
          const haystack = [
            lot.lotNumber,
            lot.locationCode ?? "",
            lot.quantityText,
            lot.expiryDisplay ?? "",
            lot.product.name,
            lot.product.sku,
            lot.product.barcode ?? "",
            lot.product.brand ?? "",
            lot.product.category,
            lot.product.supplier?.name ?? "",
            lot.warehouse.name,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        if (expiryWindow === "expired") return lot.daysToExpiry < 0 && active;
        if (expiryWindow === "critical") return lot.daysToExpiry <= 15 && active;
        if (expiryWindow === "15")
          return lot.daysToExpiry >= 0 && lot.daysToExpiry <= 15 && active;
        if (expiryWindow === "30")
          return lot.daysToExpiry >= 0 && lot.daysToExpiry <= 30 && active;
        if (expiryWindow === "60")
          return lot.daysToExpiry >= 0 && lot.daysToExpiry <= 60 && active;
        return true;
      });

    return NextResponse.json({ lots: enriched });
  } catch (error) {
    console.error("Error en GET /api/inventory:", error);
    return NextResponse.json(
      { error: "Error al consultar lotes de inventario" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productId = String(body.productId ?? "").trim();
    let warehouseId = String(body.warehouseId ?? "").trim();
    const lotNumber = String(body.lotNumber ?? "").trim().toUpperCase();
    const actor = String(body.actor ?? "").trim() || "Encargada de Bodega";
    const counts = sanitizeCounts({
      boxes: body.boxes,
      packs: body.packs,
      dispacks: body.dispacks,
      displays: body.displays,
      bags: body.bags,
      looseUnits: body.looseUnits,
    });
    const locationCode = body.locationCode
      ? String(body.locationCode).trim()
      : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!warehouseId) {
      const defaultWh = await prisma.warehouse.findFirst({
        orderBy: { createdAt: "asc" },
      });
      warehouseId = defaultWh?.id ?? "";
    }

    if (!productId || !warehouseId || !lotNumber) {
      return NextResponse.json(
        {
          error:
            "Producto, bodega y número de lote son obligatorios",
        },
        { status: 400 }
      );
    }

    let parsedExpiry: ReturnType<typeof parseFlexibleExpiryInput>;
    try {
      parsedExpiry = parseFlexibleExpiryInput({
        expiryDate: body.expiryDate,
        expiryMonth: body.expiryMonth,
        expiryPrecision: body.expiryPrecision,
        expiryDisplay: body.expiryDisplay,
      });
    } catch (expiryErr) {
      return NextResponse.json(
        {
          error:
            expiryErr instanceof Error
              ? expiryErr.message
              : "Fecha de vencimiento inválida",
        },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado en el catálogo" },
        { status: 404 }
      );
    }

    const existingDuplicate = await prisma.inventoryLot.findUnique({
      where: {
        productId_warehouseId_lotNumber: {
          productId,
          warehouseId,
          lotNumber,
        },
      },
      select: { id: true },
    });
    if (existingDuplicate) {
      return NextResponse.json(
        {
          error: `Ya existe el lote ${lotNumber} para "${product.name}" en esta bodega. Edita el lote existente si deseas actualizar su cantidad.`,
        },
        { status: 409 }
      );
    }

    const { hasStock, totalUnits, quantityText: autoQuantityText } =
      computeLotStockMetrics(counts, product, body.manualTotalUnits);
    const quantityText = body.quantityText?.trim() || autoQuantityText;

    const daysToExpiry = computeDaysToExpiry(parsedExpiry.expiryDate);
    const status = deriveLotStatus(
      daysToExpiry,
      totalUnits,
      "ACTIVO",
      product.alertThresholdDays,
      hasStock
    );

    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        warehouseId,
        lotNumber,
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
        status,
        notes,
      },
      include: { product: { include: { supplier: true } }, warehouse: true },
    });

    await logActivity({
      entityType: "LOTE",
      entityId: lot.id,
      action: "CREAR",
      actor,
      summary: `Lote ${lot.lotNumber} registrado (${lot.product.sku} — ${lot.product.name}): ${lot.quantityText} · Vence ${lot.expiryDisplay}`,
    });

    await syncAlertsAndStatuses(actor).catch((err) =>
      console.error("Error sincronizando y enviando alertas por Telegram:", err)
    );

    return NextResponse.json(
      { lot: { ...lot, daysToExpiry } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en POST /api/inventory:", error);
    return NextResponse.json(
      {
        error:
          "No se pudo registrar el lote (verifique los datos ingresados y que el lote no esté duplicado)",
      },
      { status: 400 }
    );
  }
}
