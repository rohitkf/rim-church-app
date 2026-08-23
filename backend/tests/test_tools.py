from postgrest.exceptions import APIError

from app.tools.executors import execute_tool
from .fakes import FakeResponse, FakeSupabaseClient


def test_unknown_tool_is_an_error_not_a_crash():
    client = FakeSupabaseClient(FakeResponse(data=[]))
    result, is_error = execute_tool(client, "user-1", "not_a_real_tool", {})
    assert is_error is True
    assert "Unknown tool" in result["error"]


def test_list_departments_success():
    client = FakeSupabaseClient(FakeResponse(data=[{"id": "d1", "name": "Media"}]))
    result, is_error = execute_tool(client, "user-1", "list_departments", {})
    assert is_error is False
    assert result["departments"] == [{"id": "d1", "name": "Media"}]


def test_department_not_found_is_a_clean_tool_error():
    client = FakeSupabaseClient(FakeResponse(data=[]))
    result, is_error = execute_tool(
        client, "user-1", "get_inventory", {"department_name": "Nonexistent"}
    )
    assert is_error is True
    assert "No department matching" in result["error"]


def test_rls_denial_surfaces_as_tool_error_not_a_crash():
    # mark_checklist_item_complete's UPDATE returns no rows when RLS denies
    # the update — supabase-py raises postgrest.exceptions.APIError with an
    # empty/failed response in some cases, but the more common shape for a
    # silent RLS denial is just an empty .data list, which the executor
    # already treats as a permission failure.
    client = FakeSupabaseClient(FakeResponse(data=[]))
    result, is_error = execute_tool(client, "user-1", "mark_checklist_item_complete", {"item_id": "item-1"})
    assert is_error is True
    assert "permission" in result["error"] or "assigned" in result["error"]


def test_postgrest_api_error_is_caught_and_reported():
    client = FakeSupabaseClient(APIError({"message": "permission denied for table checklist_items"}))
    result, is_error = execute_tool(client, "user-1", "list_departments", {})
    assert is_error is True
    assert "permission denied" in result["error"]


def test_delete_tool_reports_success():
    client = FakeSupabaseClient(FakeResponse(data=[{"id": "item-1"}]))
    result, is_error = execute_tool(client, "user-1", "delete_checklist_item", {"item_id": "item-1"})
    assert is_error is False
    assert result == {"deleted": "item-1"}
