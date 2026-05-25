import asyncio

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.logging import get_logger, log_call
from app.db.session import engine

router = APIRouter(prefix="/database", tags=["database"])
logger = get_logger(__name__)


def _ping_database() -> dict[str, str]:
    logger.debug("pinging database...")
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    db_host = settings.database_url.rsplit("@", maxsplit=1)[-1]
    logger.info("DB ping OK  →  %s", db_host)
    return {"status": "ok", "database_url": db_host}


@router.get("/health")
@log_call(logger)
async def database_health() -> dict[str, str]:
    return await asyncio.to_thread(_ping_database)
