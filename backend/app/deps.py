"""
Auth dependency for the AI assistant layer.

Per the PRD (Section 7): the assistant must never be able to exceed what the
calling user could do manually. So every tool call is executed against
Supabase using a client authenticated as *that user* (their own JWT, not a
service-role key) — Supabase RLS then enforces the same role-based
permissions here as it does for direct/manual UI actions. The service-role
key is intentionally not used for tool execution.
"""

from dataclasses import dataclass

from fastapi import Header, HTTPException
from supabase import create_client, Client

from .config import settings


@dataclass
class AuthedUser:
    client: Client
    user_id: str


async def get_current_user(authorization: str = Header(...)) -> AuthedUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    access_token = authorization.removeprefix("Bearer ").strip()

    try:
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        user_response = client.auth.get_user(access_token)
    except HTTPException:
        raise
    except Exception as exc:
        # Covers both a malformed/expired user token and a misconfigured or
        # unreachable Supabase project — neither is this caller's fault to
        # debug, so surface it as "not authenticated" rather than a raw 500.
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    if user_response is None or user_response.user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Scope PostgREST requests to this user so RLS policies apply as them,
    # not as the anon role.
    client.postgrest.auth(access_token)

    return AuthedUser(client=client, user_id=user_response.user.id)
