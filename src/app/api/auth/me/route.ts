import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const warehouse = await prisma.warehouse.findFirst({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    user: {
      id: session.userId,
      username: session.username,
      fullName: session.fullName,
      role: session.role,
    },
    warehouse,
  });
}
