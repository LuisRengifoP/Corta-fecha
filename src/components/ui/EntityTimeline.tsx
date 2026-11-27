"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { ENTITY_TYPE_LABELS, formatDateTimeES } from "@/lib/constants";

interface ActivityEntry {
  id: string;
  entityType: string;
  action: string;
  actor: string;
  summary: string;
  createdAt: string;
}

export function EntityTimeline({
  entityId,
  limit = 8,
}: {
  entityId: string | null | undefined;
  limit?: number;
}) {
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/activity?entityId=${encodeURIComponent(entityId)}&limit=${limit}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.logs) {
          setLogs(json.logs);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, limit]);

  if (!entityId) return null;

  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <History className="h-4 w-4 shrink-0 text-slate-400" />
        <span>Sin actuaciones registradas para este elemento aún.</span>
      </div>
    );
  }

  return (
    <ol className="relative ml-2 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
      {logs.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500 dark:border-[#111622]" />
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="font-mono text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-400">
                {entry.action} ·{" "}
                {ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType}
              </span>
              <span className="tabular-nums text-[10px] text-slate-400 dark:text-slate-500">
                {formatDateTimeES(entry.createdAt)}
              </span>
            </div>
            <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
              {entry.summary}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Por {entry.actor}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
