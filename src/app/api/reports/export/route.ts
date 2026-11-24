import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { computeDaysToExpiry, logActivity } from "@/lib/corta-fecha";
import {
  DAMAGE_ACTION_LABELS,
  DAMAGE_TYPE_LABELS,
  ENTITY_TYPE_LABELS,
  INSPECTION_STATUS_META,
  INSPECTION_TYPE_LABELS,
  LOT_STATUS_META,
  RESOLUTION_STATUS_META,
} from "@/lib/constants";
import { formatExpiryLabel, hasAnyPackagingStock } from "@/lib/packaging";
import {
  buildDistrimarcasPlanillaSheet,
  computeLotBoxesAndUnits,
  formatHeaderDateES,
  generateDistrimarcasTablePdf,
  PdfTableColumn,
  PlanillaRow,
} from "@/lib/reports";

const PLANILLA_PDF_COLUMNS: PdfTableColumn[] = [
  { header: "CÓDIGO", width: 95, align: "center" },
  { header: "PRODUCTO", width: 278, align: "left" },
  { header: "CAJAS", width: 60, align: "center" },
  { header: "UNID.", width: 60, align: "center" },
  { header: "LOTE", width: 105, align: "center" },
  { header: "FECHA VENCIMIENTO", width: 130, align: "center" },
];

function styleHeaderRow(row: ExcelJS.Row, bgColor = "FF1E3A8A") {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

function autoFitColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value ? String(cell.value) : "";
      if (value.length > maxLength) {
        maxLength = Math.min(54, value.length);
      }
    });
    column.width = maxLength + 3;
  });
}

function lotToPlanillaRow(lot: {
  boxes: number;
  looseUnits: number;
  totalUnits: number;
  lotNumber: string;
  expiryDate: Date;
  expiryPrecision: string;
  expiryDisplay: string | null;
  product: { sku: string; name: string; unitsPerBox: number };
}): PlanillaRow {
  const qty = computeLotBoxesAndUnits(lot);
  return {
    code: lot.product.sku,
    product: lot.product.name,
    boxes: qty.boxes,
    units: qty.units,
    lot: lot.lotNumber,
    expiryDate: formatExpiryLabel(
      lot.expiryDate,
      lot.expiryPrecision,
      lot.expiryDisplay
    ),
  };
}

