import asyncio
import json

from fastapi import APIRouter, HTTPException
from sqlalchemy import create_engine, inspect, text

from app.core.logging import get_logger
from app.models.project import create_project, delete_project, get_project, init_db, list_projects, update_project_status
from app.schemas.project import ConnectionTestResult, ProjectCreate, ProjectListOut, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])
logger = get_logger(__name__)

# Ensure DB table exists on import
init_db()


def _connect_args(database_url: str) -> dict:
    """Return driver-specific connect_args with a short timeout."""
    try:
        scheme = database_url.split("://")[0].split("+")[0].lower()
    except Exception:
        return {}
    if scheme in ("postgresql", "postgres"):
        return {"connect_timeout": 5}   # psycopg2
    if scheme == "mysql":
        return {"connect_timeout": 5}   # pymysql
    if scheme == "mssql":
        return {"timeout": 5}           # pymssql
    return {}                           # sqlite and others need no timeout arg


@router.get("", response_model=ProjectListOut)
async def get_projects():
    return ProjectListOut(projects=list_projects())


@router.post("", response_model=ProjectOut, status_code=201)
async def add_project(payload: ProjectCreate):
    project = create_project(payload.name, payload.description, payload.database_url)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project_detail(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def remove_project(project_id: str):
    if not delete_project(project_id):
        raise HTTPException(404, "Project not found")


@router.post("/{project_id}/test-connection", response_model=ConnectionTestResult)
async def test_connection(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return await _test_db_url(project["database_url"])


@router.post("/test-connection", response_model=ConnectionTestResult)
async def test_connection_direct(payload: ProjectCreate):
    """Test a database URL before creating the project."""
    return await _test_db_url(payload.database_url)


def _friendly_error(exc: Exception) -> str:
    """Extract a short, human-readable message from a SQLAlchemy exception."""
    msg = str(exc)
    # SQLAlchemy wraps the driver error; pull out the innermost cause line.
    # e.g. "(pymysql.err.OperationalError) (2003, \"Can't connect ...\")"
    for line in msg.splitlines():
        line = line.strip()
        if line and not line.startswith("(Background"):
            return line
    return msg.splitlines()[0] if msg else "Unknown connection error"


async def _test_db_url(database_url: str) -> ConnectionTestResult:
    """Try to connect and list table names. Bails out within ~5 s on unreachable hosts."""
    def _ping() -> ConnectionTestResult:
        try:
            eng = create_engine(
                database_url,
                connect_args=_connect_args(database_url),
                pool_pre_ping=True,
            )
            with eng.connect() as conn:
                insp = inspect(eng)
                tables = insp.get_table_names()
                conn.execute(text("SELECT 1"))
            eng.dispose()
            return ConnectionTestResult(success=True, message="Connection successful", tables=tables)
        except Exception as exc:
            return ConnectionTestResult(success=False, message=_friendly_error(exc), tables=[])

    try:
        result = await asyncio.wait_for(asyncio.to_thread(_ping), timeout=10)
    except asyncio.TimeoutError:
        result = ConnectionTestResult(success=False, message="Connection timed out after 10 s", tables=[])
    return result


@router.post("/{project_id}/process-schema")
async def process_schema(project_id: str):
    """Trigger schema processing: fetch tables, update status to 'ready'."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    update_project_status(project_id, "processing")

    def _fetch_schema():
        try:
            database_url = project["database_url"]
            eng = create_engine(
                database_url,
                connect_args=_connect_args(database_url),
                pool_pre_ping=True,
            )
            insp = inspect(eng)
            tables_info = []
            for tname in insp.get_table_names():
                cols = [{"name": c["name"], "type": str(c["type"])} for c in insp.get_columns(tname)]
                tables_info.append({"name": tname, "columns": cols})
            eng.dispose()
            return tables_info
        except Exception as exc:
            logger.error("process_schema failed: %s", exc)
            return None

    try:
        tables_info = await asyncio.wait_for(asyncio.to_thread(_fetch_schema), timeout=30)
    except asyncio.TimeoutError:
        logger.error("process_schema timed out for project %s", project_id)
        update_project_status(project_id, "error")
        raise HTTPException(504, "Schema processing timed out")

    if tables_info is not None:
        update_project_status(project_id, "ready", json.dumps(tables_info))
        return {"status": "ready", "tables": tables_info}
    else:
        update_project_status(project_id, "error")
        raise HTTPException(500, "Failed to process schema")
