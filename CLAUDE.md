# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChirpStack Manager v2 is a multi-tenant IoT device management platform. It provides a web UI and API layer on top of ChirpStack, with role-based access control, tenant isolation, and bulk device operations. The UI uses French-language error messages.

## Development Commands

### Backend (Python/FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API docs available at `http://localhost:8000/api/docs` (Swagger) and `/api/redoc`.

### Frontend (Vue 3/TypeScript)
```bash
cd frontend
npm install
npm run dev          # Dev server on port 5173 with API proxy to :8000
npm run build        # Type-check (vue-tsc) then Vite production build
npm run preview      # Preview production build
```

### Docker (full stack)
```bash
cd docker
docker-compose up --build    # App at http://localhost:4000
```

### No test or lint tooling is configured.

## Architecture

### Backend (`backend/app/`)
- **FastAPI** app in `main.py` — mounts three routers: `auth`, `proxy`, `profiles`
- **SQLAlchemy** ORM with SQLite (`data/chirpstack_manager.db`), auto-created on startup via `init_db()`
- **Pydantic Settings** in `config.py` — reads from `.env` file, cached with `@lru_cache`
- Default admin credentials seeded on first run: `admin` / `admin`

**Key modules:**
- `auth/` — JWT authentication (access + refresh tokens), RBAC with three roles: `SUPER_ADMIN`, `ADMIN`, `CLIENT_VISU`
- `proxy/` — Forwards API requests to ChirpStack servers with tenant filtering and application-level access control. Supports gRPC-web for device events.
- `profiles/` — Import profile templates for bulk device provisioning
- `chirpstack/` — gRPC client for ChirpStack API integration

**Database models** (`auth/models.py`): `User`, `TenantAssignment`, `ChirpStackServer` — all use UUID string PKs.

### Frontend (`frontend/src/`)
- **Vue 3 Composition API** + TypeScript + Pinia + Vue Router
- **Tailwind CSS** with custom glass-morphism theme
- Path alias: `@/` maps to `src/`

**Key patterns:**
- `composables/` — Reusable logic: `useApi` (Axios + JWT), `useAuth`, `useDevices`, `useImport`, `useBulkOperation`, `useConfirm`
- `stores/` — Pinia stores for auth state and connection management
- `views/` — Page components (Login, Dashboard, Tools, Admin, Settings)
- `components/` — Organized into `layout/`, `tools/`, `common/`
- Router guards enforce auth and role-based access

### Proxy Architecture
The frontend never talks directly to ChirpStack. All ChirpStack API calls go through `backend/app/proxy/` which:
- Authenticates requests via JWT
- Filters responses by tenant assignments and allowed application IDs
- Enforces read-only access for `CLIENT_VISU` role (GET only)
- Proxies gRPC-web streams for real-time device events

### Docker Deployment (`docker/`)
- `Dockerfile.backend` — Python 3.12-slim, non-root user
- `Dockerfile.frontend` — Multi-stage: Node 20 build → Nginx Alpine serving
- `nginx.conf` — SPA routing, `/api/` proxy to backend, static asset caching
- Persistent volume `app-data` for SQLite database

## Role Hierarchy
- `SUPER_ADMIN` — Full access, manages users and all tenants
- `ADMIN` — Manages assigned tenants, full CRUD within scope
- `CLIENT_VISU` — Read-only access to assigned tenants (GET requests only)
