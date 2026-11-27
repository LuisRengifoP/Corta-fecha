"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type KpiTone =
  | "neutral"
  | "indigo"
  | "red"
  | "orange"
  | "amber"
  | "emerald"
  | "sky";

const TONE_MAP: Record<
  KpiTone,
  { iconWrap: string; dot: string; accentText: string }
> = {
  neutral: {
    iconWrap:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-500",
    accentText: "text-slate-600 dark:text-slate-400",
  },
  indigo: {
    iconWrap:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400",
    dot: "bg-indigo-500",
    accentText: "text-indigo-700 dark:text-indigo-400",
  },
  red: {
    iconWrap: "bg-red-50 text-red-600 dark:bg-red-950/70 dark:text-red-400",
    dot: "bg-red-500",
    accentText: "text-red-700 dark:text-red-400",
  },
  orange: {
    iconWrap:
      "bg-orange-50 text-orange-600 dark:bg-orange-950/70 dark:text-orange-400",
    dot: "bg-orange-500",
    accentText: "text-orange-700 dark:text-orange-400",
  },
  amber: {
    iconWrap:
      "bg-amber-50 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400",
    dot: "bg-amber-500",
    accentText: "text-amber-700 dark:text-amber-400",
  },
  emerald: {
    iconWrap:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400",
    dot: "bg-emerald-500",
    accentText: "text-emerald-700 dark:text-emerald-400",
  },
  sky: {
    iconWrap: "bg-sky-50 text-sky-600 dark:bg-sky-950/70 dark:text-sky-400",
    dot: "bg-sky-500",
    accentText: "text-sky-700 dark:text-sky-400",
  },
};

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  icon: React.ReactNode;
  tone?: KpiTone;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  sublabel,
  icon,
  tone = "neutral",
  href,
  onClick,
  active = false,
  className = "",
}: KpiCardProps) {
  const styles = TONE_MAP[tone];
  const interactive = Boolean(href || onClick);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </div>
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.iconWrap}`}
        >
          {icon}
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <p className="tabular-nums text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[26px]">
          {value}
        </p>
        {interactive && (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
        )}
      </div>

      {sublabel && (
        <p className="tabular-nums mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {sublabel}
        </p>
      )}
    </>
  );

  const baseClass = `${
    interactive ? "ui-card-interactive group" : "ui-card"
  } flex flex-col justify-between p-4 text-left ${
    active
      ? "border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400"
      : ""
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {body}
      </button>
    );
  }

  return <div className={baseClass}>{body}</div>;
}
