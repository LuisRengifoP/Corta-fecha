import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument, { registerStdFonts } from "pdfkit";
import Helvetica from "pdfkit/standard-fonts/Helvetica";
import HelveticaBold from "pdfkit/standard-fonts/HelveticaBold";
import HelveticaOblique from "pdfkit/standard-fonts/HelveticaOblique";
import HelveticaBoldOblique from "pdfkit/standard-fonts/HelveticaBoldOblique";

let stdFontsRegistered = false;
function ensurePdfStdFonts() {
  if (stdFontsRegistered) return;
  if (typeof registerStdFonts === "function") {
    registerStdFonts(
      Helvetica,
      HelveticaBold,
      HelveticaOblique,
      HelveticaBoldOblique
    );
  }
  stdFontsRegistered = true;
}

const MONTHS_ES_TITLE = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function formatHeaderDateES(date = new Date()): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = MONTHS_ES_TITLE[date.getMonth()] ?? "";
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

export function loadDistrimarcasLogo(): Buffer | null {
  try {
    const logoPath = path.join(
      process.cwd(),
      "public",
      "images",
      "distrimarcas-logo.jpg"
    );
    if (fs.existsSync(logoPath)) {
      return fs.readFileSync(logoPath);
    }
  } catch {
    // Si no existe el archivo de logo, se omite la imagen sin fallar el reporte
  }
  return null;
}

export interface PlanillaRow {
  code: string;
  product: string;
  boxes: number | string;
  units: number | string;
  lot: string;
  expiryDate: string;
}

export function computeLotBoxesAndUnits(lot: {
  boxes: number;
  looseUnits: number;
  totalUnits: number;
  product: { unitsPerBox: number };
}): { boxes: number; units: number } {
  const safeBoxes = Math.max(0, Math.floor(lot.boxes || 0));
  const unitsPerBox = Math.max(1, Math.floor(lot.product.unitsPerBox || 1));
  const remainingUnits =
    lot.totalUnits > 0
      ? Math.max(0, lot.totalUnits - safeBoxes * unitsPerBox)
      : Math.max(0, Math.floor(lot.looseUnits || 0));

  return {
    boxes: safeBoxes,
    units: remainingUnits,
  };
}

/**
 * Construye una hoja Excel fiel al formato físico de Distrimarcas S.A.S.
 * (Logo arriba a la izquierda, título debajo del logo, FECHA y PROVEEDOR a la derecha,
 * y tabla de 6 columnas: CÓDIGO | PRODUCTO | CAJAS | UNID. | LOTE | FECHA VENCIMIENTO).
 */
export function buildDistrimarcasPlanillaSheet(params: {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  title: string;
  rows: PlanillaRow[];
  dateText?: string;
  providerText?: string;
  minRows?: number;
}) {
  const {
    workbook,
    sheetName,
    title,
    rows,
    dateText = formatHeaderDateES(),
    providerText = "",
    minRows = 12,
  } = params;

  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
      printTitlesRow: "1:7",
    },
  });

  // Anchos de las 6 columnas oficiales
  sheet.getColumn(1).width = 15; // CÓDIGO
  sheet.getColumn(2).width = 48; // PRODUCTO
  sheet.getColumn(3).width = 10; // CAJAS
  sheet.getColumn(4).width = 10; // UNID.
  sheet.getColumn(5).width = 16; // LOTE
  sheet.getColumn(6).width = 22; // FECHA VENCIMIENTO

  // Filas 1-3: espacio reservado exclusivamente para el logo (102 pt ≈ 136 px)
  sheet.getRow(1).height = 34;
  sheet.getRow(2).height = 34;
  sheet.getRow(3).height = 34;
  // Fila 4: separación limpia entre el logo y el título
  sheet.getRow(4).height = 8;
  // Fila 5: título del formato y línea de PROVEEDOR
  sheet.getRow(5).height = 24;
  // Fila 6: espacio antes de la tabla
  sheet.getRow(6).height = 10;

  const logoBuffer = loadDistrimarcasLogo();
  if (logoBuffer) {
    const imageId = workbook.addImage({
      base64: logoBuffer.toString("base64"),
      extension: "jpeg",
    });
    sheet.addImage(imageId, {
      tl: { col: 0.2, row: 0.15 },
      ext: { width: 276, height: 92 },
    });
  } else {
    sheet.mergeCells("A1:B3");
    const fallback = sheet.getCell("A1");
    fallback.value = "DISTRIMARCAS S.A.S.\nMARCAS Y PRODUCTOS DE MEJOR CALIDAD";
    fallback.font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
    fallback.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  }

  // Título centrado debajo del logo (Fila 5, sin riesgo de solaparse con el logo)
  sheet.mergeCells("A5:B5");
  const titleCell = sheet.getCell("A5");
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };

  // Bloque derecho: FECHA (Fila 2) y PROVEEDOR (Fila 5) con línea inferior
  const dateLabelCell = sheet.getCell("D2");
  dateLabelCell.value = "FECHA:";
  dateLabelCell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
  dateLabelCell.alignment = { vertical: "bottom", horizontal: "right" };

  sheet.mergeCells("E2:F2");
  const dateValCell = sheet.getCell("E2");
  dateValCell.value = dateText;
  dateValCell.font = { size: 10, color: { argb: "FF0F172A" } };
  dateValCell.alignment = { vertical: "bottom", horizontal: "left" };
  sheet.getCell("E2").border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };
  sheet.getCell("F2").border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };

  const provLabelCell = sheet.getCell("D5");
  provLabelCell.value = "PROVEEDOR:";
  provLabelCell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
  provLabelCell.alignment = { vertical: "bottom", horizontal: "right" };

  sheet.mergeCells("E5:F5");
  const provValCell = sheet.getCell("E5");
  provValCell.value = providerText;
  provValCell.font = { size: 10, color: { argb: "FF0F172A" } };
  provValCell.alignment = { vertical: "bottom", horizontal: "left" };
  sheet.getCell("E5").border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };
  sheet.getCell("F5").border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };

  // Encabezado de tabla (Fila 7)
  const headerRow = sheet.getRow(7);
  headerRow.values = [
    "CÓDIGO",
    "PRODUCTO",
    "CAJAS",
    "UNID.",
    "LOTE",
    "FECHA VENCIMIENTO",
  ];
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF000000" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9D9D9" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  const totalRowCount = Math.max(rows.length, minRows);
  for (let i = 0; i < totalRowCount; i++) {
    const item = rows[i];
    const row = sheet.getRow(8 + i);
    row.values = item
      ? [
          item.code,
          item.product,
          item.boxes,
          item.units,
          item.lot,
          item.expiryDate,
        ]
      : ["", "", "", "", "", ""];
    row.height = 21;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { size: 10, color: { argb: "FF0F172A" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 2 ? "left" : "center",
        wrapText: colNumber === 2,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    });
  }

  return sheet;
}

