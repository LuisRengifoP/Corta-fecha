"use client";

interface FormSectionProps {
  step?: string | number;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  step,
  title,
  description,
  children,
  className = "",
}: FormSectionProps) {
  return (
    <section
      className={`rounded-xl border border-slate-200/90 bg-slate-50/55 p-3.5 dark:border-slate-800 dark:bg-slate-900/50 sm:p-4 ${className}`}
    >
      <div className="mb-3 flex items-start gap-2.5">
        {step !== undefined && (
          <span className="tabular-nums flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
