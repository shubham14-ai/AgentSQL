from collections.abc import Iterable
from urllib.parse import urlparse

from openai import OpenAI

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_DIALECT_MAP = {
    "mysql": "MySQL",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "sqlite": "SQLite",
    "mssql": "SQL Server (T-SQL)",
    "oracle": "Oracle (PL/SQL)",
    "bigquery": "BigQuery (Standard SQL)",
    "snowflake": "Snowflake SQL",
    "redshift": "Amazon Redshift SQL",
    "duckdb": "DuckDB SQL",
    "clickhouse": "ClickHouse SQL",
}

_BASE_SYSTEM_PROMPT = """You are AgentSQL, an AI assistant for SQL analytics.
Help the user reason about {dialect} databases, produce safe read-only SQL when useful,
and explain assumptions clearly. Use {dialect} syntax.
Only reference tables and columns that exist in the schema provided. Never invent table or column names.
When producing SQL, output ONLY the SQL statement — no preamble, no explanation, no markdown fences.
When answering in natural language, be concise."""


def detect_dialect(database_url: str | None) -> str:
    """Return a human-readable dialect name from a SQLAlchemy-style URL."""
    if not database_url:
        return "SQL"
    try:
        scheme = urlparse(database_url).scheme.lower()
        # scheme may be 'mysql+pymysql', 'postgresql+psycopg2', etc.
        base = scheme.split("+")[0]
        return _DIALECT_MAP.get(base, "SQL")
    except Exception:
        return "SQL"


def _build_system_prompt(schema_context: str | None, dialect: str = "SQL") -> str:
    base = _BASE_SYSTEM_PROMPT.format(dialect=dialect)
    if not schema_context:
        return base
    return f"{base}\n\n## Database Schema\n{schema_context}"


def _build_nvidia_client() -> OpenAI:
    if not settings.nvidia_api_key:
        raise RuntimeError("NVIDIA_API_KEY is not configured.")
    logger.debug("NVIDIA client  model=%s  base_url=%s", settings.nvidia_model, settings.nvidia_base_url)
    return OpenAI(base_url=settings.nvidia_base_url, api_key=settings.nvidia_api_key)


def stream_nvidia_chat(
    message: str,
    schema_context: str | None = None,
    dialect: str = "SQL",
) -> Iterable[tuple[str, str]]:
    """Yield (kind, token) tuples.

    kind is 'thinking' for internal chain-of-thought, 'content' for the visible answer.
    Callers that only want the answer should filter for kind == 'content'.
    """
    logger.info("stream_nvidia_chat  model=%s  dialect=%s  msg_len=%d", settings.nvidia_model, dialect, len(message))
    client = _build_nvidia_client()
    completion = client.chat.completions.create(
        model=settings.nvidia_model,
        messages=[
            {"role": "system", "content": _build_system_prompt(schema_context, dialect)},
            {"role": "user", "content": message},
        ],
        temperature=0.2,
        top_p=0.95,
        max_tokens=4096,
        extra_body={
            "chat_template_kwargs": {
                "thinking": True,
                "reasoning_effort": "low",
            },
        },
        stream=True,
    )

    for chunk in completion:
        if not getattr(chunk, "choices", None):
            continue
        delta = chunk.choices[0].delta
        reasoning = getattr(delta, "reasoning", None) or getattr(delta, "reasoning_content", None)
        if reasoning:
            yield ("thinking", reasoning)
        if delta.content is not None:
            yield ("content", delta.content)

    logger.debug("stream_nvidia_chat  stream finished")


def complete_nvidia_chat(
    message: str,
    schema_context: str | None = None,
    dialect: str = "SQL",
) -> str:
    """Return only the content answer (no chain-of-thought)."""
    parts = [tok for kind, tok in stream_nvidia_chat(message, schema_context, dialect) if kind == "content"]
    result = "".join(parts).strip()
    logger.info("complete_nvidia_chat  result_len=%d", len(result))
    return result
