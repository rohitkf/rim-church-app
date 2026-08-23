"""
Tool executors. Every function takes the *calling user's own* Supabase
client (see deps.get_current_user) and their user_id, and talks to
Supabase exactly like the manual UI would. That's deliberate: RLS is the
single source of truth for what this user is allowed to do (FR16.3) — a
tool never needs its own permission check, because a disallowed action
simply comes back as a Postgres RLS error, which we surface to Claude as a
normal tool error rather than a crash.
"""

from __future__ import annotations

from typing import Any

from postgrest.exceptions import APIError
from supabase import Client


class ToolError(Exception):
    """A user-facing tool failure (bad lookup, RLS denial, bad input)."""


def _resolve_department_id(client: Client, name: str) -> str:
    resp = client.table("departments").select("id, name").ilike("name", f"%{name}%").execute()
    if not resp.data:
        raise ToolError(f"No department matching '{name}' found (or you don't have access to it).")
    if len(resp.data) > 1:
        names = ", ".join(d["name"] for d in resp.data)
        raise ToolError(f"Multiple departments match '{name}': {names}. Be more specific.")
    return resp.data[0]["id"]


def _resolve_service_id(client: Client, date: str, service_type: str | None) -> str:
    query = client.table("services").select("id, service_type").eq("date", date)
    if service_type:
        query = query.ilike("service_type", f"%{service_type}%")
    resp = query.execute()
    if not resp.data:
        raise ToolError(f"No service found on {date}" + (f" of type '{service_type}'." if service_type else "."))
    if len(resp.data) > 1:
        types = ", ".join(s["service_type"] for s in resp.data)
        raise ToolError(f"Multiple services on {date}: {types}. Specify service_type.")
    return resp.data[0]["id"]


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except APIError as exc:
        # Postgres/PostgREST errors — most commonly an RLS policy denial —
        # surface as a normal (non-crashing) tool failure.
        raise ToolError(exc.message or "That action was denied.") from exc


def list_departments(client: Client, user_id: str, **_: Any) -> dict:
    resp = _run(client.table("departments").select("id, name").order("name").execute)
    return {"departments": resp.data}


def get_team_for_service(client: Client, user_id: str, department_name: str, service_date: str, service_type: str | None = None, **_: Any) -> dict:
    dept_id = _resolve_department_id(client, department_name)
    members_resp = _run(
        client.table("department_members")
        .select("member_type, profiles(first_name, last_name, email)")
        .eq("department_id", dept_id)
        .execute
    )
    result: dict[str, Any] = {"core_team": [], "guests": []}
    for row in members_resp.data:
        profile = row.get("profiles") or {}
        entry = {"name": f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()}
        (result["core_team"] if row["member_type"] == "core" else result["guests"]).append(entry)

    try:
        service_id = _resolve_service_id(client, service_date, service_type)
        sessions_resp = _run(
            client.table("service_sessions")
            .select("session_name, role_label, profiles!service_sessions_assigned_user_id_fkey(first_name, last_name)")
            .eq("department_id", dept_id)
            .eq("service_id", service_id)
            .execute
        )
        result["service_assignments"] = [
            {
                "session_name": row["session_name"],
                "role_label": row.get("role_label"),
                "assigned_to": (
                    f"{row['profiles']['first_name']} {row['profiles']['last_name']}" if row.get("profiles") else None
                ),
            }
            for row in sessions_resp.data
        ]
    except ToolError:
        result["service_assignments"] = []

    return result


def get_checklist_status(client: Client, user_id: str, department_name: str, service_date: str, service_type: str | None = None, **_: Any) -> dict:
    dept_id = _resolve_department_id(client, department_name)
    service_id = _resolve_service_id(client, service_date, service_type)

    checklist_resp = _run(
        client.table("checklists").select("id").eq("department_id", dept_id).eq("service_id", service_id).execute
    )
    if not checklist_resp.data:
        return {"checklist_exists": False, "items": []}

    checklist_id = checklist_resp.data[0]["id"]
    items_resp = _run(
        client.table("checklist_items")
        .select("id, role_label, status, assignee:profiles!checklist_items_assigned_to_fkey(first_name, last_name)")
        .eq("checklist_id", checklist_id)
        .execute
    )
    return {
        "checklist_exists": True,
        "items": [
            {
                "id": row["id"],
                "role_label": row["role_label"],
                "status": row["status"],
                "assigned_to": (
                    f"{row['assignee']['first_name']} {row['assignee']['last_name']}" if row.get("assignee") else None
                ),
            }
            for row in items_resp.data
        ],
    }


