"""The poll question kinds stay in step across the model, the schemas and the handler registry."""

from __future__ import annotations

from typing import get_args

from app.models import POLL_QUESTION_KINDS
from app.schemas import PollQuestionKind
from app.services.poll_kinds import KINDS, PollKind


def test_every_kind_has_exactly_one_handler() -> None:
    assert set(KINDS) == set(POLL_QUESTION_KINDS) == set(get_args(PollQuestionKind))
    assert all(isinstance(handler, PollKind) and handler.name == name for name, handler in KINDS.items())


def test_only_a_kind_with_options_takes_the_dietary_note() -> None:
    # The note is about the meals: a kind may only claim it when admins can give it options.
    assert all(handler.has_options for handler in KINDS.values() if handler.has_note)
