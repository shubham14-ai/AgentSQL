"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";
import type { FollowUpAnchor } from "@/types/api";

export function buildSuggestions(anchor: FollowUpAnchor): string[] {
  if (anchor.kind === "cell") {
    const v = anchor.value === null ? "NULL" : String(anchor.value);
    return [
      `Show all rows where ${anchor.column} = ${v}`,
      `What's the distribution of ${anchor.column} around ${v}?`,
      `Explain why ${anchor.column} = ${v} stands out`,
    ];
  }
  if (anchor.kind === "row") {
    return [
      `Tell me more about this row: ${anchor.row_summary}`,
      `Find similar rows to: ${anchor.row_summary}`,
      `What drove this result? (${anchor.row_summary})`,
    ];
  }
  return [
    `Tell me more about \`${anchor.text}\``,
    `Show example values from \`${anchor.text}\``,
    `How is \`${anchor.text}\` related to other tables?`,
  ];
}

export function FollowUpPopover({
  anchor,
  children,
}: {
  anchor: FollowUpAnchor;
  children: React.ReactElement<{ onClick?: React.MouseEventHandler }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const requestSubmit = useChatStore((s) => s.requestSubmit);
  const suggestions = React.useMemo(() => buildSuggestions(anchor), [anchor]);

  function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    requestSubmit(trimmed, anchor);
    setText("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <PopoverContent>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Ask a follow-up
        </p>
        <div className="mb-2 space-y-1">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="w-full rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(text);
            }}
            placeholder="Custom follow-up..."
            className="h-8 text-xs"
          />
          <Button size="icon" onClick={() => send(text)} aria-label="Send follow-up">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