def mark_checklist_item_complete(client: Client, user_id: str, item_id: str, **_: Any) -> dict:
    resp = _run(
        client.table("checklist_items")
        .update({"status": "member_complete", "completed_by": user_id, "completed_at": "now()"})
        .eq("id", item_id)
        .execute
    )
    if not resp.data:
        raise ToolError("Item not found, not assigned to you, not pending, or you lack permission.")
    return {"updated": resp.data[0]}


def verify_checklist_item_head(client: Client, user_id: str, item_id: str, **_: Any) -> dict:
    resp = _run(
        client.table("checklist_items")
        .update({"status": "head_verified", "verified_by_head": user_id, "verified_by_head_at": "now()"})
        .eq("id", item_id)
        .execute
    )
    if not resp.data:
        raise ToolError("Item not found, not currently member-complete, or you lack permission to head-verify it.")
    return {"updated": resp.data[0]}


def verify_checklist_item_coordinator(client: Client, user_id: str, item_id: str, **_: Any) -> dict:
    resp = _run(
        client.table("checklist_items")
        .update({"status": "coordinator_verified", "verified_by_coordinator": user_id, "verified_by_coordinator_at": "now()"})
        .eq("id", item_id)
        .execute
    )
    if not resp.data:
        raise ToolError("Item not found, not currently head-verified, or you lack permission to coordinator-verify it.")
    return {"updated": resp.data[0]}


def log_attendance(
    client: Client,
    user_id: str,
    department_name: str,
    service_date: str,
    expected_count: int,
    actual_count: int,
    service_type: str | None = None,
    **_: Any,
) -> dict:
    dept_id = _resolve_department_id(client, department_name)
    service_id = _resolve_service_id(client, service_date, service_type)
    resp = _run(
        client.table("attendance")
        .upsert(
            {
                "department_id": dept_id,
                "service_id": service_id,
                "expected_count": expected_count,
                "actual_count": actual_count,
                "logged_by": user_id,
                "logged_at": "now()",
            },
            on_conflict="department_id,service_id",
        )
        .execute
    )
    if not resp.data:
        raise ToolError("Could not log attendance — you may lack permission for this department.")
    return {"logged": resp.data[0]}


def post_message(client: Client, user_id: str, body: str, **_: Any) -> dict:
    resp = _run(client.table("messages").insert({"author_id": user_id, "body": body}).execute)
    if not resp.data:
        raise ToolError("Could not post — only Admins, Department Heads, and Service Flow Coordinators can post.")
    return {"posted": resp.data[0]}


def get_inventory(client: Client, user_id: str, department_name: str, **_: Any) -> dict:
    dept_id = _resolve_department_id(client, department_name)
    resp = _run(
        client.table("inventory_items")
        .select("id, name, quantity, status, location, last_checked")
        .eq("department_id", dept_id)
        .order("name")
        .execute
    )
    return {"items": resp.data}


def delete_checklist_item(client: Client, user_id: str, item_id: str, **_: Any) -> dict:
    resp = _run(client.table("checklist_items").delete().eq("id", item_id).execute)
    if not resp.data:
        raise ToolError("Item not found, or you lack permission to delete it.")
    return {"deleted": item_id}


def delete_inventory_item(client: Client, user_id: str, inventory_item_id: str, **_: Any) -> dict:
    resp = _run(client.table("inventory_items").delete().eq("id", inventory_item_id).execute)
    if not resp.data:
        raise ToolError("Item not found, or you lack permission to delete it.")
    return {"deleted": inventory_item_id}


TOOL_EXECUTORS = {
    "list_departments": list_departments,
    "get_team_for_service": get_team_for_service,
    "get_checklist_status": get_checklist_status,
    "mark_checklist_item_complete": mark_checklist_item_complete,
    "verify_checklist_item_head": verify_checklist_item_head,
    "verify_checklist_item_coordinator": verify_checklist_item_coordinator,
    "log_attendance": log_attendance,
    "post_message": post_message,
    "get_inventory": get_inventory,
    "delete_checklist_item": delete_checklist_item,
    "delete_inventory_item": delete_inventory_item,
}


def execute_tool(client: Client, user_id: str, name: str, tool_input: dict) -> tuple[dict, bool]:
    """Returns (result, is_error) — never raises, so the agent loop can
    always feed a tool_result back to Claude (skill guidance: a failed
    tool result should be returned with is_error, not dropped)."""
    fn = TOOL_EXECUTORS.get(name)
    if fn is None:
        return {"error": f"Unknown tool '{name}'."}, True
    try:
        return fn(client, user_id, **tool_input), False
    except ToolError as exc:
        return {"error": str(exc)}, True
    except Exception as exc:  # defensive: never let a tool crash the agent loop
        return {"error": f"Unexpected error: {exc}"}, True