function planillaRowsToPdfValues(rows: PlanillaRow[]): (string | number)[][] {
  return rows.map((r) => [
    r.code,
    r.product,
    r.boxes,
    r.units,
    r.lot,
    r.expiryDate,
  ]);
}

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") ?? "general";
    const format =
      req.nextUrl.searchParams.get("format")?.toLowerCase() === "pdf"
        ? "pdf"
        : "xlsx";
    const parsedDays = Number(req.nextUrl.searchParams.get("days") ?? 30);
    const days =
      Number.isFinite(parsedDays) && parsedDays > 0
        ? Math.floor(parsedDays)
        : 30;
    const warehouseId = req.nextUrl.searchParams.get("warehouseId") ?? "";
    const providerText = (req.nextUrl.searchParams.get("provider") ?? "").trim();

    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10);
    const headerDate = formatHeaderDateES(now);

    const hasStock = (l: {
      totalUnits: number;
      boxes: number;
      packs: number;
      dispacks: number;
      displays: number;
      bags: number;
      looseUnits: number;
    }) =>
      l.totalUnits > 0 ||
      hasAnyPackagingStock({
        boxes: l.boxes,
        packs: l.packs,
        dispacks: l.dispacks,
        displays: l.displays,
        bags: l.bags,
        looseUnits: l.looseUnits,
      });

    // =========================================================================
    // EXPORTACIÓN A PDF (Formato oficial Distrimarcas S.A.S.)
    // =========================================================================
    if (format === "pdf") {
      let pdfBuffer: Buffer;

      if (type === "corta_fecha" || type === "expiring" || type === "general") {
        const lots = await prisma.inventoryLot.findMany({
          where: warehouseId ? { warehouseId } : undefined,
          include: { product: true, warehouse: true },
          orderBy: { expiryDate: "asc" },
        });

        const selectedLots =
          type === "expiring"
            ? lots.filter(
                (l) => hasStock(l) && computeDaysToExpiry(l.expiryDate, now) <= days
              )
            : lots.filter(hasStock);

        const rows = selectedLots.map(lotToPlanillaRow);
        const title =
          type === "expiring"
            ? `PRODUCTOS PRÓXIMOS A VENCER (<= ${days} DÍAS)`
            : type === "general"
            ? "INVENTARIO GENERAL CORTA FECHA"
            : "PRODUCTOS CORTA FECHA";

        pdfBuffer = await generateDistrimarcasTablePdf({
          title,
          columns: PLANILLA_PDF_COLUMNS,
          rows: planillaRowsToPdfValues(rows),
          dateText: headerDate,
          providerText,
          minRows: 12,
        });
      } else if (type === "damaged") {
        const damaged = await prisma.damagedRecord.findMany({
          where: warehouseId ? { warehouseId } : undefined,
          include: { product: true, warehouse: true, lot: true },
          orderBy: { reportedAt: "desc" },
        });

        const rows: PlanillaRow[] = damaged.map((item) => ({
          code: item.product.sku,
          product: item.product.name,
          boxes: item.boxesAffected,
          units: item.unitsAffected,
          lot: item.lot.lotNumber,
          expiryDate: formatExpiryLabel(
            item.lot.expiryDate,
            item.lot.expiryPrecision,
            item.lot.expiryDisplay
          ),
        }));

        pdfBuffer = await generateDistrimarcasTablePdf({
          title: "PRODUCTOS EN AVERIAS",
          columns: PLANILLA_PDF_COLUMNS,
          rows: planillaRowsToPdfValues(rows),
          dateText: headerDate,
          providerText,
          minRows: 12,
        });
      } else if (type === "inspections") {
        const inspections = await prisma.inspection.findMany({
          where: warehouseId ? { warehouseId } : undefined,
          include: { warehouse: true, lot: { include: { product: true } } },
          orderBy: { inspectedAt: "desc" },
        });

        const columns: PdfTableColumn[] = [
          { header: "FECHA", width: 92, align: "center" },
          { header: "PRODUCTO", width: 195, align: "left" },
          { header: "LOTE", width: 85, align: "center" },
          { header: "INSPECTOR", width: 110, align: "left" },
          { header: "ESTADO", width: 88, align: "center" },
          { header: "HALLAZGOS", width: 158, align: "left" },
        ];

        const rows = inspections.map((insp) => [
          insp.inspectedAt.toISOString().slice(0, 10),
          insp.lot?.product.name ?? "Inspección general",
          insp.lot?.lotNumber ?? "—",
          insp.inspectorName,
          INSPECTION_STATUS_META[insp.status]?.label ?? insp.status,
          insp.findings,
        ]);

        pdfBuffer = await generateDistrimarcasTablePdf({
          title: "BITÁCORA DE INSPECCIONES",
          columns,
          rows,
          dateText: headerDate,
          showProviderLine: false,
          minRows: 10,
        });
      } else {
        const logs = await prisma.activityLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 250,
        });

        const columns: PdfTableColumn[] = [
          { header: "FECHA Y HORA", width: 112, align: "center" },
          { header: "MÓDULO", width: 100, align: "center" },
          { header: "RESPONSABLE", width: 130, align: "left" },
          { header: "DESCRIPCIÓN", width: 386, align: "left" },
        ];

        const rows = logs.map((log) => [
          log.createdAt.toISOString().slice(0, 16).replace("T", " "),
          ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType,
          log.actor,
          log.summary,
        ]);

        pdfBuffer = await generateDistrimarcasTablePdf({
          title: "HISTORIAL DE AUDITORÍA",
          columns,
          rows,
          dateText: headerDate,
          showProviderLine: false,
          minRows: 10,
        });
      }

      const filename = `corta-fecha-${type}-${dateStamp}.pdf`;
      await logActivity({
        entityType: "REPORTE",
        action: "EXPORTAR_PDF",
        actor: "Usuario",
        summary: `Reporte PDF exportado (${filename})`,
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // =========================================================================
    // EXPORTACIÓN A EXCEL (.xlsx)
    // =========================================================================
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema Corta Fecha — Distrimarcas S.A.S.";
    workbook.created = now;

    if (type === "corta_fecha") {
      const lots = await prisma.inventoryLot.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        include: { product: true, warehouse: true },
        orderBy: { expiryDate: "asc" },
      });

      const activeLots = lots.filter(hasStock);
      buildDistrimarcasPlanillaSheet({
        workbook,
        sheetName: "PLANILLA_CORTA_FECHA",
        title: "PRODUCTOS CORTA FECHA",
        rows: activeLots.map(lotToPlanillaRow),
        dateText: headerDate,
        providerText,
        minRows: 12,
      });
    }

    if (type === "expiring") {
      const lots = await prisma.inventoryLot.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        include: { product: true, warehouse: true },
        orderBy: { expiryDate: "asc" },
      });

      const filteredLots = lots.filter(
        (l) => hasStock(l) && computeDaysToExpiry(l.expiryDate, now) <= days
      );

      buildDistrimarcasPlanillaSheet({
        workbook,
        sheetName: `PROXIMOS_${days}_DIAS`,
        title: `PRODUCTOS PRÓXIMOS A VENCER (≤ ${days} DÍAS)`,
        rows: filteredLots.map(lotToPlanillaRow),
        dateText: headerDate,
        providerText,
        minRows: 12,
      });
    }

    if (type === "damaged") {
      const damaged = await prisma.damagedRecord.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        include: { product: true, warehouse: true, lot: true },
        orderBy: { reportedAt: "desc" },
      });

      const rows: PlanillaRow[] = damaged.map((item) => ({
        code: item.product.sku,
        product: item.product.name,
        boxes: item.boxesAffected,
        units: item.unitsAffected,
        lot: item.lot.lotNumber,
        expiryDate: formatExpiryLabel(
          item.lot.expiryDate,
          item.lot.expiryPrecision,
          item.lot.expiryDisplay
        ),
      }));

      buildDistrimarcasPlanillaSheet({
        workbook,
        sheetName: "PRODUCTOS_EN_AVERIAS",
        title: "PRODUCTOS EN AVERIAS",
        rows,
        dateText: headerDate,
        providerText,
        minRows: 12,
      });
    }

    if (type === "general") {
      const lots = await prisma.inventoryLot.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        include: { product: true, warehouse: true },
        orderBy: { expiryDate: "asc" },
      });

      const activeLots = lots.filter(hasStock);
      buildDistrimarcasPlanillaSheet({
        workbook,
        sheetName: "Planilla_Corta_Fecha",
        title: "PRODUCTOS CORTA FECHA",
        rows: activeLots.map(lotToPlanillaRow),
        dateText: headerDate,
        providerText,
        minRows: 12,
      });

      const invSheet = workbook.addWorksheet("Inventario_Detallado");
      invSheet.columns = [
        { header: "CÓDIGO", key: "sku" },
        { header: "PRODUCTO", key: "product" },
        { header: "Categoría", key: "category" },
        { header: "Bodega", key: "warehouse" },
        { header: "CANTIDAD", key: "quantityText" },
        { header: "Cajas (CJ)", key: "boxes" },
        { header: "Pacas (PC)", key: "packs" },
        { header: "Dispack (DPL)", key: "dispacks" },
        { header: "Display (DISP)", key: "displays" },
        { header: "Bolsas (BL)", key: "bags" },
        { header: "Unid. Sueltas (UN)", key: "looseUnits" },
        { header: "Total Unidades Equiv.", key: "totalUnits" },
        { header: "FECHA DE VENCIMIENTO", key: "expiryDisplay" },
        { header: "Días Restantes", key: "daysToExpiry" },
        { header: "LOTE", key: "lotNumber" },
        { header: "Estado", key: "status" },
        { header: "Valor Inventario", key: "value" },
      ];
      styleHeaderRow(invSheet.getRow(1));

      for (const lot of lots) {
        const dte = computeDaysToExpiry(lot.expiryDate, now);
        const row = invSheet.addRow({
          sku: lot.product.sku,
          product: lot.product.name,
          category: lot.product.category,
          warehouse: lot.warehouse.name,
          quantityText: lot.quantityText,
          boxes: lot.boxes,
          packs: lot.packs,
          dispacks: lot.dispacks,
          displays: lot.displays,
          bags: lot.bags,
          looseUnits: lot.looseUnits,
          totalUnits: lot.totalUnits,
          expiryDisplay: formatExpiryLabel(
            lot.expiryDate,
            lot.expiryPrecision,
            lot.expiryDisplay
          ),
          daysToExpiry: dte,
          lotNumber: lot.lotNumber,
          status: LOT_STATUS_META[lot.status]?.label ?? lot.status,
          value: lot.totalUnits * lot.product.unitCost,
        });

        row.getCell("value").numFmt = '"$"#,##0';
        if (dte < 0) {
          row.getCell("daysToExpiry").font = {
            bold: true,
            color: { argb: "FFB91C1C" },
          };
        } else if (dte <= 15) {
          row.getCell("daysToExpiry").font = {
            bold: true,
            color: { argb: "FFC2410C" },
          };
        }
      }
      autoFitColumns(invSheet);

      const damaged = await prisma.damagedRecord.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        include: { product: true, warehouse: true, lot: true },
        orderBy: { reportedAt: "desc" },
      });

      const dmgSheet = workbook.addWorksheet("Productos_Averiados");
      dmgSheet.columns = [
        { header: "Fecha Reporte", key: "reportedAt" },
        { header: "CÓDIGO", key: "sku" },
        { header: "PRODUCTO", key: "product" },
        { header: "LOTE", key: "lotNumber" },
        { header: "Bodega", key: "warehouse" },
        { header: "Tipo Avería", key: "damageType" },
        { header: "Severidad", key: "severity" },
        { header: "Cajas Afectadas", key: "boxesAffected" },
        { header: "Unidades Afectadas", key: "unitsAffected" },
        { header: "Pérdida Estimada", key: "estimatedLoss" },
        { header: "Acción Tomada", key: "actionTaken" },
        { header: "Estado Gestión", key: "resolutionStatus" },
        { header: "Reportado Por", key: "reportedBy" },
        { header: "Notas", key: "notes" },
      ];
      styleHeaderRow(dmgSheet.getRow(1), "FF9A3412");

      for (const item of damaged) {
        const row = dmgSheet.addRow({
          reportedAt: item.reportedAt.toISOString().slice(0, 10),
          sku: item.product.sku,
          product: item.product.name,
          lotNumber: item.lot.lotNumber,
          warehouse: item.warehouse.name,
          damageType: DAMAGE_TYPE_LABELS[item.damageType] ?? item.damageType,
          severity: item.severity,
          boxesAffected: item.boxesAffected,
          unitsAffected: item.unitsAffected,
          estimatedLoss: item.estimatedLoss,
          actionTaken: DAMAGE_ACTION_LABELS[item.actionTaken] ?? item.actionTaken,
          resolutionStatus:
            RESOLUTION_STATUS_META[item.resolutionStatus]?.label ??
            item.resolutionStatus,
          reportedBy: item.reportedBy,
          notes: item.notes ?? "",
        });
        row.getCell("estimatedLoss").numFmt = '"$"#,##0';
      }
      autoFitColumns(dmgSheet);
    }

    if (type === "general" || type === "inspections") {
      const inspections = await prisma.inspection.findMany({
        where: warehouseId ? { warehouseId } : undefined,
        include: { warehouse: true, lot: { include: { product: true } } },
        orderBy: { inspectedAt: "desc" },
      });

      const sheet = workbook.addWorksheet("Inspecciones");
      sheet.columns = [
        { header: "Fecha Inspección", key: "inspectedAt" },
        { header: "Bodega", key: "warehouse" },
        { header: "LOTE", key: "lotNumber" },
        { header: "PRODUCTO", key: "product" },
        { header: "Inspector", key: "inspectorName" },
        { header: "Tipo", key: "inspectionType" },
        { header: "Resultado", key: "status" },
        { header: "Cajas Verificadas", key: "checkedBoxes" },
        { header: "Unidades Verificadas", key: "checkedUnits" },
        { header: "Vencimiento Verificado", key: "expiryVerified" },
        { header: "Hallazgos", key: "findings" },
        { header: "Acción Correctiva", key: "correctiveAction" },
      ];
      styleHeaderRow(sheet.getRow(1), "FF0F766E");

      for (const insp of inspections) {
        sheet.addRow({
          inspectedAt: insp.inspectedAt
            .toISOString()
            .slice(0, 16)
            .replace("T", " "),
          warehouse: insp.warehouse.name,
          lotNumber: insp.lot?.lotNumber ?? "Inspección general",
          product: insp.lot?.product.name ?? "—",
          inspectorName: insp.inspectorName,
          inspectionType:
            INSPECTION_TYPE_LABELS[insp.inspectionType] ?? insp.inspectionType,
          status: INSPECTION_STATUS_META[insp.status]?.label ?? insp.status,
          checkedBoxes: insp.checkedBoxes,
          checkedUnits: insp.checkedUnits,
          expiryVerified: insp.expiryVerified ? "Sí" : "No",
          findings: insp.findings,
          correctiveAction: insp.correctiveAction ?? "",
        });
      }
      autoFitColumns(sheet);
    }

    if (type === "activity") {
      const logs = await prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      const sheet = workbook.addWorksheet("Historial_Actividades");
      sheet.columns = [
        { header: "Fecha y Hora", key: "createdAt" },
        { header: "Módulo", key: "entityType" },
        { header: "Acción", key: "action" },
        { header: "Responsable", key: "actor" },
        { header: "Descripción", key: "summary" },
      ];
      styleHeaderRow(sheet.getRow(1), "FF334155");

      for (const log of logs) {
        sheet.addRow({
          createdAt: log.createdAt.toISOString().slice(0, 19).replace("T", " "),
          entityType: ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType,
          action: log.action,
          actor: log.actor,
          summary: log.summary,
        });
      }
      autoFitColumns(sheet);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `corta-fecha-${type}-${dateStamp}.xlsx`;

    await logActivity({
      entityType: "REPORTE",
      action: "EXPORTAR_EXCEL",
      actor: "Usuario",
      summary: `Reporte Excel exportado (${filename})`,
    });

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error en GET /api/reports/export:", error);
    return NextResponse.json(
      { error: "No se pudo generar el archivo de reporte" },
      { status: 500 }
    );
  }
}
