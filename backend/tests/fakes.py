"""Minimal fakes for exercising app.tools/app.agent without a real Supabase
or Anthropic connection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class FakeResponse:
    data: Any


class FakeQuery:
    """Mimics supabase-py's chainable query builder. Any chain of
    attribute calls (select/eq/ilike/order/insert/update/upsert/delete)
    just returns self; .execute() returns the canned response."""

    def __init__(self, response: FakeResponse | Exception):
        self._response = response

    def __getattr__(self, _name: str):
        def _chain(*_args, **_kwargs):
            return self

        return _chain

    def execute(self):
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class FakeTable:
    def __init__(self, response: FakeResponse | Exception):
        self._response = response

    def select(self, *_args, **_kwargs):
        return FakeQuery(self._response)

    def insert(self, *_args, **_kwargs):
        return FakeQuery(self._response)

    def update(self, *_args, **_kwargs):
        return FakeQuery(self._response)

    def upsert(self, *_args, **_kwargs):
        return FakeQuery(self._response)

    def delete(self, *_args, **_kwargs):
        return FakeQuery(self._response)


class FakeSupabaseClient:
    """Returns the same canned response for every .table(...) call —
    enough for tests that only exercise one query per tool call."""

    def __init__(self, response: FakeResponse | Exception):
        self._response = response

    def table(self, _name: str):
        return FakeTable(self._response)
