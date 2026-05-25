"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FollowUpPopover } from "@/features/follow-up-popover";
import type { ResultTable } from "@/types/api";

const PAGE_SIZE = 10;

function summarizeRow(columns: string[], row: (string | number | null)[]): string {
  return columns
    .map((c, i) => `${c}=${row[i] === null ? "NULL" : row[i]}`)
    .slice(0, 3)
    .join(", ");
}

export function ResultTableView({ table }: { table: ResultTable }) {
  const [page, setPage] = React.useState(0);
  const totalPages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const slice = table.rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              {table.columns.map((col) => (
                <th key={col} className="border-b border-slate-200 px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, rIdx) => {
              const rowSummary = summarizeRow(table.columns, row);
              return (
                <tr key={start + rIdx} className="border-b border-slate-100 last:border-0">
                  {row.map((cell, cIdx) => {
                    const column = table.columns[cIdx];
                    return (
                      <td key={cIdx} className="px-3 py-1.5 text-slate-700">
                        <FollowUpPopover
                          anchor={{
                            kind: "cell",
                            column,
                            value: cell,
                            row_summary: rowSummary,
                          }}
                        >
                          <button className="rounded px-1 -mx-1 text-left hover:bg-emerald-50 hover:text-emerald-800">
                            {cell === null ? <span className="text-slate-300">NULL</span> : String(cell)}
                          </button>
                        </FollowUpPopover>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, table.rows.length)} of {table.rows.length}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
