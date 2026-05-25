"""Project model – stored in SQLite for simplicity (no extra DB service needed)."""

from __future__ import annotations

import sqlite3
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "projects.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    database_url  TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'connecting',
    schema_json   TEXT,
    created_at    TEXT NOT NULL
);
"""


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    conn = _get_conn()
    conn.executescript(_SCHEMA)
    conn.close()


# ── CRUD ────────────────────────────────────────────────────────────────────

def create_project(name: str, description: str, database_url: str) -> dict:
    project_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    conn.execute(
        "INSERT INTO projects (id, name, description, database_url, status, created_at) VALUES (?,?,?,?,?,?)",
        (project_id, name, description, database_url, "connecting", now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    conn.close()
    return dict(row)


def list_projects() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_project(project_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_project_status(project_id: str, status: str, schema_json: str | None = None) -> dict | None:
    conn = _get_conn()
    if schema_json is not None:
        conn.execute(
            "UPDATE projects SET status=?, schema_json=? WHERE id=?",
            (status, schema_json, project_id),
        )
    else:
        conn.execute("UPDATE projects SET status=? WHERE id=?", (status, project_id))
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_project(project_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0
