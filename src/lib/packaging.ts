export interface PackagingCounts {
  boxes?: number; // CJ - Cajas
  packs?: number; // PC - Pacas
  dispacks?: number; // DPL - Dispack
  displays?: number; // DISP - Display
  bags?: number; // BL - Bolsas
  looseUnits?: number; // UN - Unidades sueltas
}

export interface ProductEquivalences {
  unitsPerBox: number;
  unitsPerPack?: number | null;
  unitsPerDispack?: number | null;
  unitsPerDisplay?: number | null;
  unitsPerBag?: number | null;
}

const MONTHS_ES = [
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

function toNonNegInt(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function sanitizeCounts(counts: PackagingCounts) {
  return {
    boxes: toNonNegInt(counts.boxes),
    packs: toNonNegInt(counts.packs),
    dispacks: toNonNegInt(counts.dispacks),
    displays: toNonNegInt(counts.displays),
    bags: toNonNegInt(counts.bags),
    looseUnits: toNonNegInt(counts.looseUnits),
  };
}

export function hasAnyPackagingStock(counts: PackagingCounts): boolean {
  const c = sanitizeCounts(counts);
  return (
    c.boxes + c.packs + c.dispacks + c.displays + c.bags + c.looseUnits > 0
  );
}

export function calculateUnitsFromPackaging(
  counts: PackagingCounts,
  eq: ProductEquivalences
): number {
  const c = sanitizeCounts(counts);
  return (
    c.boxes * Math.max(1, Math.floor(eq.unitsPerBox || 1)) +
    c.packs * Math.max(0, Math.floor(eq.unitsPerPack ?? 0)) +
    c.dispacks * Math.max(0, Math.floor(eq.unitsPerDispack ?? 0)) +
    c.displays * Math.max(0, Math.floor(eq.unitsPerDisplay ?? 0)) +
    c.bags * Math.max(0, Math.floor(eq.unitsPerBag ?? 0)) +
    c.looseUnits
  );
}

export function buildQuantityText(
  counts: PackagingCounts,
  eq?: ProductEquivalences
): string {
  const c = sanitizeCounts(counts);
  const parts: string[] = [];
  if (c.boxes > 0) parts.push(`${c.boxes} CJ`);
  if (c.packs > 0) parts.push(`${c.packs} PC`);
  if (c.dispacks > 0) parts.push(`${c.dispacks} DPL`);
  if (c.displays > 0) parts.push(`${c.displays} DISP`);
  if (c.bags > 0) parts.push(`${c.bags} BL`);
  if (c.looseUnits > 0) parts.push(`${c.looseUnits} UN`);

  if (parts.length === 0) return "0 UN";

  const base = parts.join(" + ");

  // Si es un solo empaque mayor (ej. 3 PC) con equivalencia configurada (>1),
  // mostrar equivalencia entre paréntesis como en la planilla: "3 PC (108 UN)"
  if (parts.length === 1 && c.looseUnits === 0 && eq) {
    const equivTotal = calculateUnitsFromPackaging(c, eq);
    if (equivTotal > 0 && c.packs > 0 && (eq.unitsPerPack ?? 0) > 1) {
      return `${base} (${equivTotal} UN)`;
    }
  }

  return base;
}

function parseMonthYearString(raw: string): { year: number; month1Based: number } | null {
  const trimmed = raw.trim();
  const ym = /^(\d{4})[-/](\d{1,2})$/.exec(trimmed);
  if (ym) {
    const year = Number(ym[1]);
    const month1Based = Number(ym[2]);
    if (year >= 1900 && year <= 2200 && month1Based >= 1 && month1Based <= 12) {
      return { year, month1Based };
    }
  }
  const my = /^(\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (my) {
    const month1Based = Number(my[1]);
    const year = Number(my[2]);
    if (year >= 1900 && year <= 2200 && month1Based >= 1 && month1Based <= 12) {
      return { year, month1Based };
    }
  }
  return null;
}

/**
 * Resuelve fecha exacta (YYYY-MM-DD) o Mes/Año (YYYY-MM / MM/YYYY) al último día del mes
 * para cálculo de vencimientos y alertas, preservando una etiqueta fiel.
 */
export function parseFlexibleExpiryInput(params: {
  expiryDate?: string;
  expiryMonth?: string;
  expiryPrecision?: string;
  expiryDisplay?: string;
}): {
  expiryDate: Date;
  expiryPrecision: "EXACTA" | "MES_ANO";
  expiryDisplay: string;
} {
  const precision =
    params.expiryPrecision === "MES_ANO" ? "MES_ANO" : "EXACTA";

  if (precision === "MES_ANO") {
    const monthSource = params.expiryMonth?.trim() || "";
    if (monthSource) {
      const parsedMY = parseMonthYearString(monthSource);
      if (!parsedMY) {
        throw new Error("Mes/Año de vencimiento inválido (use MM/AAAA o AAAA-MM)");
      }
      const { year, month1Based } = parsedMY;
      // Día 0 del mes siguiente = último día del mes indicado a mediodía UTC
      const lastDay = new Date(Date.UTC(year, month1Based, 0, 12, 0, 0, 0));
      const shortYear = String(year).slice(-2);
      const defaultDisplay = `${MONTHS_ES[month1Based - 1] ?? month1Based}-${shortYear}`;
      return {
        expiryDate: lastDay,
        expiryPrecision: "MES_ANO",
        expiryDisplay: params.expiryDisplay?.trim() || defaultDisplay,
      };
    }
  }

  const rawDateStr = params.expiryDate?.trim() ?? "";
  if (!rawDateStr) {
    throw new Error(
      precision === "MES_ANO"
        ? "Seleccione el mes y año de vencimiento"
        : "La fecha de vencimiento es obligatoria"
    );
  }

  const isoOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDateStr);
  const rawDate = isoOnly
    ? new Date(
        Date.UTC(
          Number(isoOnly[1]),
          Number(isoOnly[2]) - 1,
          Number(isoOnly[3]),
          12,
          0,
          0,
          0
        )
      )
    : new Date(rawDateStr);

  if (!Number.isNaN(rawDate.getTime())) {
    const year = rawDate.getUTCFullYear();
    const monthIndex = rawDate.getUTCMonth();
    const day = rawDate.getUTCDate();
    const normalized = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
    const finalDate =
      precision === "MES_ANO"
        ? new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0, 0))
        : normalized;

    const dd = String(finalDate.getUTCDate()).padStart(2, "0");
    const mmm = MONTHS_ES[finalDate.getUTCMonth()];
    const yy = String(finalDate.getUTCFullYear()).slice(-2);
    const defaultDisplay =
      precision === "MES_ANO" ? `${mmm}-${yy}` : `${dd}-${mmm}-${yy}`;

    return {
      expiryDate: finalDate,
      expiryPrecision: precision,
      expiryDisplay: params.expiryDisplay?.trim() || defaultDisplay,
    };
  }

  throw new Error("Fecha de vencimiento inválida");
}

export function formatExpiryLabel(
  expiryDate: Date | string,
  expiryPrecision?: string | null,
  expiryDisplay?: string | null
): string {
  if (expiryDisplay && expiryDisplay.trim()) return expiryDisplay;
  const d = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  if (Number.isNaN(d.getTime())) return "—";
  const mmm = MONTHS_ES[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear()).slice(-2);
  if (expiryPrecision === "MES_ANO") {
    return `${mmm}-${yy}`;
  }
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd}-${mmm}-${yy}`;
}
