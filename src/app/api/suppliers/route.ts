import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error("Error en GET /api/suppliers:", error);
    return NextResponse.json(
      { error: "Error al listar proveedores" },
      { status: 500 }
    );
  }
}
