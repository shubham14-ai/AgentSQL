"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = {
  id: number;
  stage: string;
  message?: string;
  token?: string;
};

const STAGE_LABELS: Record<string, string> = {
  understanding: "Understanding question",
  finding_tables: "Finding relevant tables",
  thinking: "Reasoning",
  sql_generation: "Generating SQL",
  validation: "Validating query",
  result: "Complete",
};

function ThinkingBlock({ events }: { events: Stage[] }) {
  const [open, setOpen] = useState(false);
  const text = events.map((e) => e.token ?? "").join("");
  if (!text) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? "Hide reasoning" : "Show reasoning"}
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-500 whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}

export function ThinkingTimeline({ events }: { events: Stage[] }) {
  if (events.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-slate-400">
        Pipeline stages will appear here
      </div>
    );
  }

  // Group consecutive thinking tokens together so they render as one collapsible block.
  type Row =
    | { kind: "stage"; event: Stage; idx: number }
    | { kind: "thinking-group"; events: Stage[]; idx: number };

  const rows: Row[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.stage === "thinking") {
      const last = rows[rows.length - 1];
      if (last?.kind === "thinking-group") {
        last.events.push(e);
      } else {
        rows.push({ kind: "thinking-group", events: [e], idx: i });
      }
    } else {
      rows.push({ kind: "stage", event: e, idx: i });
    }
  }

  const lastRow = rows[rows.length - 1];

  return (
    <div className="space-y-0">
      {rows.map((row, rowIdx) => {
        const isLast = rowIdx === rows.length - 1;

        if (row.kind === "thinking-group") {
          return (
            <div key={`thinking-${row.idx}`} className="relative flex items-start gap-3 pb-4">
              {!isLast && (
                <div className="absolute left-[11px] top-6 h-full w-px bg-slate-200" />
              )}
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Circle className="h-2.5 w-2.5 fill-current" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-500">Reasoning</p>
                <ThinkingBlock events={row.events} />
              </div>
            </div>
          );
        }

        const e = row.event;
        const isResult = e.stage === "result";
        const isGenerating = e.stage === "sql_generation";
        const isActive = isLast && !isResult;

        return (
          <div key={e.id} className="relative flex items-start gap-3 pb-4">
            {!isLast && (
              <div className="absolute left-[11px] top-6 h-full w-px bg-slate-200" />
            )}
            <div
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                isResult
                  ? "bg-emerald-100 text-emerald-600"
                  : isActive
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-500",
              )}
            >
              {isResult ? (
                <Check className="h-3.5 w-3.5" />
              ) : isActive && !isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Circle className="h-2.5 w-2.5 fill-current" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  isResult ? "text-emerald-700" : isActive ? "text-slate-950" : "text-slate-600",
                )}
              >
                {STAGE_LABELS[e.stage] ?? e.stage}
              </p>
              {e.message && <p className="text-xs text-slate-500">{e.message}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ThinkingTimeline;
