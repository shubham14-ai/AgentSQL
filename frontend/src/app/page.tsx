"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import {
  Database,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSSE } from "@/hooks/useSSE";
import ThinkingTimeline from "@/components/ThinkingTimeline";
import { AddProjectModal } from "@/components/AddProjectModal";
import { useChatStore } from "@/store/chat-store";
import { useProjectStore } from "@/store/project-store";
import { listProjects, deleteProject as deleteProjectApi } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Project, FollowUpAnchor } from "@/types/api";
import { ResultTableView } from "@/features/result-table";
import { FollowUpPopover } from "@/features/follow-up-popover";

const SchemaChart = dynamic(
  () => import("@/features/schema-chart").then((mod) => mod.SchemaChart),
  {
    ssr: false,
    loading: () => <div className="h-full rounded-md bg-slate-100" />,
  },
);

export default function Home() {
  // ── Project state ────────────────────────────────────────────────
  const {
    projects,
    activeProjectId,
    setProjects,
    removeProject,
    setActiveProjectId,
  } = useProjectStore();
  const [showAddProject, setShowAddProject] = useState(false);

  // Load projects on mount
  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {});
  }, [setProjects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  // ── Chat state ───────────────────────────────────────────────────
  const [isSending, setIsSending] = useState(false);
  const [stages, setStages] = useState<any[]>([]);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  const {
    messages,
    addMessage,
    clearMessages,
    draft,
    setDraft,
    pendingAnchor,
    submitNonce,
  } = useChatStore();

  // Attach SSE listener when streamUrl is set
  useSSE(streamUrl ?? "", (payload) => {
    if (!payload) return;
    setStages((s) => [...s, { id: s.length + 1, ...payload }]);
    if (payload.stage === "result" && payload.payload) {
      const p = payload.payload;
      addMessage({
        role: "assistant",
        content: p.answer || "",
        table: p.table,
        sql: p.sql,
      });
      setIsSending(false);
      setStreamUrl(null);
    }
  });

  async function submitPrompt(textOverride?: string, anchor?: FollowUpAnchor | null) {
    const prompt = (textOverride ?? draft).trim();
    if (!prompt || isSending) return;

    addMessage({ role: "user", content: prompt });
    setDraft("");
    setIsSending(true);
    setStages([]);

    const params = new URLSearchParams({ message: prompt });
    if (activeProjectId) params.set("project_id", activeProjectId);
    if (anchor) params.set("anchor", JSON.stringify(anchor));

    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chat/stream?${params}`;
    setStreamUrl(url);
  }

  // Trigger submit when popover or other components request it via the store
  useEffect(() => {
    if (submitNonce === 0) return;
    void submitPrompt(draft, pendingAnchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitNonce]);

  function selectProject(project: Project) {
    setActiveProjectId(project.id);
    clearMessages();
    setStages([]);
  }

  async function handleDeleteProject(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    try {
      await deleteProjectApi(projectId);
      removeProject(projectId);
    } catch {}
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <main className="flex h-screen bg-slate-50 text-slate-950">
      {/* ====== Left Sidebar ====== */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">AgentSQL</h1>
            <p className="text-xs text-slate-500">AI Analytics</p>
          </div>
        </div>

        {/* Create Project Button */}
        <div className="px-3 pt-4 pb-2">
          <Button
            className="w-full justify-center"
            onClick={() => setShowAddProject(true)}
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-auto px-3 pb-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Projects
          </p>
          {projects.length === 0 ? (
            <p className="px-1 py-3 text-xs text-slate-400">
              No projects yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => selectProject(project)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    activeProjectId === project.id
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      project.status === "ready"
                        ? "bg-emerald-500"
                        : project.status === "processing" ||
                            project.status === "connecting"
                          ? "animate-pulse bg-amber-500"
                          : "bg-red-500",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {project.name}
                  </span>
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    onClick={(e) => handleDeleteProject(e, project.id)}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ====== Main Content ====== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!activeProject ? (
          /* ── Empty State ── */
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                <Database className="h-8 w-8 text-slate-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">
                Welcome to AgentSQL
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Create a project and connect a database to start querying.
              </p>
              <Button className="mt-4" onClick={() => setShowAddProject(true)}>
                <Plus className="h-4 w-4" />
                Create Your First Project
              </Button>
            </div>
          </div>
        ) : (
          /* ── Project Workspace ── */
          <>
            {/* Top bar */}
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold">
                    {activeProject.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeProject.description || "No description"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {activeProject.status === "ready" ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                ) : activeProject.status === "processing" ||
                  activeProject.status === "connecting" ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Processing
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    Error
                  </span>
                )}
              </div>
            </header>

            {/* Processing View */}
            {(activeProject.status === "connecting" ||
              activeProject.status === "processing") && (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
                  <h3 className="mt-3 text-sm font-semibold text-slate-800">
                    {activeProject.status === "connecting"
                      ? "Testing database connection..."
                      : "Processing schema & embeddings..."}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    This may take a moment for larger databases.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        useProjectStore.getState().updateProject(activeProject.id, { status: "ready" })
                      }
                    >
                      Continue in Dev Mode
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await deleteProjectApi(activeProject.id);
                        } finally {
                          removeProject(activeProject.id);
                        }
                      }}
                    >
                      Delete Project
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Error View */}
            {activeProject.status === "error" && (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <Database className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-800">
                    Connection Failed
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Could not connect to the database. Please check your
                    connection URL.
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() =>
                      useProjectStore.getState().updateProject(activeProject.id, { status: "ready" })
                    }
                  >
                    Continue in Dev Mode
                  </Button>
                </div>
              </div>
            )}

            {/* Chat View */}
            {activeProject.status === "ready" && (
              <div className="grid flex-1 overflow-hidden xl:grid-cols-[1fr_360px]">
                {/* Chat Panel */}
                <div className="flex flex-col overflow-hidden">
                  <ScrollArea className="flex-1 overflow-auto p-5">
                    <div className="mx-auto max-w-3xl space-y-3">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            "max-w-[85%] rounded-lg px-4 py-3 text-sm",
                            message.role === "user"
                              ? "ml-auto bg-slate-950 text-white"
                              : "bg-white text-slate-700 shadow-sm",
                          )}
                        >
                          <ReactMarkdown
                            components={
                              message.role === "assistant"
                                ? {
                                    code({ inline, children, ...props }: any) {
                                      const text = String(children).replace(/\n$/, "");
                                      if (inline) {
                                        return (
                                          <FollowUpPopover anchor={{ kind: "summary-span", text }}>
                                            <code
                                              className="cursor-pointer rounded bg-emerald-50 px-1 py-0.5 text-emerald-800 hover:bg-emerald-100"
                                              {...props}
                                            >
                                              {children}
                                            </code>
                                          </FollowUpPopover>
                                        );
                                      }
                                      return <code {...props}>{children}</code>;
                                    },
                                  }
                                : undefined
                            }
                          >
                            {message.content}
                          </ReactMarkdown>
                          {message.role === "assistant" && message.table && (
                            <ResultTableView table={message.table} />
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Input bar */}
                  <div className="border-t border-slate-200 bg-white px-5 py-3">
                    <div className="mx-auto flex max-w-3xl gap-2">
                      <Input
                        aria-label="Ask AgentSQL"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitPrompt(draft, null);
                        }}
                        disabled={isSending}
                        placeholder="Ask a question about your database..."
                      />
                      <Button
                        onClick={() => void submitPrompt(draft, null)}
                        disabled={isSending}
                      >
                        <Send className="h-4 w-4" />
                        {isSending ? "Sending" : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Pipeline & SQL */}
                <div className="hidden overflow-auto border-l border-slate-200 bg-white xl:block">
                  <div className="space-y-0 p-4">
                    {/* Pipeline */}
                    <div className="pb-4">
                      <h3 className="mb-2 text-sm font-semibold text-slate-800">
                        AI Pipeline
                      </h3>
                      <ThinkingTimeline events={stages} />
                    </div>

                    {/* Generated SQL */}
                    {stages.some((s) => s.stage === "sql_generation") && (
                      <div className="border-t border-slate-100 pt-4">
                        <h3 className="mb-2 text-sm font-semibold text-slate-800">
                          Generated SQL
                        </h3>
                        <SyntaxHighlighter
                          language="sql"
                          style={oneLight}
                          customStyle={{
                            margin: 0,
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        >
                          {stages
                            .filter((s) => s.stage === "sql_generation")
                            .map((s) => s.token ?? "")
                            .join("") || "--"}
                        </SyntaxHighlighter>
                      </div>
                    )}

                    {/* Schema */}
                    {activeProject.schema_json && (
                      <div className="border-t border-slate-100 pt-4">
                        <h3 className="mb-2 text-sm font-semibold text-slate-800">
                          Schema Overview
                        </h3>
                        <div className="h-48">
                          <SchemaChart />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Project Modal */}
      <AddProjectModal
        open={showAddProject}
        onOpenChange={setShowAddProject}
      />
    </main>
  );
}
