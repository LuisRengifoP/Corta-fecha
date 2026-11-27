import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const entityType = params.get("entityType") ?? "";
    const entityId = params.get("entityId")?.trim() ?? "";
    const action = params.get("action")?.trim() ?? "";
    const dateFrom = params.get("dateFrom")?.trim() ?? "";
    const dateTo = params.get("dateTo")?.trim() ?? "";
    const search = params.get("search")?.trim() ?? "";
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`);
      if (!Number.isNaN(from.getTime())) createdAtFilter.gte = from;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999`);
      if (!Number.isNaN(to.getTime())) createdAtFilter.lte = to;
    }

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
      ...(Object.keys(createdAtFilter).length > 0
        ? { createdAt: createdAtFilter }
        : {}),
      ...(search
        ? {
            OR: [
              { actor: { contains: search, mode: "insensitive" as const } },
              { summary: { contains: search, mode: "insensitive" as const } },
              { action: { contains: search, mode: "insensitive" as const } },
              { entityType: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    if (pageParam !== null || pageSizeParam !== null) {
      const page = Math.max(1, Math.floor(Number(pageParam ?? 1)) || 1);
      const pageSize = Math.min(
        100,
        Math.max(5, Math.floor(Number(pageSizeParam ?? 15)) || 15)
      );

      const [total, firstPageLogs] = await Promise.all([
        prisma.activityLog.count({ where }),
        prisma.activityLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const logs =
        safePage === page
          ? firstPageLogs
          : await prisma.activityLog.findMany({
              where,
              orderBy: { createdAt: "desc" },
              skip: (safePage - 1) * pageSize,
              take: pageSize,
            });

      return NextResponse.json({
        logs,
        total,
        page: safePage,
        pageSize,
        totalPages,
      });
    }

    const limit = Math.min(
      200,
      Math.max(10, Number(params.get("limit") ?? 100))
    );

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      logs,
      total: logs.length,
      page: 1,
      pageSize: logs.length || limit,
      totalPages: 1,
    });
  } catch (error) {
    console.error("Error en GET /api/activity:", error);
    return NextResponse.json(
      { error: "Error al consultar el historial de actividades" },
      { status: 500 }
    );
  }
}
