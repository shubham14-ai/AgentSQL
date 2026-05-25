# AgentSQL

**Natural-language SQL agent platform.** Connect any database, ask questions in plain English, and get both a concise answer and a paginated, interactive table — powered by a streaming LLM pipeline with a real-time stage view.

![AgentSQL demo](docs/demo.gif)
<!-- Replace with an actual screenshot or GIF once deployed -->

---

## Features

| Capability | Detail |
|---|---|
| **Multi-dialect DB support** | MySQL, PostgreSQL, SQLite, SQL Server, Oracle, BigQuery, Snowflake via SQLAlchemy |
| **Multi-tenant projects** | Each project has isolated credentials, schema cache, and query history |
| **Auto schema discovery** | On connect, inspects all tables and columns; builds context for the LLM |
| **Streaming AI pipeline** | SSE pipeline with visible stages: Understanding → Schema → Generating → Validating → Result |
| **Dual-response format** | Natural-language summary **+** paginated tabular result in the same reply |
| **Click-to-follow-up** | Click any cell, row, or inline `code` span to open a follow-up popover with suggested questions |
| **Dialect-aware prompts** | System prompt automatically uses the correct SQL dialect for the connected database |
| **Chain-of-thought isolation** | Model reasoning is streamed separately; only the final answer appears in chat |
| **Connection guard** | DB connection is tested *before* a project is created; Docker `host.docker.internal` hint built-in |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router)                                    │
│  Zustand store  ──►  SSE stream  ──►  ThinkingTimeline      │
│  FollowUpPopover  ──►  ResultTable (paginated, clickable)   │
└──────────────────────────┬──────────────────────────────────┘
                           │  GET /api/chat/stream?message=…&anchor=…
┌──────────────────────────▼──────────────────────────────────┐
│  FastAPI                                                    │
│  agent_service ──► llm_service (NVIDIA NIM / DeepSeek)     │
│  Stages: understanding → finding_tables → thinking →        │
│          sql_generation → validation → result               │
│  Schema context loaded from project's schema_json           │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       SQLite           Redis            Qdrant
    (project meta)    (caching)     (vector embeddings)
```

**Why SSE + staged events?** Each pipeline stage is a named event so the UI can show real progress without polling. Chain-of-thought tokens are emitted as `stage:"thinking"` (shown in a collapsible "Show reasoning" section) and never pollute the `stage:"sql_generation"` channel — keeping the generated SQL panel clean.

---

## Stack

**Frontend**: Next.js 16 · React 19 · Tailwind CSS 4 · Zustand · Recharts

**Backend**: FastAPI · SQLAlchemy · Pydantic v2 · LangGraph · LangChain

**LLM**: NVIDIA NIM (OpenAI-compatible) — default model: `deepseek-ai/deepseek-r1`

**Infra**: Redis · Qdrant · Docker Compose

---

## Quick Start

### Docker (recommended)

```bash
cp .env.example .env
# Add your NVIDIA_API_KEY to .env
./sql-agent.sh init
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Qdrant | http://localhost:6333 |

### Local development

**Backend**
```bash
cd backend
python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
NVIDIA_API_KEY=your_key        # Required — get free credits at build.nvidia.com
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=deepseek-ai/deepseek-r1

DATABASE_URL=mysql+pymysql://user:pass@host:3306/dbname
REDIS_URL=redis://localhost:6379/0
QDRANT_URL=http://localhost:6333
CORS_ORIGINS=http://localhost:3000
```

> **Docker users on Windows/Mac**: replace `localhost` with `host.docker.internal` in `DATABASE_URL` to reach databases running on the host machine.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | One-shot chat (JSON response) |
| `GET` | `/api/chat/stream` | Streaming SSE pipeline |
| `POST` | `/api/projects` | Create a project |
| `POST` | `/api/projects/test-connection` | Test DB URL before creating |
| `POST` | `/api/projects/{id}/process-schema` | Trigger schema discovery |
| `GET` | `/health` | Health check |

Full interactive docs at `/docs` (Swagger) and `/redoc`.

---

## Project Structure

```
frontend/src/
  app/             # Next.js App Router pages
  components/ui/   # Design-system primitives (Button, Input, Dialog, Popover…)
  features/        # Domain components (ResultTable, FollowUpPopover, SchemaChart)
  store/           # Zustand (chat, projects)
  hooks/           # useSSE

backend/app/
  api/routes/      # FastAPI routers (chat, project, health)
  services/        # agent_service, llm_service, schema_worker
  schemas/         # Pydantic models (ChatRequest, FollowUpAnchor, ResultTable…)
  models/          # SQLite project store
  agents/          # LangGraph agent (sql_agent.py)
  prompts/         # System prompt templates
```

---

## Deployment

### Frontend → Vercel

1. Import the repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Add env var: `NEXT_PUBLIC_API_URL=https://your-backend.railway.app`
4. Deploy

### Backend → Railway / Render

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

1. Create a new Railway project from this repo
2. Set **Root Directory** to `backend`
3. Add all env vars from `.env.example`
4. Railway auto-detects the `Dockerfile` and deploys

---

## Screenshots

> Add screenshots here after first deployment. Suggested shots:
> - Chat answering a multi-table query with the pipeline sidebar visible
> - ResultTable with the follow-up popover open on a cell
> - Add Project modal showing successful connection + tables found
