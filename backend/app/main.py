from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, database, health, project
from app.core.config import settings
from app.core.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router, prefix="/api")
app.include_router(project.router, prefix="/api")


@app.on_event("startup")
async def _startup() -> None:
    logger.info("🚀 %s starting  [env=%s]", settings.app_name, settings.environment)
    logger.info("   DB  : %s", settings.database_url.rsplit('@', 1)[-1])
    logger.info("   CORS: %s", settings.cors_origins)
