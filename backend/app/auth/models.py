import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Enum, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class Role(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    CLIENT_VISU = "client_visu"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.CLIENT_VISU)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    tenant_assignments: Mapped[list["TenantAssignment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    # ChirpStack connection info (stored per user)
    chirpstack_servers: Mapped[list["ChirpStackServer"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class TenantAssignment(Base):
    """Links a user to one or more ChirpStack tenants."""

    __tablename__ = "tenant_assignments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    tenant_name: Mapped[str] = mapped_column(String(255), default="")
    server_url: Mapped[str] = mapped_column(String(500), default="")
    server_api_token: Mapped[str] = mapped_column(Text, default="")
    allowed_application_ids: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="tenant_assignments")


class ChirpStackServer(Base):
    """Saved ChirpStack server connections per user."""

    __tablename__ = "chirpstack_servers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(500))
    api_token: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="chirpstack_servers")
