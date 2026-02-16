"""
ChirpStack API proxy with tenant-level access control.

Routes all ChirpStack API calls through our backend, adding:
- JWT authentication
- Role-based tenant filtering
- Request logging
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.responses import StreamingResponse
from typing import Annotated
from urllib.parse import urlparse
import httpx
import json
import logging
import asyncio
import struct

from ..config import get_settings
from ..auth.dependencies import CurrentUser
from ..auth.models import Role

router = APIRouter(prefix="/api/proxy", tags=["proxy"])
settings = get_settings()
logger = logging.getLogger(__name__)


def get_user_tenant_ids(user) -> set[str] | None:
    """Returns allowed tenant IDs for user, or None if unrestricted (super_admin)."""
    if user.role == Role.SUPER_ADMIN:
        return None  # No restrictions
    return {ta.tenant_id for ta in user.tenant_assignments}


def check_tenant_access(user, tenant_id: str | None):
    """Raises 403 if user doesn't have access to the given tenant."""
    if user.role == Role.SUPER_ADMIN:
        return
    if tenant_id is None:
        return
    allowed = get_user_tenant_ids(user)
    if allowed is not None and tenant_id not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied for tenant {tenant_id}",
        )


def check_read_only(user, method: str):
    """Client visu users can only read."""
    if user.role == Role.CLIENT_VISU and method not in ("GET", "OPTIONS"):
        raise HTTPException(
            status_code=403,
            detail="Read-only access: client_visu cannot modify resources",
        )


def proto_time_to_iso(ts) -> str:
    """Convert protobuf Timestamp to ISO string."""
    from datetime import datetime, timezone
    if not ts:
        return ""
    try:
        seconds = ts.seconds if hasattr(ts, 'seconds') else 0
        nanos = ts.nanos if hasattr(ts, 'nanos') else 0
        if not seconds and not nanos:
            return ""
        dt = datetime.fromtimestamp(seconds + nanos / 1e9, tz=timezone.utc)
        return dt.isoformat()
    except Exception:
        return ""


# ── gRPC-web helpers ──

def grpc_web_encode(message_bytes: bytes) -> bytes:
    """Encode protobuf message into a gRPC-web frame (1 byte flag + 4 bytes length + data)."""
    return b'\x00' + struct.pack('>I', len(message_bytes)) + message_bytes


def grpc_web_decode_frames(data: bytes) -> list[bytes]:
    """Decode gRPC-web response into individual protobuf message frames."""
    messages = []
    pos = 0
    while pos < len(data):
        if pos + 5 > len(data):
            break
        frame_type = data[pos]
        frame_len = struct.unpack('>I', data[pos + 1:pos + 5])[0]
        pos += 5
        if pos + frame_len > len(data):
            break
        frame_data = data[pos:pos + frame_len]
        pos += frame_len
        if frame_type == 0x00:  # Data frame (0x80 = trailers, skip)
            messages.append(frame_data)
    return messages


# ── Device Events via gRPC-web over HTTP (works through nginx) ──


@router.get("/device-events-recent/{dev_eui}")
async def get_recent_device_events(
    dev_eui: str,
    request: Request,
    current_user: CurrentUser,
    server: str = "",
    limit: int = 10,
):
    """
    Fetch recent buffered device events using gRPC-web over HTTP.

    Unlike plain gRPC (HTTP/2), gRPC-web uses HTTP/1.1 and works through
    nginx reverse proxies. This is the same protocol ChirpStack's web UI uses.
    """
    if not server:
        raise HTTPException(400, "Missing 'server' query parameter")

    api_token = ""
    auth_header = request.headers.get("grpc-metadata-authorization", "")
    if auth_header.startswith("Bearer "):
        api_token = auth_header[7:]

    try:
        from chirpstack_api.api import internal_pb2
    except ImportError:
        raise HTTPException(
            500,
            "chirpstack-api non installe. Lancez: pip install chirpstack-api",
        )

    # Build gRPC-web request
    req = internal_pb2.StreamDeviceEventsRequest(dev_eui=dev_eui)
    req_body = grpc_web_encode(req.SerializeToString())

    grpc_web_url = f"{server}/api.InternalService/StreamDeviceEvents"
    logger.info(f"gRPC-web request -> {grpc_web_url} for device {dev_eui}")

    events = []
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(connect=5.0, read=3.0, write=5.0, pool=5.0),
        ) as client:
            async with client.stream(
                "POST",
                grpc_web_url,
                content=req_body,
                headers={
                    "Content-Type": "application/grpc-web+proto",
                    "Authorization": f"Bearer {api_token}",
                    "x-grpc-web": "1",
                },
            ) as response:
                if response.status_code != 200:
                    body_text = ""
                    async for chunk in response.aiter_bytes():
                        body_text += chunk.decode(errors="replace")
                        if len(body_text) > 500:
                            break
                    raise HTTPException(
                        response.status_code,
                        f"ChirpStack returned {response.status_code}: {body_text[:200]}",
                    )

                # Read streamed gRPC-web frames
                buffer = b""
                async for chunk in response.aiter_bytes():
                    buffer += chunk

                    # Parse complete frames from buffer
                    while len(buffer) >= 5:
                        frame_type = buffer[0]
                        frame_len = struct.unpack('>I', buffer[1:5])[0]
                        if len(buffer) < 5 + frame_len:
                            break  # Incomplete frame, wait for more data
                        frame_data = buffer[5:5 + frame_len]
                        buffer = buffer[5 + frame_len:]

                        if frame_type == 0x00:  # Data frame
                            log_item = internal_pb2.LogItem()
                            log_item.ParseFromString(frame_data)

                            try:
                                body = json.loads(log_item.body) if log_item.body else {}
                            except json.JSONDecodeError:
                                body = {}

                            events.append({
                                "type": log_item.description or "unknown",
                                "time": proto_time_to_iso(log_item.time),
                                **body,
                            })

                            if len(events) >= limit:
                                break

                    if len(events) >= limit:
                        break

    except httpx.ReadTimeout:
        pass  # Normal: no more buffered events, read timeout fires
    except HTTPException:
        raise
    except httpx.ConnectError as e:
        raise HTTPException(502, f"Connexion impossible a ChirpStack: {str(e)}")
    except Exception as e:
        logger.exception(f"gRPC-web error for {dev_eui}")
        if not events:
            raise HTTPException(502, f"gRPC-web {type(e).__name__}: {str(e)}")

    return {"events": events, "count": len(events)}


