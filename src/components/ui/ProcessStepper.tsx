"use client";

import { Check } from "lucide-react";

interface StepItem {
  key: string;
  label: string;
  description?: string;
}

interface ProcessStepperProps {
  steps: StepItem[];
  currentKey: string;
}

export function ProcessStepper({ steps, currentKey }: ProcessStepperProps) {
  const activeIdx = Math.max(
    0,
    steps.findIndex((s) => s.key === currentKey)
  );

  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Estado del proceso">
      {steps.map((step, idx) => {
        const done = idx < activeIdx || (idx === activeIdx && activeIdx === steps.length - 1);
        const current = idx === activeIdx && idx < steps.length - 1;
        return (
          <li
            key={step.key}
            className={`relative rounded-xl border px-3 py-2.5 transition-colors ${
              done
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800/70 dark:bg-emerald-950/35"
                : current
                ? "border-indigo-300 bg-indigo-50/70 dark:border-indigo-700/70 dark:bg-indigo-950/40"
                : "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-emerald-600 text-white"
                    : current
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span
                className={`truncate text-xs font-bold ${
                  done
                    ? "text-emerald-900 dark:text-emerald-200"
                    : current
                    ? "text-indigo-900 dark:text-indigo-200"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {step.description && (
              <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {step.description}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
