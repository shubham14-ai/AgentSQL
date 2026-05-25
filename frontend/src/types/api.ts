export type HealthResponse = {
  status: "ok";
  service: string;
};

export type ResultTable = {
  columns: string[];
  rows: (string | number | null)[][];
};

export type FollowUpAnchor =
  | { kind: "cell"; column: string; value: string | number | null; row_summary?: string }
  | { kind: "row"; row_summary: string }
  | { kind: "summary-span"; text: string };

export type ChatRequest = {
  message: string;
  session_id?: string;
  project_id?: string;
  anchor?: FollowUpAnchor;
};

export type ChatResponse = {
  answer: string;
  sql?: string;
  table?: ResultTable;
  chart?: {
    type: "bar" | "line" | "table";
    data: Array<Record<string, string | number | null>>;
  };
};

// SSE staged pipeline events
export type SSEStage =
  | { stage: "understanding"; message: string }
  | { stage: "finding_tables"; message: string }
  | { stage: "thinking"; token: string }
  | { stage: "sql_generation"; token: string }
  | { stage: "validation"; message: string }
  | { stage: "result"; payload: ChatResponse };

// Project types
export type Project = {
  id: string;
  name: string;
  description: string;
  database_url: string;
  status: "connecting" | "processing" | "ready" | "error";
  schema_json: string | null;
  created_at: string;
};

export type ProjectCreate = {
  name: string;
  description: string;
  database_url: string;
};

export type ConnectionTestResult = {
  success: boolean;
  message: string;
  tables: string[];
};
