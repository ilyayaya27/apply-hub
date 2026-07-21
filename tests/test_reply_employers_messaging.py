"""Пропуск чатов с закрытой перепиской до запроса messages."""

from hh_applicant_tool.operations.reply_employers import (
    _is_employer_message,
    _messaging_open,
)


def test_messaging_open_only_ok():
    assert _messaging_open({"messaging_status": "ok"}) is True
    assert _messaging_open({"messaging_status": "no_invitation"}) is False
    assert _messaging_open({"messaging_status": "disabled_by_employer"}) is False


def test_is_employer_message_handles_null_author():
    """author может быть None (системное сообщение) — не должно падать
    с TypeError: 'NoneType' object is not subscriptable."""
    assert _is_employer_message({"author": {"participant_type": "employer"}}) is True
    assert _is_employer_message({"author": {"participant_type": "applicant"}}) is False
    assert _is_employer_message({"author": None}) is False
    assert _is_employer_message({}) is False
