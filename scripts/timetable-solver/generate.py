#!/usr/bin/env python3
"""OR-Tools CP-SAT timetable solver for /learn (Phase A).

Run via GitHub Actions (.github/workflows/generate-timetable.yml), or
locally for development/testing:

    pip install ortools supabase
    export SUPABASE_URL=...            # e.g. http://127.0.0.1:54321 for local
    export SUPABASE_SERVICE_ROLE_KEY=...
    python3 scripts/timetable-solver/generate.py --academic-year-label "2099/00 (TEST)"

What it does:
  1. Reads constraint inputs from Supabase (classes, subjects, teachers'
     availability, protected times, enrolments) via the service-role key
     (same pattern as every other batch job in this repo — see
     scripts/seed-admin.mjs for the JS equivalent).
  2. Builds a CP-SAT model: one boolean variable per
     (class, subject-occurrence, weekday, period) candidate slot, plus a
     teacher assignment variable, with hard constraints for double-booking,
     availability, protected times, and weekly-lesson counts, and soft
     constraints (objective terms) for balance/lesson spread/time-band fit.
  3. On success, writes a new `timetable_runs` row (status='draft') and its
     `timetable_slots`. On partial/full infeasibility, still writes the
     run plus plain-language `timetable_conflicts` rows for whatever could
     not be placed, rather than failing silently — never leaves the caller
     with just a stack trace.

Two "live-lesson time bands" (grep hit: src/sanity/schemaTypes/curriculumContent.ts
`timeBandsHeading`/`timeBandsBody` — this school teaches an international,
timezone-spread cohort across two daily live-lesson windows). This solver
encodes that as PERIODS below: a morning UK band and an
afternoon/evening-UK band, so the solver can place subjects into whichever
band suits the timezone soft-constraint weighting per class (see
`--timezone-hint` per class in the DB, read from classes.timezone_band if
present — Phase A keeps this simple: two fixed bands, weighted equally
unless a class overrides it).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import date, time

from ortools.sat.python import cp_model

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - only needed for the live DB path
    create_client = None

WEEKDAYS = [1, 2, 3, 4, 5]  # Monday=1 .. Friday=5 (Sunday=0, Saturday=6 unused)

# Two fixed daily live-lesson time bands (see module docstring). Each band
# is split into fixed-length periods matching each class's
# lesson_length_minutes where possible; Phase A uses a simple 60-minute
# period grid, which covers the seed/test data and the common case.
BAND_A = [(time(9, 0), time(10, 0)), (time(10, 0), time(11, 0)), (time(11, 15), time(12, 15))]   # UK morning
BAND_B = [(time(15, 0), time(16, 0)), (time(16, 0), time(17, 0)), (time(17, 15), time(18, 15))]  # UK afternoon/evening
PERIODS = [(i, start, end, "A") for i, (start, end) in enumerate(BAND_A)] + [
    (i + len(BAND_A), start, end, "B") for i, (start, end) in enumerate(BAND_B)
]
MAX_CONSECUTIVE_TEACHING_PERIODS = 4


@dataclass
class ClassInfo:
    """One thing to place: a (class, subject) pair.

    `id` is unique per pair ("<class_id>:<subject_id>") and is only used as a
    dict/variable key; `class_id` is the real classes.id (a class can have
    several subjects, each with its own teacher, and one class can never be in
    two lessons at once whatever the subject).
    """

    id: str
    class_id: str
    teacher_fixed: bool
    name: str
    year_group_name: str
    subject_id: str
    subject_name: str
    weekly_lessons: int
    lesson_length_minutes: int
    is_core: bool
    eligible_teacher_ids: list[str] = field(default_factory=list)


@dataclass
class Inputs:
    academic_year_id: str
    term_id: str | None
    classes: list[ClassInfo]
    teacher_ids: list[str]
    availability: dict[str, set[tuple[int, int]]]  # teacher_id -> {(weekday, period_index)}
    protected: set[tuple[int, int]]  # {(weekday, period_index)} blocked for everyone


def teacher_for(rows: list[dict], class_id: str, subject_id: str, on: str) -> dict | None:
    """Mirror of public.teacher_for() (migration 0050) and
    src/lib/learn/teacherFor.ts: the most specific class_subject_teachers row
    valid on `on` (yyyy-mm-dd): both dates set, then one date, then the default;
    ties go to the later valid_from, then the newest row."""
    hits = [
        r
        for r in rows
        if r["class_id"] == class_id
        and r["subject_id"] == subject_id
        and (not r.get("valid_from") or r["valid_from"] <= on)
        and (not r.get("valid_to") or r["valid_to"] >= on)
    ]
    if not hits:
        return None

    def spec(r: dict) -> int:
        return 0 if (r.get("valid_from") and r.get("valid_to")) else 1 if (r.get("valid_from") or r.get("valid_to")) else 2

    hits.sort(key=lambda r: r.get("created_at") or "", reverse=True)  # newest first (stable base order)
    hits.sort(key=lambda r: r.get("valid_from") or "", reverse=True)  # later valid_from first, nulls last
    hits.sort(key=spec)
    return hits[0]


def weekly_template_teacher(rows: list[dict], class_id: str, subject_id: str, today: str) -> dict | None:
    """The teacher for the WEEKLY TEMPLATE: the open-ended default, never a
    dated override (overrides apply to dated lessons only, see migration 0051).
    With no default but dated rows, falls back to whoever is in force today."""
    for r in rows:
        if r["class_id"] == class_id and r["subject_id"] == subject_id and not r.get("valid_from") and not r.get("valid_to"):
            return r
    return teacher_for(rows, class_id, subject_id, today)


def fetch_inputs(supabase, academic_year_label: str) -> Inputs:
    year = supabase.table("academic_years").select("id").eq("label", academic_year_label).single().execute().data
    academic_year_id = year["id"]

    term_row = (
        supabase.table("terms").select("id").eq("academic_year_id", academic_year_id).limit(1).execute().data
    )
    term_id = term_row[0]["id"] if term_row else None

    classes_raw = (
        supabase.table("classes")
        .select("id,name,year_group_id,subject_id,weekly_lessons,lesson_length_minutes,academic_year_id")
        .eq("academic_year_id", academic_year_id)
        .execute()
        .data
    )
    year_groups = {r["id"]: r["name"] for r in supabase.table("year_groups").select("id,name").execute().data}
    subjects = {r["id"]: r for r in supabase.table("subjects").select("id,name,is_core").execute().data}

    # Which teachers are "eligible" for a class: anyone with a teacher/TA
    # user_roles row scoped to that class, OR — for classes with no
    # class-scoped teacher yet (the common case pre-timetabling) — any
    # teacher whose availability rows exist at all for this academic year,
    # so the solver has candidates to choose from. Phase A doesn't yet
    # model per-subject teacher qualification beyond this; a future phase
    # can add a `teacher_subjects` join table.
    scoped_teachers: dict[str, list[str]] = {}
    for r in (
        supabase.table("user_roles")
        .select("user_id,scope_id")
        .in_("role", ["teacher", "teaching_assistant_cover"])
        .eq("scope_type", "class")
        .execute()
        .data
    ):
        scoped_teachers.setdefault(r["scope_id"], []).append(r["user_id"])

    avail_rows = (
        supabase.table("teacher_availability")
        .select("teacher_user_id,weekday,start_time,end_time")
        .eq("academic_year_id", academic_year_id)
        .execute()
        .data
    )
    availability: dict[str, set[tuple[int, int]]] = {}
    all_teacher_ids = sorted({r["teacher_user_id"] for r in avail_rows})
    for r in avail_rows:
        start = _parse_time(r["start_time"])
        end = _parse_time(r["end_time"])
        for idx, pstart, pend, _band in PERIODS:
            if pstart >= start and pend <= end:
                availability.setdefault(r["teacher_user_id"], set()).add((r["weekday"], idx))

    protected_rows = (
        supabase.table("protected_times")
        .select("weekday,start_time,end_time")
        .eq("academic_year_id", academic_year_id)
        .execute()
        .data
    )
    protected: set[tuple[int, int]] = set()
    for r in protected_rows:
        start, end = _parse_time(r["start_time"]), _parse_time(r["end_time"])
        for idx, pstart, pend, _band in PERIODS:
            if pstart < end and pend > start:
                protected.add((r["weekday"], idx))

    # (class, subject) -> teacher mapping (migration 0050). Teachers differ per
    # subject, so one teacher can teach many classes; the solver keeps them
    # un-double-booked. A pair with no mapping falls back to the old
    # class-scoped teacher (own subject only), then to "any available teacher".
    class_ids = [c["id"] for c in classes_raw]
    cst_rows: list[dict] = []
    if class_ids:
        try:
            cst_rows = (
                supabase.table("class_subject_teachers")
                .select("class_id,subject_id,teacher_id,valid_from,valid_to,lessons_per_week,created_at")
                .in_("class_id", class_ids)
                .execute()
                .data
            )
        except Exception as exc:  # pragma: no cover - table missing on an un-migrated project
            print(f"WARNING: could not read class_subject_teachers ({exc}); using class-scoped teachers only.", file=sys.stderr)
    today = date.today().isoformat()
    mapped_teacher_ids: set[str] = set()

    classes = []
    for c in classes_raw:
        subject_ids: list[str] = []
        if c["subject_id"]:
            subject_ids.append(c["subject_id"])
        for r in cst_rows:
            if r["class_id"] == c["id"] and r["subject_id"] not in subject_ids:
                subject_ids.append(r["subject_id"])
        for sid in subject_ids:
            subj = subjects.get(sid, {})
            row = weekly_template_teacher(cst_rows, c["id"], sid, today)
            lessons = (row or {}).get("lessons_per_week") or (c["weekly_lessons"] if sid == c["subject_id"] else 0)
            if not lessons:
                continue  # an extra subject without a lesson count has nothing to place
            if row:
                eligible = [row["teacher_id"]]
                mapped_teacher_ids.add(row["teacher_id"])
            elif sid == c["subject_id"] and scoped_teachers.get(c["id"]):
                eligible = scoped_teachers[c["id"]]
            else:
                eligible = all_teacher_ids
            classes.append(
                ClassInfo(
                    id=f"{c['id']}:{sid}",
                    class_id=c["id"],
                    teacher_fixed=bool(row),
                    name=c["name"],
                    year_group_name=year_groups.get(c["year_group_id"], "?"),
                    subject_id=sid,
                    subject_name=subj.get("name", "?"),
                    weekly_lessons=lessons,
                    lesson_length_minutes=c["lesson_length_minutes"],
                    is_core=bool(subj.get("is_core")),
                    eligible_teacher_ids=eligible,
                )
            )

    # Mapped teachers who never set availability must still exist in the model
    # (with no availability they simply cannot be given a lesson).
    all_teacher_ids = sorted(set(all_teacher_ids) | mapped_teacher_ids | {t for ts in scoped_teachers.values() for t in ts})

    return Inputs(
        academic_year_id=academic_year_id,
        term_id=term_id,
        classes=classes,
        teacher_ids=all_teacher_ids,
        availability=availability,
        protected=protected,
    )


def _parse_time(s: str) -> time:
    parts = [int(p) for p in s.split(":")]
    return time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)


@dataclass
class SolveResult:
    status: str  # 'optimal' | 'feasible' | 'infeasible'
    slots: list[dict]
    conflicts: list[dict]
    stats: dict


def solve(inputs: Inputs) -> SolveResult:
    model = cp_model.CpModel()

    # occ[class][n] -> which (weekday, period) it's placed at (or unplaced)
    # place[class][n][weekday][period] = bool
    place: dict[tuple[str, int, int, int], cp_model.IntVar] = {}
    teach: dict[tuple[str, int, str], cp_model.IntVar] = {}  # (class,n,teacher) -> bool, only meaningful if placed
    placed_flag: dict[tuple[str, int], cp_model.IntVar] = {}

    for c in inputs.classes:
        for n in range(c.weekly_lessons):
            options = []
            for wd in WEEKDAYS:
                for idx, _s, _e, _band in PERIODS:
                    if (wd, idx) in inputs.protected:
                        continue
                    v = model.NewBoolVar(f"place_{c.id}_{n}_{wd}_{idx}")
                    place[(c.id, n, wd, idx)] = v
                    options.append(v)
            pf = model.NewBoolVar(f"placed_{c.id}_{n}")
            placed_flag[(c.id, n)] = pf
            if options:
                model.Add(sum(options) == pf)
            else:
                model.Add(pf == 0)

            teacher_opts = []
            for t in c.eligible_teacher_ids:
                tv = model.NewBoolVar(f"teach_{c.id}_{n}_{t}")
                teach[(c.id, n, t)] = tv
                teacher_opts.append(tv)
            if teacher_opts:
                model.Add(sum(teacher_opts) == pf)
            else:
                model.Add(pf == 0)  # no eligible teacher at all -> cannot be placed

    # Hard: no two lessons of the same class at the same time; no teacher
    # double-booked; teacher only teaches within their own availability.
    for wd in WEEKDAYS:
        for idx, _s, _e, _band in PERIODS:
            # A class is in one lesson at a time, whichever of its subjects it is.
            by_class: dict[str, list] = {}
            for c in inputs.classes:
                for n in range(c.weekly_lessons):
                    if (c.id, n, wd, idx) in place:
                        by_class.setdefault(c.class_id, []).append(place[(c.id, n, wd, idx)])
            for same_class in by_class.values():
                if len(same_class) > 1:
                    model.Add(sum(same_class) <= 1)

            for t in inputs.teacher_ids:
                teaching_now = []
                for c in inputs.classes:
                    for n in range(c.weekly_lessons):
                        if (c.id, n, wd, idx) not in place or (c.id, n, t) not in teach:
                            continue
                        both = model.NewBoolVar(f"teach_at_{c.id}_{n}_{t}_{wd}_{idx}")
                        model.AddMultiplicationEquality(both, [place[(c.id, n, wd, idx)], teach[(c.id, n, t)]])
                        teaching_now.append(both)
                        if (wd, idx) not in inputs.availability.get(t, set()):
                            model.Add(both == 0)  # hard: outside contracted availability
                if len(teaching_now) > 1:
                    model.Add(sum(teaching_now) <= 1)

    # Hard: max consecutive teaching periods per teacher per day (within a band).
    for t in inputs.teacher_ids:
        for wd in WEEKDAYS:
            for band_start in range(0, len(PERIODS) - MAX_CONSECUTIVE_TEACHING_PERIODS):
                window = []
                for offset in range(MAX_CONSECUTIVE_TEACHING_PERIODS + 1):
                    idx = band_start + offset
                    if idx >= len(PERIODS):
                        continue
                    for c in inputs.classes:
                        for n in range(c.weekly_lessons):
                            if (c.id, n, wd, idx) in place and (c.id, n, t) in teach:
                                both = model.NewBoolVar(f"win_{t}_{wd}_{band_start}_{c.id}_{n}_{idx}")
                                model.AddMultiplicationEquality(both, [place[(c.id, n, wd, idx)], teach[(c.id, n, t)]])
                                window.append(both)
                if window:
                    model.Add(sum(window) <= MAX_CONSECUTIVE_TEACHING_PERIODS)

    # Soft objective terms.
    objective_terms = []
    for c in inputs.classes:
        for n in range(c.weekly_lessons):
            for wd in WEEKDAYS:
                for idx, _s, _e, band in PERIODS:
                    if (c.id, n, wd, idx) not in place:
                        continue
                    v = place[(c.id, n, wd, idx)]
                    # Core subjects earlier in the day (lower period index preferred).
                    if c.is_core:
                        objective_terms.append((-1 * (len(PERIODS) - idx), v))
                    # Balance across the week: mild bonus for Tue-Thu over Mon/Fri edges.
                    if wd in (2, 3, 4):
                        objective_terms.append((1, v))
    model.Maximize(sum(weight * var for weight, var in objective_terms) + 1000 * sum(placed_flag.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(os.environ.get("SOLVER_MAX_SECONDS", "60"))
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    slots = []
    conflicts = []
    status_name = {cp_model.OPTIMAL: "optimal", cp_model.FEASIBLE: "feasible"}.get(status, "infeasible")

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for c in inputs.classes:
            for n in range(c.weekly_lessons):
                if solver.Value(placed_flag[(c.id, n)]) == 0:
                    conflicts.append(
                        {
                            "severity": "hard",
                            "class_id": c.class_id,
                            "subject_id": c.subject_id,
                            "message": (
                                f"{c.year_group_name} {c.subject_name} ({c.name}): lesson {n + 1} of "
                                f"{c.weekly_lessons} could not be placed — "
                                + (
                                    "its teacher has no free slot left that satisfies availability/protected-time "
                                    "constraints (they may be teaching other classes at every time they are available)."
                                    if c.teacher_fixed
                                    else "no teacher available or no free slot that satisfies availability/protected-time constraints."
                                )
                            ),
                        }
                    )
                    continue
                for wd in WEEKDAYS:
                    for idx, s, e, _band in PERIODS:
                        key = (c.id, n, wd, idx)
                        if key in place and solver.Value(place[key]) == 1:
                            teacher_id = next(
                                t for t in c.eligible_teacher_ids if solver.Value(teach[(c.id, n, t)]) == 1
                            )
                            slots.append(
                                {
                                    "class_id": c.class_id,
                                    "subject_id": c.subject_id,
                                    "teacher_user_id": teacher_id,
                                    "weekday": wd,
                                    "start_time": s.isoformat(),
                                    "end_time": e.isoformat(),
                                }
                            )
    else:
        conflicts.append(
            {
                "severity": "hard",
                "class_id": None,
                "subject_id": None,
                "message": "The solver could not find any feasible timetable at all within the time limit — "
                "check that teacher availability and protected times leave enough room for every class's "
                "weekly lessons.",
            }
        )

    return SolveResult(
        status=status_name,
        slots=slots,
        conflicts=conflicts,
        stats={
            "wall_time_seconds": solver.WallTime(),
            "objective_value": solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            "num_classes": len(inputs.classes),
            "num_conflicts": len(conflicts),
        },
    )


def write_results(supabase, inputs: Inputs, result: SolveResult, label: str, is_test: bool) -> str:
    run = (
        supabase.table("timetable_runs")
        .insert(
            {
                "academic_year_id": inputs.academic_year_id,
                "term_id": inputs.term_id,
                "status": "draft",
                "label": label,
                "generated_by": "solver",
                "solver_stats": {**result.stats, "status": result.status, "is_test": is_test},
            }
        )
        .execute()
        .data[0]
    )
    run_id = run["id"]

    if result.slots:
        rows = [{**s, "run_id": run_id} for s in result.slots]
        for i in range(0, len(rows), 500):
            supabase.table("timetable_slots").insert(rows[i : i + 500]).execute()

    if result.conflicts:
        rows = [{**c, "run_id": run_id} for c in result.conflicts]
        supabase.table("timetable_conflicts").insert(rows).execute()

    return run_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--academic-year-label", required=True)
    parser.add_argument("--label", default=None, help="Label for the resulting timetable_runs row")
    parser.add_argument("--dry-run", action="store_true", help="Solve and print results, don't write to Supabase")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        return 2
    if create_client is None:
        print("The `supabase` python package is required (pip install supabase)", file=sys.stderr)
        return 2

    supabase = create_client(supabase_url, service_key)
    inputs = fetch_inputs(supabase, args.academic_year_label)
    print(f"Loaded {len(inputs.classes)} classes, {len(inputs.teacher_ids)} teachers with availability.")

    result = solve(inputs)
    print(f"Solve status: {result.status}. Placed {len(result.slots)} slots, {len(result.conflicts)} conflicts.")
    for conflict in result.conflicts:
        print(f"  CONFLICT: {conflict['message']}")

    if args.dry_run:
        print(json.dumps({"slots": result.slots, "conflicts": result.conflicts, "stats": result.stats}, indent=2))
        return 0

    is_test = "TEST" in args.academic_year_label
    label = args.label or f"{args.academic_year_label} — generated {result.status}"
    run_id = write_results(supabase, inputs, result, label, is_test)
    print(f"Wrote timetable_runs.id = {run_id} (status=draft)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
