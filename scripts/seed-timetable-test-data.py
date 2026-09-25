#!/usr/bin/env python3
"""Seeds realistic FAKE timetabling test data so the OR-Tools solver
(scripts/timetable-solver/generate.py) has something real to chew on.

Everything created here is unmistakably test data, per the ground rule
"clearly fake ... and only used in a dedicated seed script, never shipped
as real content":
  * academic year label "2099/00 (TEST)", is_test=true
  * every year group / subject / class / teacher name prefixed "TEST -"
  * every row that has an is_test column has it set true

Idempotent: re-running this deletes any previous run of this exact test
academic year (cascades to classes/enrolments/etc via FKs) and recreates
it from scratch, rather than accumulating duplicates.

Deliberately includes a tight constraint (TEST - Arabic has only ONE
teacher, available on only 2 of the 5 weekdays, teaching 3 classes that
each need 4 lessons/week — more demand than that one teacher's availability
can satisfy) so the solver's conflict-reporting path actually gets
exercised, per the Phase A test plan.

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run via:
    python3 scripts/seed-timetable-test-data.py
"""
from __future__ import annotations

import os
import sys
from datetime import date

from supabase import create_client

YEAR_LABEL = "2099/00 (TEST)"


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        return 2

    sb = create_client(url, key)

    # Clean up any previous run of this test year first (idempotent).
    existing = sb.table("academic_years").select("id").eq("label", YEAR_LABEL).execute().data
    if existing:
        sb.table("academic_years").delete().eq("id", existing[0]["id"]).execute()
        print(f"Removed previous '{YEAR_LABEL}' test data.")
    # year_groups/subjects/virtual_sessions aren't scoped to an academic
    # year (they're school-wide reference data), so deleting the year alone
    # doesn't cascade to them — clean up any previous test-flagged rows
    # directly so a re-run doesn't hit their unique-name constraints.
    for table in ("year_groups", "subjects", "virtual_sessions", "classes"):
        sb.table(table).delete().eq("is_test", True).execute()

    year = (
        sb.table("academic_years")
        .insert({"label": YEAR_LABEL, "starts_on": "2099-09-01", "ends_on": "2100-07-20", "is_test": True})
        .execute()
        .data[0]
    )
    year_id = year["id"]

    term = (
        sb.table("terms")
        .insert(
            {
                "academic_year_id": year_id,
                "name": "TEST - Autumn Term",
                "starts_on": "2099-09-01",
                "ends_on": "2099-12-19",
                "sanity_document_id": None,
            }
        )
        .execute()
        .data[0]
    )

    year_groups = {}
    for i, name in enumerate(["TEST - Year 3", "TEST - Year 4", "TEST - Year 5"]):
        row = sb.table("year_groups").insert({"name": name, "sort_order": i, "is_test": True}).execute().data[0]
        year_groups[name] = row["id"]

    subjects = {}
    for name, is_core in [
        ("TEST - Maths", True),
        ("TEST - English", True),
        ("TEST - Arabic", False),
        ("TEST - Qur'an", False),
        ("TEST - Science", True),
        ("TEST - Art", False),
    ]:
        row = sb.table("subjects").insert({"name": name, "is_core": is_core, "is_test": True}).execute().data[0]
        subjects[name] = row["id"]

    sb.table("virtual_sessions").insert(
        [{"name": f"TEST - Session {c}", "is_test": True} for c in ["A", "B", "C", "D"]]
    ).execute()

    # ── teachers: create real auth users (service-role admin API) so
    # teacher_user_id foreign keys to profiles/auth.users are satisfiable,
    # exactly like scripts/seed-admin.mjs's own pattern for staff.
    teacher_specs = [
        # (name, weekdays available (1=Mon..5=Fri), subjects they can teach)
        ("TEST Teacher - Maths 1", [1, 2, 3, 4, 5], ["TEST - Maths"]),
        ("TEST Teacher - Maths 2", [1, 2, 3, 4], ["TEST - Maths", "TEST - Science"]),
        ("TEST Teacher - English 1", [1, 2, 3, 4, 5], ["TEST - English"]),
        ("TEST Teacher - English 2", [2, 3, 4, 5], ["TEST - English", "TEST - Art"]),
        ("TEST Teacher - Science 1", [1, 3, 5], ["TEST - Science"]),
        # Deliberately tight: the ONLY Arabic teacher, only Tue/Thu — see
        # module docstring. Three Arabic classes each need 4 lessons/week,
        # far more than 2 days can hold, so some MUST be reported as
        # unplaceable conflicts.
        ("TEST Teacher - Arabic (tight)", [2, 4], ["TEST - Arabic", "TEST - Qur'an"]),
    ]

    teacher_ids: dict[str, str] = {}
    for i, (name, _weekdays, _subjs) in enumerate(teacher_specs):
        email = f"test-timetable-teacher-{i + 1}@example.invalid"
        existing_user = None
        page = 1
        while True:
            res = sb.auth.admin.list_users(page=page, per_page=200)
            found = next((u for u in res if u.email and u.email.lower() == email), None)
            if found:
                existing_user = found
                break
            if len(res) < 200:
                break
            page += 1
        if existing_user:
            user_id = existing_user.id
        else:
            created = sb.auth.admin.create_user(
                {"email": email, "password": "Test-Password-1234!", "email_confirm": True}
            )
            user_id = created.user.id
        sb.table("profiles").upsert(
            {"id": user_id, "role": "teacher", "full_name": name, "email": email}, on_conflict="id"
        ).execute()
        sb.table("user_roles").upsert(
            {"user_id": user_id, "role": "teacher", "scope_type": "none"},
            on_conflict="user_id,role,scope_type,scope_id",
        ).execute()
        teacher_ids[name] = user_id

    for name, weekdays, _subjs in teacher_specs:
        rows = [
            {
                "teacher_user_id": teacher_ids[name],
                "academic_year_id": year_id,
                "weekday": wd,
                "start_time": "09:00",
                "end_time": "12:15",
                "contracted": True,
            }
            for wd in weekdays
        ] + [
            {
                "teacher_user_id": teacher_ids[name],
                "academic_year_id": year_id,
                "weekday": wd,
                "start_time": "15:00",
                "end_time": "18:15",
                "contracted": True,
            }
            for wd in weekdays
        ]
        sb.table("teacher_availability").insert(rows).execute()

    # Protected time: TEST - Jumu'ah break, Friday 13:00-14:00 (outside the
    # solver's own period grid, included anyway to exercise the table/UI).
    sb.table("protected_times").insert(
        {"name": "TEST - Jumu'ah break", "academic_year_id": year_id, "weekday": 5, "start_time": "13:00", "end_time": "14:00"}
    ).execute()

    # ── classes: a mix across year groups/subjects, ~15 total, including
    # the three tight Arabic ones.
    class_specs = [
        # (year_group, subject, weekly_lessons)
        ("TEST - Year 3", "TEST - Maths", 4),
        ("TEST - Year 3", "TEST - English", 4),
        ("TEST - Year 3", "TEST - Science", 2),
        ("TEST - Year 3", "TEST - Arabic", 4),
        ("TEST - Year 4", "TEST - Maths", 4),
        ("TEST - Year 4", "TEST - English", 4),
        ("TEST - Year 4", "TEST - Science", 2),
        ("TEST - Year 4", "TEST - Arabic", 4),
        ("TEST - Year 4", "TEST - Qur'an", 2),
        ("TEST - Year 5", "TEST - Maths", 4),
        ("TEST - Year 5", "TEST - English", 4),
        ("TEST - Year 5", "TEST - Science", 2),
        ("TEST - Year 5", "TEST - Arabic", 4),
        ("TEST - Year 5", "TEST - Art", 1),
        ("TEST - Year 3", "TEST - Art", 1),
    ]

    # Which teachers are qualified for a subject (from teacher_specs above)
    # — used to scope each class to its qualified teacher(s) via
    # class-scoped user_roles rows, exactly how a real Timetabler would
    # assign classes to teachers before running the solver. Without this,
    # the solver's fallback ("no class-scoped teacher yet -> any teacher is
    # eligible") would let it dodge the deliberately tight Arabic
    # constraint by using an unqualified teacher instead.
    qualified_teachers_by_subject: dict[str, list[str]] = {}
    for name, _weekdays, subjs in teacher_specs:
        for s in subjs:
            qualified_teachers_by_subject.setdefault(s, []).append(teacher_ids[name])

    class_ids = []
    for yg, subj, weekly in class_specs:
        row = (
            sb.table("classes")
            .insert(
                {
                    "name": f"{yg} {subj}",
                    "year_group": yg,
                    "subject": subj,
                    "academic_year_id": year_id,
                    "year_group_id": year_groups[yg],
                    "subject_id": subjects[subj],
                    "weekly_lessons": weekly,
                    "lesson_length_minutes": 60,
                    "is_test": True,
                }
            )
            .execute()
            .data[0]
        )
        class_ids.append(row["id"])
        for teacher_user_id in qualified_teachers_by_subject.get(subj, []):
            sb.table("user_roles").upsert(
                {"user_id": teacher_user_id, "role": "teacher", "scope_type": "class", "scope_id": row["id"]},
                on_conflict="user_id,role,scope_type,scope_id",
            ).execute()

    print(f"Seeded: academic year '{YEAR_LABEL}' (id={year_id}), term '{term['name']}',")
    print(f"  {len(year_groups)} year groups, {len(subjects)} subjects, {len(teacher_specs)} teachers,")
    print(f"  {len(class_ids)} classes.")
    print("Intentionally tight constraint: TEST Teacher - Arabic (tight) is the only Arabic/Qur'an teacher,")
    print("available Tue/Thu only, against 3 Arabic classes needing 4 lessons/week each (12 total) plus")
    print("2 Qur'an lessons/week — more demand than 2 days can satisfy, so the solver's conflict-reporting")
    print("path should be exercised when this data is run through generate.py.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
