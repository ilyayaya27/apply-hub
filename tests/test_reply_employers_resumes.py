"""Фильтр резюме для reply-employers: без --resume-id — все published."""

from hh_applicant_tool.operations.reply_employers import _published_resumes_for_reply


def test_all_published_when_no_resume_id():
    resumes = [
        {"id": "a", "status": {"id": "published"}},
        {"id": "b", "status": {"id": "not_published"}},
        {"id": "c", "status": {"id": "published"}},
    ]
    assert [r["id"] for r in _published_resumes_for_reply(resumes, None)] == [
        "a",
        "c",
    ]


def test_single_resume_when_resume_id_set():
    resumes = [
        {"id": "a", "status": {"id": "published"}},
        {"id": "b", "status": {"id": "published"}},
    ]
    assert [r["id"] for r in _published_resumes_for_reply(resumes, "b")] == ["b"]
