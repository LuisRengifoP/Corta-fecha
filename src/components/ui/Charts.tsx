"use client";

import Link from "next/link";

export interface DonutSegment {
  label: string;
  value: number;
  stroke: string;
  dotClass: string;
  href?: string;
}

export function ExpiryDonutChart({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: number | string;
  centerLabel: string;
}) {
  const total = Math.max(
    1,
    segments.reduce((acc, s) => acc + s.value, 0)
  );
  const hasValues = segments.some((s) => s.value > 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const arcs = segments.reduce<
    Array<DonutSegment & { dash: number; offset: number }>
  >((acc, seg) => {
    const prevUsed = acc.reduce((sum, item) => sum + item.dash, 0);
    const ratio = seg.value / total;
    const dash = ratio * circumference;
    acc.push({
      ...seg,
      dash,
      offset: -prevUsed,
    });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
        <svg
          viewBox="0 0 144 144"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label="Distribución de vencimientos por lote"
        >
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            className="text-slate-100 dark:text-slate-800"
          />
          {hasValues &&
            arcs.map((arc) => {
              if (arc.value <= 0) return null;
              return (
                <circle
                  key={arc.label}
                  cx="72"
                  cy="72"
                  r={radius}
                  fill="none"
                  stroke={arc.stroke}
                  strokeWidth="16"
                  strokeDasharray={`${arc.dash} ${circumference}`}
                  strokeDashoffset={arc.offset}
                  strokeLinecap="butt"
                  className="transition-all duration-300"
                >
                  <title>{`${arc.label}: ${arc.value} lotes (${Math.round(
                    (arc.value / total) * 100
                  )}%)`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tabular-nums text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {centerValue}
          </span>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {centerLabel}
          </span>
        </div>
      </div>

      <div className="grid w-full flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        {segments.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          const content = (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 transition-colors hover:border-indigo-200 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass}`}
                />
                <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                  {seg.label}
                </span>
              </div>
              <div className="tabular-nums flex shrink-0 items-baseline gap-1.5">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {seg.value}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {pct}%
                </span>
              </div>
            </div>
          );

          if (seg.href) {
            return (
              <Link key={seg.label} href={seg.href} className="block">
                {content}
              </Link>
            );
          }
          return <div key={seg.label}>{content}</div>;
        })}
      </div>
    </div>
  );
}
