import axios from "axios";
import type { ChatRequest, ChatResponse, ConnectionTestResult, HealthResponse, Project, ProjectCreate } from "@/types/api";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 30_000,
});

export async function getHealth() {
  const { data } = await api.get<HealthResponse>("/health");
  return data;
}

export async function sendChatMessage(payload: ChatRequest) {
  const { data } = await api.post<ChatResponse>("/api/chat", payload);
  return data;
}

export async function openChatStream(payload: ChatRequest) {
  const response = await fetch(`${api.defaults.baseURL}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    throw new Error("Unable to open chat stream.");
  }

  return response.body.getReader();
}

// Project APIs
export async function listProjects() {
  const { data } = await api.get<{ projects: Project[] }>("/api/projects");
  return data.projects;
}

export async function createProject(payload: ProjectCreate) {
  const { data } = await api.post<Project>("/api/projects", payload);
  return data;
}

export async function deleteProject(projectId: string) {
  await api.delete(`/api/projects/${projectId}`);
}

export async function testConnection(projectId: string) {
  const { data } = await api.post<ConnectionTestResult>(`/api/projects/${projectId}/test-connection`);
  return data;
}

export async function testConnectionDirect(payload: ProjectCreate) {
  const { data } = await api.post<ConnectionTestResult>("/api/projects/test-connection", payload);
  return data;
}

export async function processSchema(projectId: string) {
  const { data } = await api.post<{ status: string; tables: unknown[] }>(`/api/projects/${projectId}/process-schema`);
  return data;
}

