from pydantic import BaseModel, EmailStr, Field, model_validator
from datetime import datetime
from .models import Role


# ── Auth ──

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserRead"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── User CRUD ──

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    password: str = Field(min_length=4, max_length=128)
    role: Role = Role.CLIENT_VISU


class UserUpdate(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    role: Role | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    id: str
    username: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime
    tenant_assignments: list["TenantAssignmentRead"] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="wrap")
    @classmethod
    def _convert_assignments(cls, values, handler):
        """Convert TenantAssignment ORM objects with CSV deserialization."""
        # Only convert from ORM objects (not already-validated Pydantic models/dicts)
        if hasattr(values, "tenant_assignments") and not isinstance(values, (dict, cls)):
            converted = [
                TenantAssignmentRead.from_model(ta).model_dump()
                for ta in values.tenant_assignments
            ]
            data = {
                "id": values.id,
                "username": values.username,
                "email": values.email,
                "role": values.role,
                "is_active": values.is_active,
                "created_at": values.created_at,
                "tenant_assignments": converted,
            }
            return handler(data)
        return handler(values)


# ── Tenant Assignment ──

class TenantAssignmentCreate(BaseModel):
    tenant_id: str
    tenant_name: str = ""
    server_url: str = ""
    server_api_token: str = ""
    allowed_application_ids: list[str] = []


class TenantAssignmentUpdate(BaseModel):
    server_url: str | None = None
    server_api_token: str | None = None
    allowed_application_ids: list[str] | None = None


class TenantAssignmentRead(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str
    server_url: str
    server_api_token: str
    allowed_application_ids: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, obj):
        """Convert DB model to schema, deserializing CSV allowed_application_ids."""
        raw = obj.allowed_application_ids or ""
        app_ids = [x.strip() for x in raw.split(",") if x.strip()] if raw else []
        return cls(
            id=obj.id,
            tenant_id=obj.tenant_id,
            tenant_name=obj.tenant_name,
            server_url=obj.server_url or "",
            server_api_token=obj.server_api_token or "",
            allowed_application_ids=app_ids,
            created_at=obj.created_at,
        )


class ClientConnectionRead(BaseModel):
    tenant_id: str
    tenant_name: str
    server_url: str
    server_api_token: str
    allowed_application_ids: list[str]


# ── ChirpStack Server ──

class ServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1, max_length=500)
    api_token: str = ""


class ServerUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    api_token: str | None = None


class ServerRead(BaseModel):
    id: str
    name: str
    url: str
    api_token: str
    created_at: datetime

    model_config = {"from_attributes": True}