export interface PdfTableColumn {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
}

/**
 * Genera un PDF en formato horizontal (Carta Landscape) con el logo oficial de Distrimarcas,
 * encabezado idéntico a la planilla impresa (FECHA / PROVEEDOR) y paginación automática.
 */
export async function generateDistrimarcasTablePdf(params: {
  title: string;
  columns: PdfTableColumn[];
  rows: (string | number)[][];
  dateText?: string;
  providerText?: string;
  minRows?: number;
  showProviderLine?: boolean;
}): Promise<Buffer> {
  const {
    title,
    columns,
    rows,
    dateText = formatHeaderDateES(),
    providerText = "",
    minRows = 12,
    showProviderLine = true,
  } = params;

  ensurePdfStdFonts();
  const logoBuffer = loadDistrimarcasLogo();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margins: { top: 28, bottom: 28, left: 32, right: 32 },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const startX = 32;
    const pageBottomY = doc.page.height - 34;

    const drawHeader = (): number => {
      let logoDrawn = false;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, startX, 24, { width: 240 });
          logoDrawn = true;
        } catch {
          logoDrawn = false;
        }
      }
      if (!logoDrawn) {
        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#0f172a")
          .text("DISTRIMARCAS S.A.S.", startX, 34, {
            width: 240,
            align: "center",
          });
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#0f172a")
        .text(title, startX, 114, { width: 240, align: "center" });

      // Bloque derecho: FECHA y PROVEEDOR
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
      doc.text("FECHA:", 455, 58, { width: 65, align: "right" });
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(dateText, 526, 56, { width: 215, align: "left" });
      doc
        .moveTo(524, 70)
        .lineTo(754, 70)
        .lineWidth(0.8)
        .strokeColor("#000000")
        .stroke();

      if (showProviderLine) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
        doc.text("PROVEEDOR:", 435, 96, { width: 85, align: "right" });
        if (providerText) {
          doc
            .font("Helvetica")
            .fontSize(10)
            .text(providerText, 526, 94, { width: 215, align: "left" });
        }
        doc
          .moveTo(524, 108)
          .lineTo(754, 108)
          .lineWidth(0.8)
          .strokeColor("#000000")
          .stroke();
      }

      return 144;
    };

    const drawTableHeader = (y: number): number => {
      const headerHeight = 24;
      let x = startX;
      for (const col of columns) {
        doc
          .rect(x, y, col.width, headerHeight)
          .fillAndStroke("#D9D9D9", "#000000");
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#000000")
          .text(col.header, x + 4, y + 7, {
            width: col.width - 8,
            align: "center",
            lineBreak: false,
          });
        x += col.width;
      }
      return y + headerHeight;
    };

    let y = drawTableHeader(drawHeader());
    const totalRows = Math.max(rows.length, minRows);

    for (let i = 0; i < totalRows; i++) {
      const rowValues = rows[i] ?? columns.map(() => "");
      doc.font("Helvetica").fontSize(9);

      // Calcular altura necesaria de la fila según el texto más largo
      let rowHeight = 22;
      for (let c = 0; c < columns.length; c++) {
        const text = String(rowValues[c] ?? "");
        if (text) {
          const textH = doc.heightOfString(text, {
            width: columns[c].width - 10,
          });
          rowHeight = Math.max(rowHeight, Math.ceil(textH) + 10);
        }
      }

      if (y + rowHeight > pageBottomY) {
        doc.addPage();
        y = drawTableHeader(drawHeader());
      }

      let x = startX;
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const text = String(rowValues[c] ?? "");
        doc
          .lineWidth(0.6)
          .rect(x, y, col.width, rowHeight)
          .strokeColor("#000000")
          .stroke();

        if (text) {
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#0f172a")
            .text(text, x + 5, y + 6, {
              width: col.width - 10,
              align: col.align ?? "center",
            });
        }
        x += col.width;
      }

      y += rowHeight;
    }

    // Pie de página con numeración si hay más de 1 página
    const range = doc.bufferedPageRange();
    if (range.count > 1) {
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(p);
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#64748b")
          .text(
            `Página ${p + 1} de ${range.count} — Distrimarcas S.A.S.`,
            startX,
            doc.page.height - 22,
            {
              width: doc.page.width - startX * 2,
              align: "right",
            }
          );
      }
    }

    doc.end();
  });
}
