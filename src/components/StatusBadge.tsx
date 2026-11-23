import {
  INSPECTION_STATUS_META,
  LOT_STATUS_META,
  RESOLUTION_STATUS_META,
  SEVERITY_META,
} from "@/lib/constants";

const LOT_DOT_COLORS: Record<string, string> = {
  VENCIDO: "bg-red-600 dark:bg-red-400",
  CRITICO: "bg-orange-500 dark:bg-orange-400",
  PROXIMO_VENCER: "bg-amber-500 dark:bg-amber-400",
  CUARENTENA: "bg-purple-600 dark:bg-purple-400",
  ACTIVO: "bg-emerald-600 dark:bg-emerald-400",
  AGOTADO: "bg-slate-400 dark:bg-slate-500",
};

export function LotStatusBadge({ status }: { status: string }) {
  const meta = LOT_STATUS_META[status] ?? {
    label: status,
    badgeBg:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
  const dotColor = LOT_DOT_COLORS[status] ?? "bg-slate-500";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeBg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {meta.label}
    </span>
  );
}

export function DaysRemainingBadge({ days }: { days: number }) {
  let cls =
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70";
  let text = `${days} días`;
  if (days < 0) {
    cls =
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70";
    text = `Vencido (${Math.abs(days)}d)`;
  } else if (days === 0) {
    cls =
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70";
    text = "Vence hoy";
  } else if (days <= 15) {
    cls =
      "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/70";
  } else if (days <= 30) {
    cls =
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70";
  } else if (days <= 60) {
    cls =
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70";
  }

  return (
    <span
      className={`tabular-nums inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {text}
    </span>
  );
}

export function InspectionStatusBadge({ status }: { status: string }) {
  const meta = INSPECTION_STATUS_META[status] ?? {
    label: status,
    badgeBg:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeBg}`}
    >
      {meta.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const meta = SEVERITY_META[severity] ?? {
    label: severity,
    badgeBg:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeBg}`}
    >
      {meta.label}
    </span>
  );
}

export function ResolutionStatusBadge({ status }: { status: string }) {
  const meta = RESOLUTION_STATUS_META[status] ?? {
    label: status,
    badgeBg:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeBg}`}
    >
      {meta.label}
    </span>
  );
}
