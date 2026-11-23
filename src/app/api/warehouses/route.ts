import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/corta-fecha";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        _count: {
          select: { lots: true, inspections: true, damagedRecords: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error("Error en GET /api/warehouses:", error);
    return NextResponse.json(
      { error: "Error al listar bodegas" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const location = String(body.location ?? "").trim();
    const manager = body.manager ? String(body.manager).trim() : null;

    if (!code || !name || !location) {
      return NextResponse.json(
        { error: "Código, nombre y ubicación son obligatorios" },
        { status: 400 }
      );
    }

    const warehouse = await prisma.warehouse.create({
      data: { code, name, location, manager },
    });

    await logActivity({
      entityType: "SISTEMA",
      entityId: warehouse.id,
      action: "CREAR_BODEGA",
      actor: body.actor || "Administrador",
      summary: `Bodega creada: ${warehouse.name} (${warehouse.code})`,
    });

    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/warehouses:", error);
    return NextResponse.json(
      { error: "No se pudo crear la bodega (verifique que el código sea único)" },
      { status: 400 }
    );
  }
}
