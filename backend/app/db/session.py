from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

try:
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    logger.info("DB engine created  →  %s", settings.database_url.rsplit('@', 1)[-1])
except Exception as exc:
    logger.error("DB engine creation FAILED: %s", exc)
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
