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

export function sanitizeCounts(counts: PackagingCounts) {
  return {
    boxes: Math.max(0, Math.floor(Number(counts.boxes ?? 0))),
    packs: Math.max(0, Math.floor(Number(counts.packs ?? 0))),
    dispacks: Math.max(0, Math.floor(Number(counts.dispacks ?? 0))),
    displays: Math.max(0, Math.floor(Number(counts.displays ?? 0))),
    bags: Math.max(0, Math.floor(Number(counts.bags ?? 0))),
    looseUnits: Math.max(0, Math.floor(Number(counts.looseUnits ?? 0))),
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

/**
 * Resuelve fecha exacta (YYYY-MM-DD) o Mes/Año (YYYY-MM) al último día del mes
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

  if (precision === "MES_ANO" && params.expiryMonth) {
    const match = /^(\d{4})-(\d{2})$/.exec(params.expiryMonth.trim());
    if (match) {
      const year = Number(match[1]);
      const month1Based = Number(match[2]);
      // Día 0 del mes siguiente = último día del mes indicado
      const lastDay = new Date(year, month1Based, 0, 12, 0, 0, 0);
      const shortYear = String(year).slice(-2);
      const defaultDisplay = `${MONTHS_ES[month1Based - 1] ?? month1Based}-${shortYear}`;
      return {
        expiryDate: lastDay,
        expiryPrecision: "MES_ANO",
        expiryDisplay: params.expiryDisplay?.trim() || defaultDisplay,
      };
    }
  }

  const rawDate = params.expiryDate ? new Date(params.expiryDate) : new Date();
  if (!Number.isNaN(rawDate.getTime())) {
    // Normalizar a mediodía local para evitar desfases de zona horaria
    const normalized = new Date(
      rawDate.getUTCFullYear(),
      rawDate.getUTCMonth(),
      rawDate.getUTCDate(),
      12,
      0,
      0,
      0
    );
    const dd = String(normalized.getDate()).padStart(2, "0");
    const mmm = MONTHS_ES[normalized.getMonth()];
    const yy = String(normalized.getFullYear()).slice(-2);
    const defaultDisplay =
      precision === "MES_ANO" ? `${mmm}-${yy}` : `${dd}-${mmm}-${yy}`;

    return {
      expiryDate:
        precision === "MES_ANO"
          ? new Date(
              normalized.getFullYear(),
              normalized.getMonth() + 1,
              0,
              12,
              0,
              0,
              0
            )
          : normalized,
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
  const mmm = MONTHS_ES[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  if (expiryPrecision === "MES_ANO") {
    return `${mmm}-${yy}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${mmm}-${yy}`;
}
