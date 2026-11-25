import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDaysToExpiry } from "@/lib/corta-fecha";
import { hasAnyPackagingStock } from "@/lib/packaging";

export async function GET() {
  try {
    const now = new Date();
    const [
      lots,
      alerts,
      damagedRecords,
      inspections,
      recentActivity,
      warehouses,
      totalInspectionsCount,
    ] = await Promise.all([
      prisma.inventoryLot.findMany({
        include: { product: true, warehouse: true },
        orderBy: { expiryDate: "asc" },
      }),
      prisma.alert.findMany({
        where: { acknowledged: false },
        orderBy: [{ createdAt: "desc" }],
        include: {
          lot: { include: { product: true, warehouse: true } },
        },
      }),
      prisma.damagedRecord.findMany({
        include: { product: true, warehouse: true, lot: true },
        orderBy: { reportedAt: "desc" },
      }),
      prisma.inspection.findMany({
        include: { warehouse: true, lot: { include: { product: true } } },
        orderBy: { inspectedAt: "desc" },
        take: 10,
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.warehouse.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.inspection.count(),
    ]);

    const activeLots = lots.filter(
      (l) =>
        l.totalUnits > 0 ||
        hasAnyPackagingStock({
          boxes: l.boxes,
          packs: l.packs,
          dispacks: l.dispacks,
          displays: l.displays,
          bags: l.bags,
          looseUnits: l.looseUnits,
        })
    );

    let totalBoxes = 0;
    let totalUnits = 0;
    let totalInventoryValue = 0;
    let expiredLotsCount = 0;
    let criticalLotsCount = 0;
    let upcoming30Count = 0;
    let upcoming60Count = 0;
    let healthyCount = 0;
    let quarantineCount = 0;

    const categoryMap = new Map<
      string,
      { category: string; units: number; atRiskUnits: number }
    >();

    const enrichedUrgentLots = [];

    for (const lot of activeLots) {
      const daysToExpiry = computeDaysToExpiry(lot.expiryDate, now);
      totalBoxes += lot.boxes;
      totalUnits += lot.totalUnits;
      totalInventoryValue += lot.totalUnits * lot.product.unitCost;

      if (lot.status === "CUARENTENA") {
        quarantineCount++;
      } else if (daysToExpiry < 0) {
        expiredLotsCount++;
      } else if (daysToExpiry <= 15) {
        criticalLotsCount++;
      } else if (daysToExpiry <= 30) {
        upcoming30Count++;
      } else if (daysToExpiry <= 60) {
        upcoming60Count++;
      } else {
        healthyCount++;
      }

      const cat = lot.product.category;
      const existingCat = categoryMap.get(cat) ?? {
        category: cat,
        units: 0,
        atRiskUnits: 0,
      };
      existingCat.units += lot.totalUnits;
      if (daysToExpiry <= 30) {
        existingCat.atRiskUnits += lot.totalUnits;
      }
      categoryMap.set(cat, existingCat);

      if (daysToExpiry <= 45 || lot.status === "CUARENTENA") {
        enrichedUrgentLots.push({
          ...lot,
          daysToExpiry,
        });
      }
    }

    const pendingDamaged = damagedRecords.filter(
      (d) => d.resolutionStatus !== "RESUELTO"
    );
    const totalDamagedLoss = damagedRecords.reduce(
      (acc, d) => acc + d.estimatedLoss,
      0
    );

    const warehouseSummary = warehouses.map((w) => {
      const wLots = activeLots.filter((l) => l.warehouseId === w.id);
      const urgent = wLots.filter(
        (l) => computeDaysToExpiry(l.expiryDate, now) <= 30
      ).length;
      return {
        id: w.id,
        code: w.code,
        name: w.name,
        totalLots: wLots.length,
        totalUnits: wLots.reduce((acc, l) => acc + l.totalUnits, 0),
        urgentLots: urgent,
      };
    });

    const severityOrder: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    const sortedAlerts = [...alerts].sort((a, b) => {
      const sDiff =
        (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      if (sDiff !== 0) return sDiff;
      const dDiff = (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999);
      if (dDiff !== 0) return dDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return NextResponse.json({
      kpis: {
        totalActiveLots: activeLots.length,
        totalBoxes,
        totalUnits,
        totalInventoryValue,
        expiredLotsCount,
        criticalLotsCount,
        upcoming30Count,
        upcoming60Count,
        healthyCount,
        quarantineCount,
        activeAlertsCount: alerts.length,
        pendingDamagedCount: pendingDamaged.length,
        totalDamagedLoss,
        totalInspectionsCount,
      },
      expiryDistribution: [
        { label: "Vencidos", count: expiredLotsCount, color: "bg-red-500" },
        { label: "Críticos (0-15d)", count: criticalLotsCount, color: "bg-orange-500" },
        { label: "Preventivo (16-30d)", count: upcoming30Count, color: "bg-amber-400" },
        { label: "Observación (31-60d)", count: upcoming60Count, color: "bg-sky-500" },
        { label: "Vigentes (>60d)", count: healthyCount, color: "bg-emerald-500" },
      ],
      categoryBreakdown: Array.from(categoryMap.values()),
      warehouseSummary,
      urgentLots: enrichedUrgentLots.slice(0, 12),
      activeAlerts: sortedAlerts.slice(0, 8),
      recentInspections: inspections.slice(0, 5),
      recentActivity,
    });
  } catch (error) {
    console.error("Error en GET /api/dashboard:", error);
    return NextResponse.json(
      { error: "No se pudo cargar el resumen del dashboard" },
      { status: 500 }
    );
  }
}
