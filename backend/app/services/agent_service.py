import asyncio
import json
import time
from collections.abc import AsyncIterator

from app.core.logging import get_logger
from app.models.project import get_project
from app.schemas.chat import ChatRequest, ChatResponse, ChartSpec, FollowUpAnchor
from app.services.llm_service import complete_nvidia_chat, detect_dialect, stream_nvidia_chat

logger = get_logger(__name__)

_SAMPLE_SQL = """SELECT DATE_FORMAT(created_at, '%Y-%m-01') AS month,
       count(*) AS orders,
       sum(total_cents) / 100 AS revenue
FROM orders
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
GROUP BY 1
ORDER BY 1;"""

_SAMPLE_CHART = ChartSpec(
    type="bar",
    data=[
        {"month": "Jan", "revenue": 42000},
        {"month": "Feb", "revenue": 51000},
        {"month": "Mar", "revenue": 47000},
    ],
)


def _get_project_info(project_id: str | None) -> tuple[str | None, str]:
    """Return (schema_context, dialect) for the given project."""
    if not project_id:
        return None, "SQL"
    project = get_project(project_id)
    if not project:
        return None, "SQL"

    dialect = detect_dialect(project.get("database_url"))

    schema_json = project.get("schema_json")
    if not schema_json:
        return None, dialect

    try:
        tables = json.loads(schema_json)
        lines = []
        for t in tables:
            cols = ", ".join(c["name"] if isinstance(c, dict) else c for c in t.get("columns", []))
            lines.append(f"- {t['name']}({cols})")
        return "\n".join(lines), dialect
    except Exception:
        return None, dialect


def _format_anchor_note(anchor: FollowUpAnchor | None) -> str:
    if anchor is None:
        return ""
    if anchor.kind == "cell":
        val = "NULL" if anchor.value is None else anchor.value
        note = f"User is asking a follow-up about cell {anchor.column}={val} from the previous result."
        if anchor.row_summary:
            note += f" Row context: {anchor.row_summary}."
        return note
    if anchor.kind == "row":
        return f"User is asking a follow-up about a row from the previous result: {anchor.row_summary}."
    return f"User is asking a follow-up about `{anchor.text}` from the previous result."


def _apply_anchor(message: str, anchor: FollowUpAnchor | None) -> str:
    note = _format_anchor_note(anchor)
    if not note:
        return message
    return f"[Context: {note}]\n\n{message}"


async def _stream_nvidia_chat_async(
    message: str,
    schema_context: str | None,
    dialect: str,
) -> AsyncIterator[tuple[str, str]]:
    """Run blocking stream_nvidia_chat in a thread, yield (kind, token) tuples."""
    import queue
    import threading

    q: queue.Queue[tuple[str, str] | None] = queue.Queue()

    def _producer():
        try:
            for item in stream_nvidia_chat(message, schema_context, dialect):
                q.put(item)
        finally:
            q.put(None)

    threading.Thread(target=_producer, daemon=True).start()

    loop = asyncio.get_event_loop()
    while True:
        item = await loop.run_in_executor(None, q.get)
        if item is None:
            break
        yield item


async def run_sql_agent(request: ChatRequest) -> ChatResponse:
    logger.info("run_sql_agent  question=%r", request.message[:120])
    schema_context, dialect = await asyncio.to_thread(_get_project_info, request.project_id)
    user_message = _apply_anchor(request.message, request.anchor)
    t0 = time.perf_counter()
    try:
        answer = await asyncio.to_thread(complete_nvidia_chat, user_message, schema_context, dialect)
        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("run_sql_agent  answer_len=%d  llm_time=%.0f ms", len(answer), elapsed)
    except RuntimeError as exc:
        logger.warning("run_sql_agent  LLM unavailable: %s", exc)
        answer = (
            "NVIDIA_API_KEY is not configured yet. Add it to .env, then restart "
            "the backend to enable DeepSeek via NVIDIA."
        )
    return ChatResponse(answer=answer, sql=_SAMPLE_SQL, chart=_SAMPLE_CHART)


async def stream_sql_agent(request: ChatRequest):
    """Async generator yielding SSE-formatted strings for staged AI workflow."""
    logger.info("stream_sql_agent  START  question=%r", request.message[:120])
    t_start = time.perf_counter()

    schema_context, dialect = await asyncio.to_thread(_get_project_info, request.project_id)
    user_message = _apply_anchor(request.message, request.anchor)

    schema_msg = f"Schema loaded ({dialect})" if schema_context else f"No schema — results may be inaccurate ({dialect})"

    yield f"data: {json.dumps({'stage': 'understanding', 'message': 'Understanding your question...'})}\n\n"
    yield f"data: {json.dumps({'stage': 'finding_tables', 'message': schema_msg})}\n\n"

    content_parts: list[str] = []
    token_count = 0
    t_llm = time.perf_counter()
    try:
        async for kind, token in _stream_nvidia_chat_async(user_message, schema_context, dialect):
            token_count += 1
            if kind == "thinking":
                yield f"data: {json.dumps({'stage': 'thinking', 'token': token})}\n\n"
            else:
                content_parts.append(token)
                yield f"data: {json.dumps({'stage': 'sql_generation', 'token': token})}\n\n"
        llm_ms = (time.perf_counter() - t_llm) * 1000
        logger.info("stream_sql_agent  LLM  tokens=%d  llm_time=%.0f ms", token_count, llm_ms)
    except RuntimeError as exc:
        logger.warning("stream_sql_agent  LLM unavailable: %s", exc)
        content_parts = ["NVIDIA_API_KEY is not configured yet."]

    yield f"data: {json.dumps({'stage': 'validation', 'message': 'Validating query...'})}\n\n"

    final = ChatResponse(
        answer="".join(content_parts).strip(),
        sql=_SAMPLE_SQL,
        chart=_SAMPLE_CHART,
    )
    yield f"data: {json.dumps({'stage': 'result', 'payload': final.model_dump()})}\n\n"
    yield "event: done\ndata: {}\n\n"

    total_ms = (time.perf_counter() - t_start) * 1000
    logger.info("stream_sql_agent  DONE  total_time=%.0f ms", total_ms)
