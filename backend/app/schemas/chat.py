from typing import Any, Literal

from pydantic import BaseModel, Field


class FollowUpAnchor(BaseModel):
    kind: Literal["cell", "row", "summary-span"]
    column: str | None = None
    value: Any | None = None
    row_summary: str | None = None
    text: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None
    project_id: str | None = None
    anchor: FollowUpAnchor | None = None


class ChartSpec(BaseModel):
    type: str
    data: list[dict[str, str | int | float | None]]


class ResultTable(BaseModel):
    columns: list[str]
    rows: list[list[str | int | float | None]]


class ChatResponse(BaseModel):
    answer: str
    sql: str | None = None
    chart: ChartSpec | None = None
    table: ResultTable | None = None
