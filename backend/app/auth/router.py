from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Annotated

from ..database import get_db
from .models import User, Role, TenantAssignment, ChirpStackServer
from .schemas import (
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    UserCreate,
    UserUpdate,
    UserRead,
    TenantAssignmentCreate,
    TenantAssignmentUpdate,
    TenantAssignmentRead,
    ClientConnectionRead,
    ServerCreate,
    ServerUpdate,
    ServerRead,
)
from .utils import hash_password, verify_password
from .dependencies import (
    create_access_token,
    create_refresh_token,
    decode_token,
    CurrentUser,
    SuperAdmin,
    AdminOrAbove,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
DB = Annotated[Session, Depends(get_db)]


# ── Authentication ──


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DB):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled",
        )

    token_data = {"sub": user.id, "role": user.role.value}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: DB):
    payload = decode_token(body.refresh_token, expected_type="refresh")
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    token_data = {"sub": user.id, "role": user.role.value}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead)
def get_me(current_user: CurrentUser):
    return current_user


@router.put("/me", response_model=UserRead)
def update_me(body: UserUpdate, current_user: CurrentUser, db: DB):
    if body.username is not None:
        existing = (
            db.query(User)
            .filter(User.username == body.username, User.id != current_user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")
        current_user.username = body.username
    if body.email is not None:
        existing = (
            db.query(User)
            .filter(User.email == body.email, User.id != current_user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Email already taken")
        current_user.email = body.email
    if body.password is not None:
        current_user.hashed_password = hash_password(body.password)
    # Users cannot change their own role
    db.commit()
    db.refresh(current_user)
    return current_user


# ── User Management (Super Admin + Admin) ──


@router.get("/users", response_model=list[UserRead])
def list_users(current_user: AdminOrAbove, db: DB):
    if current_user.role == Role.SUPER_ADMIN:
        return db.query(User).order_by(User.created_at.desc()).all()
    # Admin: only see users assigned to the same tenants
    admin_tenant_ids = {ta.tenant_id for ta in current_user.tenant_assignments}
    users = (
        db.query(User)
        .join(TenantAssignment)
        .filter(TenantAssignment.tenant_id.in_(admin_tenant_ids))
        .distinct()
        .all()
    )
    return users


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(body: UserCreate, current_user: AdminOrAbove, db: DB):
    # Admin can only create CLIENT_VISU users
    if current_user.role == Role.ADMIN and body.role != Role.CLIENT_VISU:
        raise HTTPException(
            status_code=403, detail="Admins can only create client_visu users"
        )
    # Only super_admin can create admin or super_admin
    if body.role in (Role.SUPER_ADMIN, Role.ADMIN) and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(
            status_code=403, detail="Only super admins can create admin users"
        )

    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already exists")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(user_id: str, body: UserUpdate, current_user: AdminOrAbove, db: DB):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin cannot modify super_admin or other admins
    if current_user.role == Role.ADMIN and user.role in (Role.SUPER_ADMIN, Role.ADMIN):
        raise HTTPException(status_code=403, detail="Cannot modify this user")

    if body.username is not None:
        if db.query(User).filter(User.username == body.username, User.id != user_id).first():
            raise HTTPException(status_code=409, detail="Username taken")
        user.username = body.username
    if body.email is not None:
        if db.query(User).filter(User.email == body.email, User.id != user_id).first():
            raise HTTPException(status_code=409, detail="Email taken")
        user.email = body.email
    if body.password is not None:
        user.hashed_password = hash_password(body.password)
    if body.role is not None:
        if current_user.role != Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only super admin can change roles")
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, current_user: SuperAdmin, db: DB):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()


# ── Tenant Assignments ──


@router.post("/users/{user_id}/tenants", response_model=TenantAssignmentRead, status_code=201)
def assign_tenant(
    user_id: str, body: TenantAssignmentCreate, current_user: AdminOrAbove, db: DB
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check admin has access to this tenant
    if current_user.role == Role.ADMIN:
        admin_tenant_ids = {ta.tenant_id for ta in current_user.tenant_assignments}
        if body.tenant_id not in admin_tenant_ids:
            raise HTTPException(
                status_code=403, detail="You don't have access to this tenant"
            )

    # Check not already assigned
    existing = (
        db.query(TenantAssignment)
        .filter(
            TenantAssignment.user_id == user_id,
            TenantAssignment.tenant_id == body.tenant_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Tenant already assigned")

    assignment = TenantAssignment(
        user_id=user_id,
        tenant_id=body.tenant_id,
        tenant_name=body.tenant_name,
        server_url=body.server_url,
        server_api_token=body.server_api_token,
        allowed_application_ids=",".join(body.allowed_application_ids),
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return TenantAssignmentRead.from_model(assignment)


@router.put(
    "/users/{user_id}/tenants/{assignment_id}",
    response_model=TenantAssignmentRead,
)
def update_tenant_assignment(
    user_id: str,
    assignment_id: str,
    body: TenantAssignmentUpdate,
    current_user: AdminOrAbove,
    db: DB,
):
    assignment = (
        db.query(TenantAssignment)
        .filter(TenantAssignment.id == assignment_id, TenantAssignment.user_id == user_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if body.server_url is not None:
        assignment.server_url = body.server_url
    if body.server_api_token is not None:
        assignment.server_api_token = body.server_api_token
    if body.allowed_application_ids is not None:
        assignment.allowed_application_ids = ",".join(body.allowed_application_ids)

    db.commit()
    db.refresh(assignment)
    return TenantAssignmentRead.from_model(assignment)


@router.delete("/users/{user_id}/tenants/{assignment_id}", status_code=204)
def remove_tenant(
    user_id: str, assignment_id: str, current_user: AdminOrAbove, db: DB
):
    assignment = (
        db.query(TenantAssignment)
        .filter(TenantAssignment.id == assignment_id, TenantAssignment.user_id == user_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(assignment)
    db.commit()


# ── Auto-connect (client connections) ──


@router.get("/me/connections", response_model=list[ClientConnectionRead])
def get_my_connections(current_user: CurrentUser, db: DB):
    """Return pre-configured connections for the current user."""
    connections = []
    for ta in current_user.tenant_assignments:
        if ta.server_url:
            raw = ta.allowed_application_ids or ""
            app_ids = [x.strip() for x in raw.split(",") if x.strip()] if raw else []
            connections.append(
                ClientConnectionRead(
                    tenant_id=ta.tenant_id,
                    tenant_name=ta.tenant_name,
                    server_url=ta.server_url,
                    server_api_token=ta.server_api_token,
                    allowed_application_ids=app_ids,
                )
            )
    return connections


# ── ChirpStack Servers ──


@router.get("/servers", response_model=list[ServerRead])
def list_servers(current_user: CurrentUser, db: DB):
    return (
        db.query(ChirpStackServer)
        .filter(ChirpStackServer.user_id == current_user.id)
        .order_by(ChirpStackServer.created_at.desc())
        .all()
    )


@router.post("/servers", response_model=ServerRead, status_code=201)
def create_server(body: ServerCreate, current_user: AdminOrAbove, db: DB):
    server = ChirpStackServer(
        user_id=current_user.id,
        name=body.name,
        url=body.url,
        api_token=body.api_token,
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    return server


@router.put("/servers/{server_id}", response_model=ServerRead)
def update_server(
    server_id: str, body: ServerUpdate, current_user: AdminOrAbove, db: DB
):
    server = (
        db.query(ChirpStackServer)
        .filter(
            ChirpStackServer.id == server_id,
            ChirpStackServer.user_id == current_user.id,
        )
        .first()
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if body.name is not None:
        server.name = body.name
    if body.url is not None:
        server.url = body.url
    if body.api_token is not None:
        server.api_token = body.api_token
    db.commit()
    db.refresh(server)
    return server


@router.delete("/servers/{server_id}", status_code=204)
def delete_server(server_id: str, current_user: AdminOrAbove, db: DB):
    server = (
        db.query(ChirpStackServer)
        .filter(
            ChirpStackServer.id == server_id,
            ChirpStackServer.user_id == current_user.id,
        )
        .first()
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    db.delete(server)
    db.commit()
