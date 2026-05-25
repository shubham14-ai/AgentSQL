import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.logging import get_logger, log_call
from app.schemas.chat import ChatRequest, ChatResponse, FollowUpAnchor
from app.services.agent_service import run_sql_agent, stream_sql_agent

router = APIRouter(tags=["chat"])
logger = get_logger(__name__)


@router.post("/chat", response_model=ChatResponse)
@log_call(logger)
async def chat(request: ChatRequest) -> ChatResponse:
    logger.debug("message=%r", request.message[:120])
    return await run_sql_agent(request)


@router.post("/chat/stream")
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    logger.info("stream_chat  POST  message=%r", request.message[:80])
    return StreamingResponse(stream_sql_agent(request), media_type="text/event-stream")


@router.get("/chat/stream")
async def stream_chat_get(
    message: str,
    project_id: str | None = None,
    anchor: str | None = None,
) -> StreamingResponse:
    logger.info("stream_chat_get  GET  message=%r  anchor=%s", message[:80], bool(anchor))
    parsed_anchor: FollowUpAnchor | None = None
    if anchor:
        try:
            parsed_anchor = FollowUpAnchor.model_validate_json(anchor)
        except Exception as exc:
            logger.warning("stream_chat_get  anchor parse failed: %s", exc)
    request = ChatRequest(message=message, project_id=project_id, anchor=parsed_anchor)
    return StreamingResponse(stream_sql_agent(request), media_type="text/event-stream")
