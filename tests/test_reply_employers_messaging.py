"""Пропуск чатов с закрытой перепиской до запроса messages."""

from hh_applicant_tool.operations.reply_employers import _messaging_open


def test_messaging_open_only_ok():
    assert _messaging_open({"messaging_status": "ok"}) is True
    assert _messaging_open({"messaging_status": "no_invitation"}) is False
    assert _messaging_open({"messaging_status": "disabled_by_employer"}) is False
