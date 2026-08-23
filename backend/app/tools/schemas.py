"""
Tool schemas passed to Claude (Anthropic Messages API tool-use format).

Scope note: this covers the highest-value actions/queries from Sections
9-15 of the PRD (checklist verification chain, attendance, message board,
inventory, informational lookups) rather than literally every manual
action — FR16.2 in full is a much larger surface. Adding another tool is
mechanical: a schema entry here, an executor in executors.py, and (if it's
destructive) a listing in DESTRUCTIVE_TOOLS.
"""

DEPARTMENT_NAME = {"type": "string", "description": "Department name, e.g. 'Media' or 'Worship'."}
SERVICE_DATE = {"type": "string", "description": "Service date, YYYY-MM-DD."}
SERVICE_TYPE = {"type": "string", "description": "Optional service type, e.g. 'English', 'Malayalam'."}
ITEM_ID = {"type": "string", "description": "UUID of the checklist item, from a prior get_checklist_status call."}
INVENTORY_ITEM_ID = {"type": "string", "description": "UUID of the inventory item, from a prior get_inventory call."}

TOOL_SCHEMAS: list[dict] = [
    {
        "name": "list_departments",
        "description": "List every department the current user can see.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_team_for_service",
        "description": "Who's on a department's core team, and who is assigned to sessions for a given service (e.g. 'who's on media team this Sunday').",
        "input_schema": {
            "type": "object",
            "properties": {
                "department_name": DEPARTMENT_NAME,
                "service_date": SERVICE_DATE,
                "service_type": SERVICE_TYPE,
            },
            "required": ["department_name", "service_date"],
        },
    },
    {
        "name": "get_checklist_status",
        "description": "Get a department's checklist items and their verification status for a service (e.g. 'what's left on today's checklist'). Returns each item's id, needed for the verify/complete/delete tools.",
        "input_schema": {
            "type": "object",
            "properties": {
                "department_name": DEPARTMENT_NAME,
                "service_date": SERVICE_DATE,
                "service_type": SERVICE_TYPE,
            },
            "required": ["department_name", "service_date"],
        },
    },
    {
        "name": "mark_checklist_item_complete",
        "description": "Mark a checklist item as member-complete. Only works if the item is assigned to the current user and is currently pending.",
        "input_schema": {
            "type": "object",
            "properties": {"item_id": ITEM_ID},
            "required": ["item_id"],
        },
    },
    {
        "name": "verify_checklist_item_head",
        "description": "Head-verify a checklist item (Department Head / Assisting Head only). Item must currently be member-complete.",
        "input_schema": {
            "type": "object",
            "properties": {"item_id": ITEM_ID},
            "required": ["item_id"],
        },
    },
    {
        "name": "verify_checklist_item_coordinator",
        "description": "Give final coordinator sign-off on a checklist item (Service Flow Coordinator only). Item must currently be head-verified.",
        "input_schema": {
            "type": "object",
            "properties": {"item_id": ITEM_ID},
            "required": ["item_id"],
        },
    },
    {
        "name": "log_attendance",
        "description": "Log expected/actual attendance for a department at a service (Department Head / Admin only).",
        "input_schema": {
            "type": "object",
            "properties": {
                "department_name": DEPARTMENT_NAME,
                "service_date": SERVICE_DATE,
                "service_type": SERVICE_TYPE,
                "expected_count": {"type": "integer"},
                "actual_count": {"type": "integer"},
            },
            "required": ["department_name", "service_date", "expected_count", "actual_count"],
        },
    },
    {
        "name": "post_message",
        "description": "Post an announcement to the message board (Admin / Department Head / Service Flow Coordinator only). Posts as the current user.",
        "input_schema": {
            "type": "object",
            "properties": {"body": {"type": "string"}},
            "required": ["body"],
        },
    },
    {
        "name": "get_inventory",
        "description": "List a department's inventory items, with their ids.",
        "input_schema": {
            "type": "object",
            "properties": {"department_name": DEPARTMENT_NAME},
            "required": ["department_name"],
        },
    },
    {
        "name": "delete_checklist_item",
        "description": "Permanently delete a checklist item (Department Head / Admin only). Destructive — the caller must confirm before this executes.",
        "input_schema": {
            "type": "object",
            "properties": {"item_id": ITEM_ID},
            "required": ["item_id"],
        },
    },
    {
        "name": "delete_inventory_item",
        "description": "Permanently delete an inventory item (Department Head / Admin only). Destructive — the caller must confirm before this executes.",
        "input_schema": {
            "type": "object",
            "properties": {"inventory_item_id": INVENTORY_ITEM_ID},
            "required": ["inventory_item_id"],
        },
    },
]

# FR16.4: destructive/high-impact tools require explicit user confirmation
# before the agent loop executes them — see agent.py.
DESTRUCTIVE_TOOLS = {"delete_checklist_item", "delete_inventory_item"}
