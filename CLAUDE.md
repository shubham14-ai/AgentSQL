# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + Zustand + Recharts. Custom `ui/` primitives (no Radix/shadcn — Dialog/Popover are hand-rolled with the same pattern).
- **Backend**: FastAPI + Pydantic v2. LLM via NVIDIA's OpenAI-compatible endpoint (`NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` in `.env`).
- **Infra**: Redis + Qdrant in `docker-compose.yml`. MySQL is commented out — `DATABASE_URL` defaults to a host-machine MySQL via `host.docker.internal`. A SQLite dev DB (`procurement_ai_testing_sqlite.db`) and `data.sql` seed live at the repo root.

## Common commands

Full stack via Docker (preferred):
```bash
./sql-agent.sh init     # build + start everything
./sql-agent.sh rebuild  # incremental rebuild after code changes
./sql-agent.sh logs backend
./sql-agent.sh health
```
URLs: frontend `:3000`, backend `:8000`, Qdrant `:6333`.

Frontend dev (from `frontend/`):
```bash
npm install
npm run dev          # next dev
npm run build        # next build
npm run lint         # eslint
npx tsc --noEmit     # type-check (no script alias)
```

Backend dev (from `backend/`):
```bash
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest tests/                          # all tests
pytest tests/test_health.py::test_x    # single test
```

## Architecture

### Backend request flow

`app/main.py` mounts three routers under `/api`: `chat`, `project` (`database` route exists but is not yet registered). The chat path is the load-bearing one:

1. **`app/api/routes/chat.py`** — `POST /api/chat` (one-shot) and `GET|POST /api/chat/stream` (SSE). The GET stream variant exists specifically so the browser's `EventSource` can be used; `project_id` and `anchor` come in as query params (`anchor` is a JSON-encoded `FollowUpAnchor`).
2. **`app/services/agent_service.py`** — Orchestrator. Loads schema context from the project row, prepends an `[Context: …]` note when a `FollowUpAnchor` is present (`_apply_anchor`), and yields SSE events with `stage` ∈ `understanding | finding_tables | sql_generation | validation | result`. The final `result` event carries the full `ChatResponse` (answer markdown, optional `sql`, optional `table`).
3. **`app/services/llm_service.py`** — NVIDIA SDK wrapper; blocking calls are bridged to async via a thread + queue in `agent_service._stream_nvidia_chat_async`.

The schemas in `app/schemas/chat.py` are the contract — frontend `src/types/api.ts` mirrors them. When you add a field to `ChatResponse` or `ChatRequest`, update both.

### Frontend chat flow

- **`src/store/chat-store.ts`** owns `messages`, the input `draft`, and a `requestSubmit(text, anchor?)` action that bumps `submitNonce`. Any component (e.g. `FollowUpPopover`) can call `requestSubmit` to enqueue a send.
- **`src/app/page.tsx`** is the single place that actually fires the request: a `useEffect` on `submitNonce` calls `submitPrompt(text, anchor)`, which builds the `/api/chat/stream` URL (anchor → JSON query param) and sets `streamUrl`.
- **`src/hooks/useSSE.ts`** subscribes to that URL; when `stage:"result"` arrives, the payload (`answer`, `table`, `sql`) is appended to the chat-store as an assistant message.
- **`src/features/result-table.tsx`** renders `message.table` paginated. Every cell, plus inline `<code>` spans in the markdown summary, is wrapped in **`src/features/follow-up-popover.tsx`**, which emits a `FollowUpAnchor` of kind `cell | row | summary-span`. Suggestion strings come from the pure `buildSuggestions(anchor)` helper — no LLM call.

The pattern to remember: **don't add another submit path**. Components that want to send a message call `useChatStore.getState().requestSubmit(...)`; `page.tsx` is the only place that talks to the SSE endpoint.

### LangGraph / multi-tenant note

The README and the broader product vision describe a LangGraph ReAct agent with per-tenant credential isolation, checkpointer-backed threads, and a human-in-the-loop SQL approval gate. The current `agent_service.py` is a streaming wrapper around a single LLM call — the graph itself isn't built yet. `app/agents/sql_agent.py` is the placeholder. Treat the staged SSE events (`understanding → finding_tables → sql_generation → validation → result`) as the contract the eventual graph will fulfill; the frontend already consumes them.

## Conventions

- Frontend uses custom `ui/` primitives (Dialog, Popover) styled with `cn()` from `src/lib/utils.ts`. When adding a primitive, follow `components/ui/dialog.tsx` — controlled/uncontrolled via a React context, no Radix dependency.
- Interactive components need `"use client"`.
- `AGENTS.md` notes: read `node_modules/next/dist/docs/` before using Next.js 16 APIs (training-cutoff drift).
