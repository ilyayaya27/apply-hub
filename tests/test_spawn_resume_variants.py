from hh_applicant_tool.resume_variant import (
    apply_variant_texts,
    build_variant_update_body,
)

FIXTURE_PROFILE = {
    "resume": {
        "title": "Frontend-разработчик (React)",
        "skill_set": ["React", "TypeScript"],
        "experience": [
            {
                "company": "Acme Corp",
                "position": "Frontend Developer",
                "start": "2022-01-01",
                "end": "2024-06-01",
                "description": "Разработка SPA на React.",
            },
            {
                "company": "Beta LLC",
                "position": "Junior Frontend",
                "start": "2020-03-01",
                "end": "2021-12-01",
                "description": "Вёрстка и компоненты.",
            },
        ],
    }
}


def test_apply_variant_texts_changes_title_and_skills():
    variant = {
        "title": "React / TypeScript Frontend Engineer",
        "skill_set": ["React", "Next.js", "TypeScript"],
    }
    out = apply_variant_texts(FIXTURE_PROFILE, variant)
    assert out["resume"]["title"] == variant["title"]
    assert out["resume"]["skill_set"] == variant["skill_set"]


def test_apply_variant_texts_patches_experience_only_descriptions():
    variant = {
        "experience": [
            {"index": 0, "description": "Lead React apps, perf tuning."},
            {"index": 1, "description": "UI components and design system."},
        ],
    }
    out = apply_variant_texts(FIXTURE_PROFILE, variant)
    exp = out["resume"]["experience"]
    assert exp[0]["description"] == variant["experience"][0]["description"]
    assert exp[0]["company"] == "Acme Corp"
    assert exp[0]["start"] == "2022-01-01"
    assert exp[1]["company"] == "Beta LLC"


def test_apply_variant_texts_does_not_mutate_source():
    variant = {"title": "New title"}
    apply_variant_texts(FIXTURE_PROFILE, variant)
    assert FIXTURE_PROFILE["resume"]["title"] == "Frontend-разработчик (React)"


def test_build_variant_update_body_minimal_put():
    draft = {
        "resume": {
            "title": None,
            "skill_set": ["React"],
            "experience": [
                {
                    "id": "exp-1",
                    "company": "Acme Corp",
                    "position": "Frontend Developer",
                    "start": "2022-01-01",
                    "end": "2024-06-01",
                    "description": "Old text.",
                }
            ],
        }
    }
    variant = {
        "title": "React Engineer",
        "skill_set": ["React", "Next.js"],
        "experience": [{"index": 0, "description": "New text."}],
    }
    body = build_variant_update_body(draft, variant)
    assert set(body.keys()) == {"resume"}
    resume = body["resume"]
    assert resume["title"] == "React Engineer"
    assert resume["skill_set"] == ["React", "Next.js"]
    assert resume["experience"] == [
        {
            "id": "exp-1",
            "company": "Acme Corp",
            "position": "Frontend Developer",
            "start": "2022-01-01",
            "end": "2024-06-01",
            "description": "New text.",
        }
    ]
    assert "setka_access" not in body
