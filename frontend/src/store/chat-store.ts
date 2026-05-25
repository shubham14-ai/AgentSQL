import { create } from "zustand";
import type { FollowUpAnchor, ResultTable } from "@/types/api";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  table?: ResultTable;
  sql?: string;
};

type ChatState = {
  messages: ChatMessage[];
  draft: string;
  pendingAnchor: FollowUpAnchor | null;
  submitNonce: number;
  addMessage: (message: Omit<ChatMessage, "id">) => void;
  clearMessages: () => void;
  setDraft: (s: string) => void;
  requestSubmit: (text: string, anchor?: FollowUpAnchor) => void;
};

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask a question about your database. I can draft SQL, explain assumptions, and prepare a chart-ready answer.",
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [welcome],
  draft: "",
  pendingAnchor: null,
  submitNonce: 0,
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, id: crypto.randomUUID() },
      ],
    })),
  clearMessages: () => set({ messages: [welcome] }),
  setDraft: (s) => set({ draft: s }),
  requestSubmit: (text, anchor) =>
    set((state) => ({
      draft: text,
      pendingAnchor: anchor ?? null,
      submitNonce: state.submitNonce + 1,
    })),
}));
