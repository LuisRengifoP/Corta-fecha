export const LOT_STATUS_META: Record<
  string,
  { label: string; colorClass: string; badgeBg: string }
> = {
  VENCIDO: {
    label: "Vencido",
    colorClass: "text-red-700 dark:text-red-400",
    badgeBg:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
  },
  CRITICO: {
    label: "Crítico (≤15 días)",
    colorClass: "text-orange-700 dark:text-orange-400",
    badgeBg:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70",
  },
  PROXIMO_VENCER: {
    label: "Próximo a vencer",
    colorClass: "text-amber-700 dark:text-amber-400",
    badgeBg:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
  },
  CUARENTENA: {
    label: "En cuarentena",
    colorClass: "text-purple-700 dark:text-purple-400",
    badgeBg:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/70",
  },
  ACTIVO: {
    label: "Vigente",
    colorClass: "text-emerald-700 dark:text-emerald-400",
    badgeBg:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
  },
  AGOTADO: {
    label: "Agotado",
    colorClass: "text-slate-600 dark:text-slate-400",
    badgeBg:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
};

export const INSPECTION_STATUS_META: Record<
  string,
  { label: string; badgeBg: string }
> = {
  APROBADA: {
    label: "Aprobada",
    badgeBg:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
  },
  OBSERVACION: {
    label: "Con observación",
    badgeBg:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
  },
  CRITICA: {
    label: "Crítica",
    badgeBg:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
  },
};

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  PROGRAMADA: "Programada",
  ALEATORIA: "Aleatoria",
  SEGUIMIENTO_ALERTA: "Seguimiento de alerta",
  RECEPCION: "Recepción en bodega",
};

export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  EMPAQUE_DANADO: "Empaque dañado",
  HUMEDAD: "Humedad / Filtración",
  APLASTAMIENTO: "Aplastamiento / Golpe",
  CADENA_FRIO: "Ruptura cadena de frío",
  VENCIDO: "Producto vencido",
  CONTAMINACION: "Contaminación / Plaga",
  OTRO: "Otro motivo",
};

export const SEVERITY_META: Record<string, { label: string; badgeBg: string }> = {
  ALTA: {
    label: "Alta",
    badgeBg:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
  },
  MEDIA: {
    label: "Media",
    badgeBg:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
  },
  BAJA: {
    label: "Baja",
    badgeBg:
      "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70",
  },
  LEVE: {
    label: "Leve",
    badgeBg:
      "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70",
  },
  MODERADA: {
    label: "Moderada",
    badgeBg:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
  },
  PERDIDA_TOTAL: {
    label: "Pérdida total",
    badgeBg:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
  },
};

export const DAMAGE_ACTION_LABELS: Record<string, string> = {
  CUARENTENA: "Enviar a cuarentena",
  LIQUIDACION: "Descuento / Liquidación",
  DEVOLUCION_PROVEEDOR: "Devolución a proveedor",
  BAJA_DESTRUCCION: "Baja / Destrucción",
  REACONDICIONAMIENTO: "Reacondicionamiento",
};

export const RESOLUTION_STATUS_META: Record<
  string,
  { label: string; badgeBg: string }
> = {
  PENDIENTE: {
    label: "Pendiente",
    badgeBg:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70",
  },
  EN_GESTION: {
    label: "En gestión",
    badgeBg:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
  },
  RESUELTO: {
    label: "Resuelto",
    badgeBg:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
  },
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  PRODUCTO: "Producto",
  LOTE: "Lote / Inventario",
  INSPECCION: "Inspección",
  AVERIA: "Producto Averiado",
  ALERTA: "Alerta",
  REPORTE: "Reporte Excel",
  SISTEMA: "Sistema",
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  PRODUCTO_VENCIDO: "Producto vencido",
  VENCIMIENTO_CRITICO: "Vencimiento crítico",
  VENCIMIENTO_PREVENTIVO: "Vencimiento preventivo",
  AVERIA_PENDIENTE: "Avería pendiente",
};

export function formatDateES(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return "—";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTimeES(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return "—";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrencyCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