# ── Standard proxy (catch-all, must be AFTER specific routes) ──

@router.api_route(
    "/{chirpstack_url:path}",
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)
async def proxy_chirpstack(
    chirpstack_url: str,
    request: Request,
    current_user: CurrentUser,
):
    """
    Proxy requests to ChirpStack API.

    URL format: /api/proxy/{base_url}/{api_path}
    Example: /api/proxy/http://chirpstack:8080/api/devices
    """
    # Enforce read-only for client_visu
    check_read_only(current_user, request.method)

    # Extract tenant_id from query params if present
    tenant_id = request.query_params.get("tenant_id") or request.query_params.get(
        "tenantId"
    )
    if tenant_id:
        check_tenant_access(current_user, tenant_id)

    # Rebuild target URL
    target_url = chirpstack_url
    if request.query_params:
        target_url += "?" + str(request.query_params)

    # Forward headers (keep auth token for ChirpStack)
    forward_headers = {}
    if "grpc-metadata-authorization" in request.headers:
        forward_headers["Grpc-Metadata-Authorization"] = request.headers[
            "grpc-metadata-authorization"
        ]
    if "content-type" in request.headers:
        forward_headers["Content-Type"] = request.headers["content-type"]

    # Read request body
    body = await request.body()

    # For CLIENT_VISU users, enforce tenant_id on sensitive endpoints
    if (
        current_user.role == Role.CLIENT_VISU
        and request.method == "GET"
        and not tenant_id
        and ("/api/applications" in chirpstack_url or "/api/devices" in chirpstack_url)
    ):
        allowed = get_user_tenant_ids(current_user)
        if allowed:
            if len(allowed) == 1:
                tenant_id = next(iter(allowed))
                separator = "&" if "?" in target_url else "?"
                target_url += f"{separator}tenant_id={tenant_id}"
            else:
                # Multiple tenants but none specified — block the request
                raise HTTPException(
                    status_code=400,
                    detail="tenant_id parameter is required",
                )
    # For ADMIN users, inject tenant filtering when single tenant
    elif (
        current_user.role == Role.ADMIN
        and "/api/applications" in chirpstack_url
        and request.method == "GET"
        and not tenant_id
    ):
        allowed = get_user_tenant_ids(current_user)
        if allowed and len(allowed) == 1:
            separator = "&" if "?" in target_url else "?"
            target_url += f"{separator}tenant_id={next(iter(allowed))}"

    try:
        async with httpx.AsyncClient(timeout=settings.proxy_timeout) as client:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=body if body else None,
            )

        # Filter applications by allowed_application_ids for restricted users
        if (
            "/api/applications" in chirpstack_url
            and request.method == "GET"
            and response.status_code == 200
        ):
            # Find allowed app IDs for the specific tenant being queried
            allowed_app_ids: set[str] = set()
            for ta in current_user.tenant_assignments:
                # Match by tenant_id if available, otherwise use all assignments
                if tenant_id and ta.tenant_id != tenant_id:
                    continue
                if ta.allowed_application_ids:
                    allowed_app_ids.update(
                        x.strip()
                        for x in ta.allowed_application_ids.split(",")
                        if x.strip()
                    )
            if allowed_app_ids:
                try:
                    data = response.json()
                    if "result" in data:
                        data["result"] = [
                            a for a in data["result"] if a.get("id") in allowed_app_ids
                        ]
                        data["totalCount"] = str(len(data["result"]))
                        return JSONResponse(
                            content=data, status_code=response.status_code
                        )
                except Exception:
                    pass  # Not JSON or unexpected format, forward as-is

        # Forward response with CORS headers
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers={
                "Content-Type": response.headers.get("content-type", "application/json"),
            },
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="ChirpStack request timeout")
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502, detail="Cannot connect to ChirpStack server"
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")
