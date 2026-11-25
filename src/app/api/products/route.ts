import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/corta-fecha";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
    const supplierId = req.nextUrl.searchParams.get("supplierId")?.trim() ?? "";

    const where = {
      ...(supplierId ? { supplierId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
              { barcode: { contains: search, mode: "insensitive" as const } },
              { brand: { contains: search, mode: "insensitive" as const } },
              {
                supplier: {
                  name: { contains: search, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };

    const products = await prisma.product.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        supplier: true,
        _count: { select: { lots: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Error en GET /api/products:", error);
    return NextResponse.json(
      { error: "Error al listar productos" },
      { status: 500 }
    );
  }
}

function parseOptionalPositiveInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sku = String(body.sku ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "General").trim();
    const barcode = body.barcode ? String(body.barcode).trim() : null;
    const brand = body.brand ? String(body.brand).trim() : null;
    const supplierName = body.supplier ? String(body.supplier).trim() : "";
    let supplierId: string | null = body.supplierId
      ? String(body.supplierId).trim()
      : null;

    if (!supplierId && supplierName) {
      const existingSupplier = await prisma.supplier.findFirst({
        where: { name: { equals: supplierName, mode: "insensitive" } },
      });
      if (existingSupplier) {
        supplierId = existingSupplier.id;
      } else {
        const supplierRecord = await prisma.supplier.create({
          data: { name: supplierName },
        });
        supplierId = supplierRecord.id;
      }
    }

    const rawBoxes = Number(body.unitsPerBox ?? 1);
    const unitsPerBox = Number.isFinite(rawBoxes)
      ? Math.max(1, Math.floor(rawBoxes))
      : 1;
    const unitsPerPack = parseOptionalPositiveInt(body.unitsPerPack);
    const unitsPerDispack = parseOptionalPositiveInt(body.unitsPerDispack);
    const unitsPerDisplay = parseOptionalPositiveInt(body.unitsPerDisplay);
    const unitsPerBag = parseOptionalPositiveInt(body.unitsPerBag);
    const rawCost = Number(body.unitCost ?? 0);
    const unitCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
    const rawThreshold = Number(body.alertThresholdDays ?? 60);
    const alertThresholdDays = Number.isFinite(rawThreshold)
      ? Math.max(1, Math.floor(rawThreshold))
      : 60;

    if (!sku || !name) {
      return NextResponse.json(
        { error: "Código (SKU) y nombre del producto son obligatorios" },
        { status: 400 }
      );
    }

    const existingSku = await prisma.product.findUnique({
      where: { sku },
      select: { id: true, name: true },
    });
    if (existingSku) {
      return NextResponse.json(
        {
          error: `El código SKU "${sku}" ya está registrado (${existingSku.name}).`,
        },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        sku,
        barcode,
        name,
        category,
        brand,
        supplierId,
        unitsPerBox,
        unitsPerPack,
        unitsPerDispack,
        unitsPerDisplay,
        unitsPerBag,
        unitCost,
        alertThresholdDays,
      },
      include: {
        supplier: true,
      },
    });

    await logActivity({
      entityType: "PRODUCTO",
      entityId: product.id,
      action: "CREAR",
      actor: body.actor || "Operador de Inventario",
      summary: `Producto creado: ${product.name} (Código: ${product.sku}, ${product.unitsPerBox} u/CJ)`,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/products:", error);
    return NextResponse.json(
      {
        error:
          "No se pudo crear el producto (verifique que el código SKU no esté repetido)",
      },
      { status: 400 }
    );
  }
}
