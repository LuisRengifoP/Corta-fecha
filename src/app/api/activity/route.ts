import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const entityType = params.get("entityType") ?? "";
    const search = params.get("search")?.trim().toLowerCase() ?? "";
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(search
        ? {
            OR: [
              { actor: { contains: search } },
              { summary: { contains: search } },
              { action: { contains: search } },
              { entityType: { contains: search } },
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
