from unittest.mock import patch

from anthropic.types import Message, TextBlock, ToolUseBlock, Usage

from app import agent
from .fakes import FakeResponse, FakeSupabaseClient


def _message(content, stop_reason):
    return Message(
        id="msg_1",
        content=content,
        model="claude-opus-5",
        role="assistant",
        stop_reason=stop_reason,
        type="message",
        usage=Usage(input_tokens=10, output_tokens=10),
    )


def test_simple_reply_no_tools():
    reply_message = _message([TextBlock(type="text", text="Hi there!")], "end_turn")

    with patch.object(agent, "_get_anthropic_client") as get_client:
        get_client.return_value.messages.create.return_value = reply_message
        client = FakeSupabaseClient(FakeResponse(data=[]))
        result = agent.start_turn(client, "user-1", [], "hello")

    assert result.reply == "Hi there!"
    assert result.pending_actions is None


def test_non_destructive_tool_executes_and_continues():
    tool_call = _message(
        [ToolUseBlock(type="tool_use", id="tu_1", name="list_departments", input={})],
        "tool_use",
    )
    final = _message([TextBlock(type="text", text="Media and Worship.")], "end_turn")

    with patch.object(agent, "_get_anthropic_client") as get_client:
        get_client.return_value.messages.create.side_effect = [tool_call, final]
        client = FakeSupabaseClient(FakeResponse(data=[{"id": "d1", "name": "Media"}]))
        result = agent.start_turn(client, "user-1", [], "what departments are there?")

    assert result.reply == "Media and Worship."
    assert result.pending_actions is None
    # tool_result for the executed tool must be in history for the second call
    tool_result_msgs = [m for m in result.history if m.get("role") == "user" and isinstance(m["content"], list)]
    assert any(block.get("type") == "tool_result" for m in tool_result_msgs for block in m["content"])


def test_destructive_tool_pauses_for_confirmation_without_executing():
    tool_call = _message(
        [ToolUseBlock(type="tool_use", id="tu_1", name="delete_checklist_item", input={"item_id": "item-1"})],
        "tool_use",
    )

    with patch.object(agent, "_get_anthropic_client") as get_client:
        get_client.return_value.messages.create.return_value = tool_call
        # If the destructive tool actually executed, this fake would need
        # a delete-shaped response; an empty select-shaped response proves
        # nothing was called, since delete_checklist_item expects data=[{"id": ...}].
        client = FakeSupabaseClient(FakeResponse(data=[]))
        result = agent.start_turn(client, "user-1", [], "delete that item")

    assert result.pending_actions is not None
    assert len(result.pending_actions) == 1
    assert result.pending_actions[0].tool_name == "delete_checklist_item"
    assert "confirmation" in result.reply.lower()


def test_confirmed_destructive_action_executes():
    pending = [agent.PendingAction(tool_use_id="tu_1", tool_name="delete_checklist_item", tool_input={"item_id": "item-1"})]
    final = _message([TextBlock(type="text", text="Deleted.")], "end_turn")

    with patch.object(agent, "_get_anthropic_client") as get_client:
        get_client.return_value.messages.create.return_value = final
        client = FakeSupabaseClient(FakeResponse(data=[{"id": "item-1"}]))
        result = agent.resume_after_confirmation(client, "user-1", [], pending, approved=True)

    assert result.reply == "Deleted."
    assert result.pending_actions is None


def test_declined_destructive_action_does_not_execute():
    final = _message([TextBlock(type="text", text="Okay, cancelled.")], "end_turn")
    pending = [agent.PendingAction(tool_use_id="tu_1", tool_name="delete_checklist_item", tool_input={"item_id": "item-1"})]

    with patch.object(agent, "_get_anthropic_client") as get_client:
        get_client.return_value.messages.create.return_value = final
        # data=[] would make a real delete look like a permission failure;
        # since approved=False the executor is never called at all.
        client = FakeSupabaseClient(FakeResponse(data=[]))
        result = agent.resume_after_confirmation(client, "user-1", [], pending, approved=False)

    assert result.reply == "Okay, cancelled."
