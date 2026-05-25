from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    database_url: str = Field(min_length=1)


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    database_url: str
    status: str
    schema_json: str | None = None
    created_at: str


class ProjectListOut(BaseModel):
    projects: list[ProjectOut]


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    tables: list[str] = []
