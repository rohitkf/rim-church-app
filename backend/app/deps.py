"""
Auth dependency for the AI assistant layer.

Per the PRD (Section 7): the assistant must never be able to exceed what the
calling user could do manually. So every tool call is executed against
Supabase using a client authenticated as *that user* (their own JWT, not a
service-role key) — Supabase RLS then enforces the same role-based
permissions here as it does for direct/manual UI actions. The service-role
key is intentionally not used for tool execution.
"""

from fastapi import Header, HTTPException
from supabase import create_client, Client

from .config import settings


async def get_current_user_client(authorization: str = Header(...)) -> Client:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    access_token = authorization.removeprefix("Bearer ").strip()

    client = create_client(settings.supabase_url, settings.supabase_anon_key)

    try:
        user_response = client.auth.get_user(access_token)
    except Exception as exc:  # supabase-py raises on invalid/expired tokens
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    if user_response is None or user_response.user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Scope PostgREST requests to this user so RLS policies apply as them,
    # not as the anon role.
    client.postgrest.auth(access_token)

    return client
