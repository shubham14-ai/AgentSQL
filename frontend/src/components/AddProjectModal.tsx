"use client";

import { useState } from "react";
import { Check, ChevronRight, Database, Loader2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProject, testConnectionDirect, processSchema } from "@/services/api";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

type Step = "details" | "database" | "connecting";

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Project Details" },
  { key: "database", label: "Database URL" },
  { key: "connecting", label: "Connection Complete" },
];

const DB_EXAMPLES = [
  "postgresql://user:pass@host:5432/dbname",
  "mysql+pymysql://user:pass@host:3306/dbname",
  "sqlite:///./mydata.db",
  "mssql+pymssql://user:pass@host:1433/dbname",
];

type TestResult = { success: boolean; message: string; tables: string[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddProjectModal({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const { addProject, updateProject } = useProjectStore();

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function resetAndClose() {
    setStep("details");
    setName("");
    setDescription("");
    setDatabaseUrl("");
    setIsTesting(false);
    setIsSubmitting(false);
    setTestResult(null);
    setProjectId(null);
    onOpenChange(false);
  }

  // Clear test result whenever the URL changes so the button re-enables.
  function handleUrlChange(val: string) {
    setDatabaseUrl(val);
    setTestResult(null);
  }

  async function handleTestConnection() {
    if (!databaseUrl.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConnectionDirect({
        name: name.trim(),
        description: description.trim(),
        database_url: databaseUrl.trim(),
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
        tables: [],
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleAddProject(devMode = false) {
    setIsSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        database_url: databaseUrl.trim(),
      });
      setProjectId(project.id);
      addProject(project);

      if (devMode) {
        updateProject(project.id, { status: "ready" });
        useProjectStore.getState().setActiveProjectId(project.id);
        resetAndClose();
        return;
      }

      updateProject(project.id, { status: "connecting" });
      setStep("connecting");

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Schema processing timed out")), 25_000),
      );
      Promise.race([processSchema(project.id), timeout])
        .then(() => updateProject(project.id, { status: "ready" }))
        .catch(() => updateProject(project.id, { status: "error" }));
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
        tables: [],
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription>Connect a database to start querying with AI</DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="flex items-center gap-1 py-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  i < stepIndex
                    ? "bg-emerald-600 text-white"
                    : i === stepIndex
                      ? "bg-slate-950 text-white"
                      : "bg-slate-100 text-slate-400",
                )}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  i <= stepIndex ? "text-slate-950" : "text-slate-400",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={cn("mx-1 h-px flex-1", i < stepIndex ? "bg-emerald-600" : "bg-slate-200")} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[180px] py-3">
          {step === "details" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Project Name</label>
                <Input
                  placeholder="e.g. Procurement Analytics"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <Textarea
                  placeholder="What is this project about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {step === "database" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Database Connection URL</label>
                <div className="flex gap-2">
                  <Input
                    placeholder={DB_EXAMPLES[0]}
                    value={databaseUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    autoFocus
                    className={cn(
                      testResult?.success === false && "border-red-300 focus-visible:ring-red-300",
                      testResult?.success === true && "border-emerald-300 focus-visible:ring-emerald-300",
                    )}
                  />
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={!databaseUrl.trim() || isTesting}
                    className="shrink-0"
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    {isTesting ? "Testing..." : "Test"}
                  </Button>
                </div>

                {/* Inline test feedback */}
                {testResult && (
                  <div
                    className={cn(
                      "mt-2 rounded-md px-3 py-2 text-sm",
                      testResult.success
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-red-50 text-red-800",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {testResult.success ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div>
                        <span>{testResult.success ? "Connection successful!" : testResult.message}</span>
                        {!testResult.success &&
                          /connection refused|can't connect|errno 111/i.test(testResult.message) &&
                          /localhost|127\.0\.0\.1/.test(databaseUrl) && (
                            <p className="mt-1 text-xs text-red-600">
                              Running in Docker?{" "}
                              <button
                                type="button"
                                className="underline hover:no-underline"
                                onClick={() =>
                                  handleUrlChange(
                                    databaseUrl.replace(/localhost|127\.0\.0\.1/g, "host.docker.internal"),
                                  )
                                }
                              >
                                Replace localhost with host.docker.internal
                              </button>
                            </p>
                          )}
                      </div>
                    </div>
                    {testResult.success && testResult.tables.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {testResult.tables.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                          >
                            <Database className="mr-1 h-3 w-3" />
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Supported: PostgreSQL, MySQL, SQLite, SQL Server, Oracle, BigQuery, Snowflake.
                <br />
                Examples: <code className="text-xs">{DB_EXAMPLES[1]}</code>
              </p>
            </div>
          )}

          {step === "connecting" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <Check className="h-4 w-4 text-emerald-600" />
                Project created!
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing schema & embeddings in background...
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={resetAndClose}>
            {step === "connecting" ? "Close" : "Cancel"}
          </Button>

          {step === "details" && (
            <Button onClick={() => setStep("database")} disabled={!name.trim()}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          {step === "database" && (
            <div className="flex gap-2">
              {testResult && !testResult.success && (
                <Button
                  variant="outline"
                  onClick={() => handleAddProject(true)}
                  disabled={isSubmitting}
                >
                  Dev Mode
                </Button>
              )}
              <Button
                onClick={() => handleAddProject(false)}
                disabled={isSubmitting || !testResult?.success}
              >
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <>Add Project <ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          )}

          {step === "connecting" && projectId && (
            <Button
              onClick={() => {
                useProjectStore.getState().setActiveProjectId(projectId);
                resetAndClose();
              }}
            >
              Open Project
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
