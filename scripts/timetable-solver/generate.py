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

Reconciliation (added with migration 0056):
  * One teacher is never in two places: constraints are per (teacher, period)
    across ALL classes, plus other overlapping academic years' published runs.
  * Locked slots (timetable_slots.locked) of a draft flagged
    solver_stats.regenerate_pending are FIXED inputs; the solver fills that draft
    in place ("Re-run keeping locked lessons" in the UI).
  * After solving, verify() re-checks the result independently and reconcile()
    explains overbooked teachers / unfillable classes / unplaced lessons with
    concrete suggestions. Everything lands in timetable_conflicts (kind, details).
  * Tunables: TT_MAX_LESSONS_PER_DAY (6), TT_MAX_CONSECUTIVE (3), or the CLI flags.

Two "live-lesson time bands" (grep hit: src/sanity/schemaTypes/curriculumContent.ts
`timeBandsHeading`/`timeBandsBody` — this school teaches an international,
timezone-spread cohort across two daily live-lesson windows). This solver
encodes that as PERIODS below: a morning UK band and an
afternoon/evening-UK band, so the solver can place subjects into whichever
band suits the timezone soft-constraint weighting per class (see
`--timezone-hint` per class in the DB, read from classes.timezone_band if
present — Phase A keeps this simple: two fixed bands, weighted equally
unless a class overrides it).

School-day periods (migration 0066): the grid above is only the DEFAULT. The
head edits the real day in the `timetable_periods` table (admin UI: School
day). `fetch_inputs` reads the active rows with kind='lesson' and calls
`set_periods()`; each row has weekdays and `applies_to` (year-group audiences
such as 'all' or 'gcse' = Years 10-11) so GCSE classes can use extra periods.
Break / lunch / prayer / enrichment rows are not lesson periods and are never
used by the solver. With no rows (or no table) the default grid is used and
behaviour is identical to before.
"""
from __future__ import annotations

import argparse
import json
import os
import re
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
_DEFAULT_PERIODS = [(i, start, end, "A") for i, (start, end) in enumerate(BAND_A)] + [
    (i + len(BAND_A), start, end, "B") for i, (start, end) in enumerate(BAND_B)
]
PERIODS = list(_DEFAULT_PERIODS)
# Parallel to PERIODS: which weekdays / audiences each period is open to.
PERIOD_META: list[dict] = [{"weekdays": set(WEEKDAYS), "applies": {"all"}} for _ in PERIODS]
# Teacher load rules (hard). Overridable via env or CLI flags.
MAX_CONSECUTIVE_TEACHING_PERIODS = int(os.environ.get("TT_MAX_CONSECUTIVE", "3"))
MAX_TEACHER_LESSONS_PER_DAY = int(os.environ.get("TT_MAX_LESSONS_PER_DAY", "6"))
# Two periods count as "back to back" when the gap between them is at most this.
CONTIGUOUS_GAP_MINUTES = 15


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
class FixedSlot:
    """A locked / manually placed lesson that the solver must keep as is."""

    id: str | None
    class_id: str
    subject_id: str
    teacher_id: str
    weekday: int
    start_time: str
    end_time: str
    cells: set = field(default_factory=set)  # {(weekday, period_index)} it covers


@dataclass
class Inputs:
    academic_year_id: str
    term_id: str | None
    classes: list[ClassInfo]
    teacher_ids: list[str]
    availability: dict[str, set[tuple[int, int]]]  # teacher_id -> {(weekday, period_index)}
    protected: set[tuple[int, int]]  # {(weekday, period_index)} blocked for everyone
    teacher_names: dict = field(default_factory=dict)  # teacher_id -> full name
    availability_ranges: dict = field(default_factory=dict)  # teacher_id -> [(weekday, time, time)] raw
    protected_ranges: list = field(default_factory=list)  # [(weekday, time, time)] raw
    external_busy: dict = field(default_factory=dict)  # teacher_id -> {(weekday, idx): label} (other years' published runs)
    fixed: list = field(default_factory=list)  # list[FixedSlot]
    target_run_id: str | None = None  # draft run to fill in place (re-run keeping locked lessons)
    max_per_day: int = MAX_TEACHER_LESSONS_PER_DAY
    max_consecutive: int = MAX_CONSECUTIVE_TEACHING_PERIODS


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
    load_periods(supabase)  # the school day's lesson periods, before anything is mapped onto them
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

    teacher_names: dict[str, str] = {}
    avail_rows = (
        supabase.table("teacher_availability")
        .select("teacher_user_id,weekday,start_time,end_time")
        .eq("academic_year_id", academic_year_id)
        .execute()
        .data
    )
    availability: dict[str, set[tuple[int, int]]] = {}
    availability_ranges: dict[str, list] = {}
    all_teacher_ids = sorted({r["teacher_user_id"] for r in avail_rows})
    for r in avail_rows:
        start = _parse_time(r["start_time"])
        end = _parse_time(r["end_time"])
        availability_ranges.setdefault(r["teacher_user_id"], []).append((r["weekday"], start, end))
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
    protected_ranges: list = []
    for r in protected_rows:
        start, end = _parse_time(r["start_time"]), _parse_time(r["end_time"])
        protected_ranges.append((r["weekday"], start, end))
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

    # Teacher display names, for the reconciliation report.
    try:
        for r in supabase.table("profiles").select("id,full_name").in_("id", all_teacher_ids).execute().data:
            teacher_names[r["id"]] = r.get("full_name") or "Unnamed teacher"
    except Exception as exc:  # pragma: no cover
        print(f"WARNING: could not read teacher names ({exc}).", file=sys.stderr)

    inputs = Inputs(
        academic_year_id=academic_year_id,
        term_id=term_id,
        classes=classes,
        teacher_ids=all_teacher_ids,
        availability=availability,
        protected=protected,
        teacher_names=teacher_names,
        availability_ranges=availability_ranges,
        protected_ranges=protected_ranges,
    )
    inputs.external_busy = fetch_external_busy(supabase, academic_year_id)
    return inputs


def cells_for_range(weekday: int, start: time, end: time) -> set[tuple[int, int]]:
    """Every (weekday, period_index) whose period overlaps [start, end)."""
    return {(weekday, idx) for idx, ps, pe, _b in PERIODS if ps < end and pe > start}


def fetch_external_busy(supabase, academic_year_id: str) -> dict:
    """A teacher is one person across academic years. Published timetables of
    OTHER academic years whose dates overlap this one make the teacher busy at
    those times. Returns {teacher_id: {(weekday, period_index): label}}."""
    busy: dict[str, dict] = {}
    try:
        years = supabase.table("academic_years").select("id,label,starts_on,ends_on").execute().data
        me = next((y for y in years if y["id"] == academic_year_id), None)
        if not me:
            return busy
        others = {
            y["id"]: y["label"]
            for y in years
            if y["id"] != academic_year_id and y["starts_on"] <= me["ends_on"] and y["ends_on"] >= me["starts_on"]
        }
        if not others:
            return busy
        runs = (
            supabase.table("timetable_runs")
            .select("id,academic_year_id")
            .eq("status", "published")
            .in_("academic_year_id", list(others))
            .execute()
            .data
        )
        for run in runs:
            rows = (
                supabase.table("timetable_slots")
                .select("teacher_user_id,weekday,start_time,end_time")
                .eq("run_id", run["id"])
                .execute()
                .data
            )
            for r in rows:
                for cell in cells_for_range(r["weekday"], _parse_time(r["start_time"]), _parse_time(r["end_time"])):
                    busy.setdefault(r["teacher_user_id"], {})[cell] = f"the published {others[run['academic_year_id']]} timetable"
    except Exception as exc:  # pragma: no cover - best effort; never blocks generation
        print(f"WARNING: could not read other academic years' timetables ({exc}).", file=sys.stderr)
    return busy


def fetch_fixed(supabase, run_id: str) -> list[FixedSlot]:
    """Locked (manually placed) slots of a draft run, to be kept as fixed inputs."""
    try:
        rows = (
            supabase.table("timetable_slots")
            .select("id,class_id,subject_id,teacher_user_id,weekday,start_time,end_time")
            .eq("run_id", run_id)
            .eq("locked", True)
            .execute()
            .data
        )
    except Exception as exc:  # pragma: no cover - 0056 not applied
        print(f"WARNING: could not read locked slots ({exc}); is migration 0056 applied?", file=sys.stderr)
        return []
    out = []
    for r in rows:
        st, en = _parse_time(r["start_time"]), _parse_time(r["end_time"])
        out.append(
            FixedSlot(r["id"], r["class_id"], r["subject_id"], r["teacher_user_id"], r["weekday"], st.isoformat(), en.isoformat(), cells_for_range(r["weekday"], st, en))
        )
    return out


def find_pending_run(supabase, academic_year_id: str) -> str | None:
    """A draft the UI prepared with 'Re-run keeping locked lessons'
    (solver_stats.regenerate_pending = true). The solver fills it in place."""
    try:
        rows = (
            supabase.table("timetable_runs")
            .select("id,solver_stats")
            .eq("academic_year_id", academic_year_id)
            .eq("status", "draft")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
            .data
        )
    except Exception:  # pragma: no cover
        return None
    for r in rows:
        if (r.get("solver_stats") or {}).get("regenerate_pending"):
            return r["id"]
    return None


def _parse_time(s) -> time:
    if isinstance(s, time):
        return s
    parts = [int(p) for p in str(s).split(":")]
    return time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)


def _mins(t: time) -> int:
    return t.hour * 60 + t.minute


ALL_CELLS = [(wd, idx) for wd in WEEKDAYS for idx, _s, _e, _b in PERIODS]
# Contiguous stretches of the lesson day (periods at most CONTIGUOUS_GAP_MINUTES
# apart are one stretch): the default grid gives the two bands, 09:00-12:15 and 15:00-18:15.
SCHOOL_DAY_SPANS: list = []
# Index pairs of lesson periods whose times overlap (only with custom periods).
OVERLAPPING_PERIODS: list = []


def audience_tokens(year_group_name: str | None) -> set[str]:
    """Audience tokens a year group belongs to; mirrors audiencesOf() in
    src/lib/learn/timetable.ts. 'Year 10' -> {'all', 'year 10', 'gcse'}."""
    name = (year_group_name or "").strip().lower()
    out = {"all", name}
    m = re.search(r"(\d+)", name)
    if name.startswith("reception"):
        out.add("primary")
    elif m:
        n = int(m.group(1))
        if n <= 6:
            out.add("primary")
        elif n <= 9:
            out.add("ks3")
        elif n <= 11:
            out.add("gcse")
    return out


def period_open(idx: int, weekday: int, year_group_name: str | None) -> bool:
    """Can a class of this year group be taught in period idx on this weekday?"""
    meta = PERIOD_META[idx]
    if weekday not in meta["weekdays"]:
        return False
    return "all" in meta["applies"] or bool(meta["applies"] & audience_tokens(year_group_name))


def cells_for_year_group(year_group_name: str | None) -> list:
    return [cell for cell in ALL_CELLS if period_open(cell[1], cell[0], year_group_name)]


def _rebuild_derived() -> None:
    global ALL_CELLS, SCHOOL_DAY_SPANS, OVERLAPPING_PERIODS
    ALL_CELLS = [(wd, idx) for idx, _s, _e, _b in PERIODS for wd in WEEKDAYS if wd in PERIOD_META[idx]["weekdays"]]
    ALL_CELLS.sort()
    spans: list = []
    for _i, s, e, _b in sorted(PERIODS, key=lambda p: (p[1], p[2])):
        if spans and _mins(s) - _mins(spans[-1][1]) <= CONTIGUOUS_GAP_MINUTES:
            spans[-1] = (spans[-1][0], max(spans[-1][1], e))
        else:
            spans.append((s, e))
    SCHOOL_DAY_SPANS = spans
    OVERLAPPING_PERIODS = [
        (i, j)
        for i in range(len(PERIODS))
        for j in range(i + 1, len(PERIODS))
        if PERIODS[i][1] < PERIODS[j][2] and PERIODS[j][1] < PERIODS[i][2]
        and PERIOD_META[i]["weekdays"] & PERIOD_META[j]["weekdays"]
    ]


def set_periods(rows: list[dict]) -> None:
    """Install the lesson periods from timetable_periods rows (kind='lesson',
    active). No usable rows -> the built-in default grid."""
    global PERIODS, PERIOD_META
    parsed = []
    for r in rows:
        if r.get("kind", "lesson") != "lesson" or r.get("active") is False:
            continue
        start, end = _parse_time(r["start_time"]), _parse_time(r["end_time"])
        if end <= start:
            continue
        days = {int(d) for d in (r.get("weekdays") or WEEKDAYS) if int(d) in WEEKDAYS}
        if not days:
            continue
        applies = {str(a).strip().lower() for a in (r.get("applies_to") or ["all"])} or {"all"}
        parsed.append((start, end, days, applies))
    if not parsed:
        PERIODS = list(_DEFAULT_PERIODS)
        PERIOD_META = [{"weekdays": set(WEEKDAYS), "applies": {"all"}} for _ in PERIODS]
    else:
        parsed.sort(key=lambda p: (p[0], p[1]))
        PERIODS = [(i, st, en, "A" if st < time(14, 0) else "B") for i, (st, en, _d, _a) in enumerate(parsed)]
        PERIOD_META = [{"weekdays": d, "applies": a} for _st, _en, d, a in parsed]
    _rebuild_derived()


def load_periods(supabase) -> None:
    """Read the school-day lesson periods from the DB (migration 0066); fall back to the default grid."""
    try:
        rows = (
            supabase.table("timetable_periods")
            .select("kind,start_time,end_time,weekdays,applies_to,active")
            .eq("kind", "lesson")
            .eq("active", True)
            .execute()
            .data
        )
    except Exception as exc:  # pragma: no cover - table missing on an un-migrated project
        print(f"WARNING: could not read timetable_periods ({exc}); using the default period grid.", file=sys.stderr)
        rows = []
    set_periods(rows or [])
    if rows:
        print(f"Using {len(PERIODS)} lesson periods from timetable_periods.")
        if OVERLAPPING_PERIODS:
            print(f"WARNING: {len(OVERLAPPING_PERIODS)} pair(s) of lesson periods overlap; a teacher or class is never placed in both.", file=sys.stderr)


_rebuild_derived()


def period_chains() -> list[list[int]]:
    """Runs of period indexes that are back to back (gap <= CONTIGUOUS_GAP_MINUTES)."""
    chains: list[list[int]] = [[0]]
    for i in range(1, len(PERIODS)):
        gap = _mins(PERIODS[i][1]) - _mins(PERIODS[i - 1][2])
        if gap <= CONTIGUOUS_GAP_MINUTES:
            chains[-1].append(i)
        else:
            chains.append([i])
    return chains


def _weekly_day_cap(weekly: int) -> int:
    """Most lessons of one subject allowed on one day: 1 unless the subject has
    more lessons than there are days."""
    return max(1, -(-weekly // len(WEEKDAYS)))


@dataclass
class SolveResult:
    status: str  # 'optimal' | 'feasible' | 'infeasible'
    slots: list[dict]  # NEW slots only (locked/fixed slots already exist in the target run)
    conflicts: list[dict]
    stats: dict


# ── lookups shared by the model, the self-check and the reconciliation ──────
def _pair_label(c: ClassInfo) -> str:
    return f"{c.name} {c.subject_name}"


def _tname(inputs: Inputs, t: str | None) -> str:
    return inputs.teacher_names.get(t or "", "A teacher")


def _busy_maps(inputs: Inputs) -> tuple[dict, dict]:
    """(teacher_busy, class_busy): cells already taken by locked lessons (and, for
    teachers, by other academic years' published timetables). {id: {cell: label}}"""
    labels = {(c.class_id, c.subject_id): _pair_label(c) for c in inputs.classes}
    cnames = {c.class_id: c.name for c in inputs.classes}
    tb: dict[str, dict] = {t: dict(cells) for t, cells in inputs.external_busy.items()}
    cb: dict[str, dict] = {}
    for f in inputs.fixed:
        label = labels.get((f.class_id, f.subject_id)) or f"{cnames.get(f.class_id, 'a class')} (locked lesson)"
        for cell in f.cells:
            tb.setdefault(f.teacher_id, {})[cell] = label
            cb.setdefault(f.class_id, {})[cell] = label
    return tb, cb


def _free_for(inputs: Inputs, tb: dict, t: str, cell: tuple[int, int]) -> bool:
    return cell in inputs.availability.get(t, set()) and cell not in inputs.protected and cell not in tb.get(t, {})


# ── the model ───────────────────────────────────────────────────────────────
def solve(inputs: Inputs) -> SolveResult:
    """Place the lessons that are not already locked.

    Variables: place[pair, weekday, period] (a (class,subject) pair has at most one
    lesson in a given period, so no per-lesson index and no symmetry), plus, for
    pairs without one fixed teacher, teach[pair, teacher] (one teacher per pair
    for the whole week, matching teacher-per-(class,subject)).

    HARD: class in <=1 lesson per period (all its subjects); teacher in <=1 lesson
    per period ACROSS ALL CLASSES (and across overlapping academic years' published
    timetables, and locked lessons); teacher availability; protected times; only
    periods inside the school day exist; teacher <= max lessons/day; teacher
    <= max consecutive periods; a subject at most ceil(weekly/5) times per day;
    pair total <= weekly lessons; locked lessons are constants.
    """
    model = cp_model.CpModel()
    tb, cb = _busy_maps(inputs)
    locked_cnt: dict[tuple, int] = {}
    locked_day: dict[tuple, int] = {}
    for f in inputs.fixed:
        locked_cnt[(f.class_id, f.subject_id)] = locked_cnt.get((f.class_id, f.subject_id), 0) + 1
        locked_day[(f.class_id, f.subject_id, f.weekday)] = locked_day.get((f.class_id, f.subject_id, f.weekday), 0) + 1

    place: dict[tuple, cp_model.IntVar] = {}  # (pair_id, cell) -> var
    teach: dict[tuple, cp_model.IntVar] = {}  # (pair_id, teacher) -> var
    by_class: dict[tuple, list] = {}  # (class_id, cell) -> [place vars]
    tl: dict[tuple, list] = {}  # (teacher, cell) -> literals meaning "teacher teaches here"
    pairs = []

    for c in inputs.classes:
        remaining = c.weekly_lessons - locked_cnt.get((c.class_id, c.subject_id), 0)
        if remaining <= 0:
            continue
        pairs.append((c, remaining))
        elig = list(dict.fromkeys(c.eligible_teacher_ids))
        flex = len(elig) != 1
        cell_teachers: dict[tuple, list] = {}
        for cell in ALL_CELLS:
            if cell in inputs.protected or cell in cb.get(c.class_id, {}) or not period_open(cell[1], cell[0], c.year_group_name):
                continue
            ts = [t for t in elig if _free_for(inputs, tb, t, cell)]
            if not ts:
                continue
            v = model.NewBoolVar(f"place_{c.id}_{cell[0]}_{cell[1]}")
            place[(c.id, cell)] = v
            cell_teachers[cell] = ts
            by_class.setdefault((c.class_id, cell), []).append(v)
            if not flex:
                tl.setdefault((elig[0], cell), []).append(v)
        mine = [place[(c.id, cell)] for cell in ALL_CELLS if (c.id, cell) in place]
        if not mine:
            continue
        model.Add(sum(mine) <= remaining)
        cap = _weekly_day_cap(c.weekly_lessons)
        for wd in WEEKDAYS:
            day = [place[(c.id, (wd, idx))] for idx, *_ in PERIODS if (c.id, (wd, idx)) in place]
            if day:
                model.Add(sum(day) <= max(0, cap - locked_day.get((c.class_id, c.subject_id, wd), 0)))
        if flex:
            for t in elig:
                teach[(c.id, t)] = model.NewBoolVar(f"teach_{c.id}_{t}")
            model.Add(sum(teach[(c.id, t)] for t in elig) <= 1)
            for cell, ts in cell_teachers.items():
                v = place[(c.id, cell)]
                model.Add(sum(teach[(c.id, t)] for t in ts) >= v)  # a teacher who is free here must be the one chosen
                for t in ts:
                    b = model.NewBoolVar(f"at_{c.id}_{t}_{cell[0]}_{cell[1]}")
                    model.Add(b >= v + teach[(c.id, t)] - 1)
                    tl.setdefault((t, cell), []).append(b)

    for lits in by_class.values():
        if len(lits) > 1:
            model.Add(sum(lits) <= 1)  # a class is in one lesson at a time, whatever the subject
    # Custom lesson periods can overlap in time: nobody is in two overlapping periods at once.
    if OVERLAPPING_PERIODS:
        class_keys = {k[0] for k in by_class}
        teacher_keys = {k[0] for k in tl}
        for i, j in OVERLAPPING_PERIODS:
            for wd in WEEKDAYS:
                for src, keys in ((by_class, class_keys), (tl, teacher_keys)):
                    for key in keys:
                        lits = src.get((key, (wd, i)), []) + src.get((key, (wd, j)), [])
                        if len(lits) > 1:
                            model.Add(sum(lits) <= 1)
    for lits in tl.values():
        if len(lits) > 1:
            model.Add(sum(lits) <= 1)  # a teacher is in one place at a time, whichever class

    chains = period_chains()
    k = inputs.max_consecutive
    teachers_in_model = sorted({t for t, _cell in tl})
    for t in teachers_in_model:
        busy_cells = tb.get(t, {})
        for wd in WEEKDAYS:
            day_lits = [lit for idx, *_ in PERIODS for lit in tl.get((t, (wd, idx)), [])]
            if not day_lits:
                continue
            const = sum(1 for idx, *_ in PERIODS if (wd, idx) in busy_cells)
            if len(day_lits) + const > inputs.max_per_day:
                model.Add(sum(day_lits) <= max(0, inputs.max_per_day - const))
            for chain in chains:
                for i in range(0, len(chain) - k):
                    window = chain[i : i + k + 1]
                    lits = [lit for idx in window for lit in tl.get((t, (wd, idx)), [])]
                    wconst = sum(1 for idx in window if (wd, idx) in busy_cells)
                    if lits and len(lits) + wconst > k:
                        model.Add(sum(lits) <= max(0, k - wconst))

    objective = []
    core = {c.id: c.is_core for c, _rem in pairs}
    for (pid, cell), v in place.items():
        wd, idx = cell
        objective.append((1000, v))  # placing a lesson dominates every preference
        if core[pid]:
            objective.append((-(len(PERIODS) - idx), v))  # core subjects earlier in the day
        if wd in (2, 3, 4):
            objective.append((1, v))  # mild preference for Tue-Thu
    if objective:
        model.Maximize(sum(w * v for w, v in objective))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(os.environ.get("SOLVER_MAX_SECONDS", "60"))
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model) if place else cp_model.OPTIMAL
    ok = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    status_name = {cp_model.OPTIMAL: "optimal", cp_model.FEASIBLE: "feasible"}.get(status, "infeasible")

    slots: list[dict] = []
    if ok:
        for c, _rem in pairs:
            elig = list(dict.fromkeys(c.eligible_teacher_ids))
            chosen = elig[0] if len(elig) == 1 else next((t for t in elig if (c.id, t) in teach and solver.Value(teach[(c.id, t)]) == 1), None)
            for (cid, cell), v in place.items():
                if cid != c.id or solver.Value(v) != 1:
                    continue
                wd, idx = cell
                _i, s, e, _b = PERIODS[idx]
                slots.append(
                    {
                        "class_id": c.class_id,
                        "subject_id": c.subject_id,
                        "teacher_user_id": chosen,
                        "weekday": wd,
                        "start_time": s.isoformat(),
                        "end_time": e.isoformat(),
                    }
                )
    return SolveResult(
        status=status_name,
        slots=[s for s in slots if s["teacher_user_id"]],
        conflicts=[],
        stats={
            "wall_time_seconds": solver.WallTime() if place else 0,
            "objective_value": solver.ObjectiveValue() if ok and place else None,
            "num_classes": len(inputs.classes),
            "num_locked_kept": len(inputs.fixed),
            "max_lessons_per_day": inputs.max_per_day,
            "max_consecutive": inputs.max_consecutive,
        },
    )


# ── independent self-check ──────────────────────────────────────────────────
def verify(inputs: Inputs, all_slots: list[dict]) -> list[dict]:
    """Re-verify finished slots from first principles (real start/end times, raw
    availability and protected ranges; NOT the solver's cell maps). Returns
    conflict rows; clashes are always hard. Locked (manual) lessons that break a
    softer rule are reported as soft so they can still be published knowingly."""
    out: list[dict] = []
    labels = {(c.class_id, c.subject_id): _pair_label(c) for c in inputs.classes}
    weekly = {(c.class_id, c.subject_id): c.weekly_lessons for c in inputs.classes}
    cname = {c.class_id: c.name for c in inputs.classes}

    def lab(s: dict) -> str:
        return labels.get((s["class_id"], s["subject_id"])) or f"{cname.get(s['class_id'], 'A class')} lesson"

    def when(s: dict) -> str:
        return f"{DAY_NAMES.get(s['weekday'], s['weekday'])} {_parse_time(s['start_time']).strftime('%H:%M')}"

    def add(sev: str, kind: str, s: dict | None, msg: str, **details):
        out.append(
            {
                "severity": sev,
                "kind": kind,
                "class_id": s["class_id"] if s else None,
                "subject_id": s["subject_id"] if s else None,
                "teacher_user_id": s["teacher_user_id"] if s else None,
                "message": f"Self-check: {msg}",
                "details": details or None,
            }
        )

    P = [(s, s["weekday"], _parse_time(s["start_time"]), _parse_time(s["end_time"])) for s in all_slots]
    for i in range(len(P)):
        a, wa, sa, ea = P[i]
        for j in range(i + 1, len(P)):
            b, wb, sb, eb = P[j]
            if wa != wb or not (sa < eb and sb < ea):
                continue
            if a["teacher_user_id"] == b["teacher_user_id"]:
                add("hard", "teacher_clash", a, f"{_tname(inputs, a['teacher_user_id'])} is double-booked on {when(a)}: {lab(a)} and {lab(b)} overlap.", other_class_id=b["class_id"])
            if a["class_id"] == b["class_id"]:
                add("hard", "class_clash", a, f"{cname.get(a['class_id'], 'A class')} has two lessons at once on {when(a)}: {lab(a)} and {lab(b)}.")

    for s, wd, st, en in P:
        t = s["teacher_user_id"]
        sev = "soft" if s.get("_locked") else "hard"
        who = _tname(inputs, t)
        if wd not in WEEKDAYS or not any(a <= st and en <= b for a, b in SCHOOL_DAY_SPANS):
            add(sev, "outside_school_day", s, f"{lab(s)} on {when(s)} is outside the school day.")
        ranges = inputs.availability_ranges.get(t, [])
        if not any(w == wd and rs <= st and en <= re for w, rs, re in ranges):
            add(sev, "teacher_unavailable", s, f"{who} is not available for {lab(s)} on {when(s)}.")
        if any(w == wd and ps < en and st < pe for w, ps, pe in inputs.protected_ranges):
            add(sev, "protected_time", s, f"{lab(s)} on {when(s)} falls in a protected time.")
        ext = inputs.external_busy.get(t, {})
        hit = next((ext[cell] for cell in cells_for_range(wd, st, en) if cell in ext), None)
        if hit:
            add("hard", "teacher_clash", s, f"{who} is already teaching at {when(s)} in {hit}.")

    # per teacher per day: load and consecutive periods
    by_td: dict[tuple, list] = {}
    for s, wd, st, en in P:
        by_td.setdefault((s["teacher_user_id"], wd), []).append((s, st, en))
    chains = period_chains()
    for (t, wd), items in by_td.items():
        sev = "soft" if all(x[0].get("_locked") for x in items) else "hard"
        if len(items) > inputs.max_per_day:
            add(sev, "teacher_day_overload", items[0][0], f"{_tname(inputs, t)} has {len(items)} lessons on {DAY_NAMES.get(wd, wd)} (maximum {inputs.max_per_day}).", count=len(items))
        idxs = {idx for _s, st, en in items for (_w, idx) in cells_for_range(wd, st, en)}
        for chain in chains:
            run = 0
            for idx in chain:
                run = run + 1 if idx in idxs else 0
                if run == inputs.max_consecutive + 1:
                    add(sev, "teacher_consecutive", items[0][0], f"{_tname(inputs, t)} teaches more than {inputs.max_consecutive} periods in a row on {DAY_NAMES.get(wd, wd)}.")
                    break

    # subject spread and totals
    by_pair: dict[tuple, list] = {}
    for s, wd, st, en in P:
        by_pair.setdefault((s["class_id"], s["subject_id"]), []).append(s)
    for key, items in by_pair.items():
        w = weekly.get(key)
        if w is None:
            continue
        if len(items) > w:
            add("hard", "too_many_lessons", items[0], f"{lab(items[0])} has {len(items)} lessons but only {w} are needed.")
        cap = _weekly_day_cap(w)
        for wd in WEEKDAYS:
            day = [x for x in items if x["weekday"] == wd]
            if len(day) > cap:
                sev = "soft" if all(x.get("_locked") for x in day) else "hard"
                add(sev, "subject_repeated_day", day[0], f"{lab(day[0])} is scheduled {len(day)} times on {DAY_NAMES.get(wd, wd)} (maximum {cap}).")
    return out


DAY_NAMES = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 0: "Sunday"}


# ── reconciliation report ───────────────────────────────────────────────────
def _max_matching(options: list[list]) -> list[int | None]:
    """Bipartite matching (Kuhn). options[i] = candidate cells of lesson i;
    returns the matched cell per lesson (None = cannot be placed)."""
    owner: dict = {}

    def try_lesson(i: int, seen: set) -> bool:
        for cell in options[i]:
            if cell in seen:
                continue
            seen.add(cell)
            if cell not in owner or try_lesson(owner[cell], seen):
                owner[cell] = i
                return True
        return False

    for i in range(len(options)):
        try_lesson(i, set())
    result: list = [None] * len(options)
    for cell, i in owner.items():
        result[i] = cell
    return result


def _occupancy(inputs: Inputs, all_slots: list[dict]) -> tuple[dict, dict]:
    labels = {(c.class_id, c.subject_id): _pair_label(c) for c in inputs.classes}
    cname = {c.class_id: c.name for c in inputs.classes}
    t_occ: dict[tuple, str] = {}
    c_occ: dict[tuple, str] = {}
    for s in all_slots:
        label = labels.get((s["class_id"], s["subject_id"])) or cname.get(s["class_id"], "another class")
        for cell in cells_for_range(s["weekday"], _parse_time(s["start_time"]), _parse_time(s["end_time"])):
            t_occ[(s["teacher_user_id"], cell)] = label
            c_occ[(s["class_id"], cell)] = label
    return t_occ, c_occ


def reconcile(inputs: Inputs, all_slots: list[dict]) -> list[dict]:
    """Plain-language reconciliation: why things collide and what to change."""
    out: list[dict] = []
    tb, cb = _busy_maps(inputs)
    classes = inputs.classes
    max_day = inputs.max_per_day

    def row(sev, kind, msg, class_id=None, subject_id=None, teacher_id=None, **details):
        out.append({"severity": sev, "kind": kind, "class_id": class_id, "subject_id": subject_id, "teacher_user_id": teacher_id, "message": msg, "details": details or None})

    # 1. Teachers overbooked: demand (all their classes) vs periods they can be given.
    demand: dict[str, list] = {}
    for c in classes:
        elig = list(dict.fromkeys(c.eligible_teacher_ids))
        if len(elig) == 1 and c.weekly_lessons > 0:
            demand.setdefault(elig[0], []).append(c)
    for t, cs in sorted(demand.items(), key=lambda kv: _tname(inputs, kv[0])):
        total = sum(c.weekly_lessons for c in cs)
        usable = [cell for cell in ALL_CELLS if cell in inputs.availability.get(t, set()) and cell not in inputs.protected and cell not in inputs.external_busy.get(t, {})]
        capacity = sum(min(sum(1 for cell in usable if cell[0] == wd), max_day) for wd in WEEKDAYS)
        name = _tname(inputs, t)
        if total > capacity:
            top = sorted(cs, key=lambda c: -c.weekly_lessons)
            lead = top[0]
            if not usable:
                reason = f"{name} teaches {total} lessons/week but has set no availability for this year. Ask them to add availability, or assign another teacher for {_pair_label(lead)}."
            else:
                reason = (
                    f"{name} teaches {total} lessons/week but is available for {len(usable)} periods (at most {capacity} lessons with the {max_day}-a-day limit). "
                    f"Reduce their load by {total - capacity}, add availability, or assign another teacher for {_pair_label(lead)} ({lead.weekly_lessons} lessons/week)"
                    + (f" or {_pair_label(top[1])} ({top[1].weekly_lessons})." if len(top) > 1 else ".")
                )
            row("hard", "teacher_overbooked", reason, teacher_id=t, demand=total, capacity=capacity, available_periods=len(usable), contributors=[{"class": c.name, "subject": c.subject_name, "lessons": c.weekly_lessons} for c in top])

    # 2. Classes that can never be filled, whatever else is going on.
    by_cls: dict[str, list] = {}
    for c in classes:
        by_cls.setdefault(c.class_id, []).append(c)
    for cid, cs in by_cls.items():
        need = sum(c.weekly_lessons for c in cs)
        free_cells = [cell for cell in cells_for_year_group(cs[0].year_group_name) if cell not in inputs.protected]
        cname = cs[0].name
        if need > len(free_cells):
            row("hard", "class_overfull", f"{cname} needs {need} lessons/week but the school week only has {len(free_cells)} usable periods. Reduce lessons for {cname} by {need - len(free_cells)}.", class_id=cid, need=need, periods=len(free_cells))
            continue
        lessons, owners = [], []
        for c in cs:
            elig = list(dict.fromkeys(c.eligible_teacher_ids))
            have = sum(1 for f in inputs.fixed if f.class_id == cid and f.subject_id == c.subject_id)
            opts = [cell for cell in free_cells if cell not in cb.get(cid, {}) and any(_free_for(inputs, tb, t, cell) for t in elig)]
            for _ in range(max(0, c.weekly_lessons - have)):
                lessons.append(opts)
                owners.append(c)
        matched = _max_matching(lessons)
        short: dict[str, list] = {}
        for res, c in zip(matched, owners):
            if res is None:
                short.setdefault(c.id, []).append(c)
        if short:
            parts = []
            for items in short.values():
                c = items[0]
                elig = list(dict.fromkeys(c.eligible_teacher_ids))
                who = _tname(inputs, elig[0]) if len(elig) == 1 else "any teacher"
                parts.append(f"{_pair_label(c)} ({len(items)} lesson{'s' if len(items) > 1 else ''}, {who})")
            row(
                "hard", "class_unfillable",
                f"{cname} cannot be completed even before other classes are considered: {sum(len(v) for v in short.values())} lesson(s) have no common free period between the class and its teachers: "
                + "; ".join(parts) + ". Widen those teachers' availability, or assign another teacher for the subject.",
                class_id=cid, short=[{"subject": v[0].subject_name, "lessons": len(v)} for v in short.values()],
            )

    # 3. Lessons still missing from the finished timetable, with the collisions behind them.
    t_occ, c_occ = _occupancy(inputs, all_slots)
    placed: dict[tuple, int] = {}
    for s in all_slots:
        placed[(s["class_id"], s["subject_id"])] = placed.get((s["class_id"], s["subject_id"]), 0) + 1
    total_missing = 0
    for c in classes:
        missing = c.weekly_lessons - placed.get((c.class_id, c.subject_id), 0)
        if missing <= 0:
            continue
        total_missing += missing
        elig = list(dict.fromkeys(c.eligible_teacher_ids))
        reasons = {"protected": 0, "class_busy": 0, "teacher_busy": 0, "unavailable": 0, "other": 0}
        busy_with: dict[str, int] = {}
        for cell in cells_for_year_group(c.year_group_name):
            if cell in inputs.protected:
                reasons["protected"] += 1
            elif (c.class_id, cell) in c_occ:
                reasons["class_busy"] += 1
            else:
                states = []
                for t in elig:
                    if cell in inputs.external_busy.get(t, {}):
                        states.append(("busy", inputs.external_busy[t][cell]))
                    elif cell not in inputs.availability.get(t, set()):
                        states.append(("unavailable", ""))
                    elif (t, cell) in t_occ:
                        states.append(("busy", t_occ[(t, cell)]))
                    else:
                        states.append(("free", ""))
                if any(s == "free" for s, _ in states):
                    reasons["other"] += 1
                elif any(s == "busy" for s, _ in states):
                    reasons["teacher_busy"] += 1
                    for s, label in states:
                        if s == "busy":
                            busy_with[label] = busy_with.get(label, 0) + 1
                else:
                    reasons["unavailable"] += 1
        label = _pair_label(c)
        got = c.weekly_lessons - missing
        if not elig:
            why = "No teacher is assigned and no teacher has availability. Choose a teacher in the class teacher matrix and ask them to set availability."
        else:
            who = _tname(inputs, elig[0]) if len(elig) == 1 else "the available teachers"
            usable = sum(1 for cell in cells_for_year_group(c.year_group_name) if cell not in inputs.protected and any(cell in inputs.availability.get(t, set()) for t in elig))
            top = ", ".join(f"{k} ({v})" for k, v in sorted(busy_with.items(), key=lambda kv: -kv[1])[:3])
            bits = [f"{who} is available for {usable} periods"]
            if reasons["teacher_busy"]:
                bits.append(f"{reasons['teacher_busy']} period(s) are taken by other lessons" + (f" ({top})" if top else ""))
            if reasons["class_busy"]:
                bits.append(f"{reasons['class_busy']} period(s) are already used by {c.name}'s other subjects")
            if reasons["other"]:
                bits.append(f"{reasons['other']} free period(s) were ruled out by the per-day limits (max {max_day} lessons a day, max {inputs.max_consecutive} in a row, one lesson of a subject a day)")
            # Judge by the periods the teacher could actually work; "unavailable"
            # only matters when there are none.
            main = max(("teacher_busy", "class_busy", "other"), key=lambda k: reasons[k])
            if reasons[main] == 0:
                main = "unavailable"
            tip = {
                "teacher_busy": f"Suggestion: reduce {who}'s other lessons, add availability for {who}, or assign another teacher for {label}.",
                "class_busy": f"Suggestion: {c.name} is already full at the times {who} is free; move another subject or reduce lessons for {c.name}.",
                "unavailable": f"Suggestion: {who} has no availability when {c.name} is free; add availability or assign another teacher for {label}.",
                "other": "Suggestion: raise the per-day limit or spread the week differently.",
            }[main]
            why = "; ".join(bits) + ". " + tip
        row(
            "hard", "unplaced",
            f"{label}: {got} of {c.weekly_lessons} weekly lessons placed ({missing} missing). {why}",
            class_id=c.class_id, subject_id=c.subject_id, teacher_id=elig[0] if len(elig) == 1 else None,
            missing=missing, needed=c.weekly_lessons, reasons=reasons,
        )

    if out or inputs.fixed:
        n_over = sum(1 for r in out if r["kind"] == "teacher_overbooked")
        row(
            "soft", "summary",
            f"Reconciliation: {total_missing} lesson(s) could not be placed; {n_over} teacher(s) overbooked; "
            f"{len(inputs.fixed)} locked lesson(s) kept as fixed. Fix the items above, then use \"Re-run keeping locked lessons\".",
            missing=total_missing, overbooked=n_over, locked_kept=len(inputs.fixed),
        )
    return out


def generate(inputs: Inputs) -> SolveResult:
    """Solve, then independently re-verify and reconcile. Never raises on an
    unsolvable input: the problems come back as conflict rows instead."""
    result = solve(inputs)
    locked = [
        {"class_id": f.class_id, "subject_id": f.subject_id, "teacher_user_id": f.teacher_id, "weekday": f.weekday, "start_time": f.start_time, "end_time": f.end_time, "_locked": True}
        for f in inputs.fixed
    ]
    all_slots = locked + result.slots
    violations = verify(inputs, all_slots)
    report = reconcile(inputs, all_slots)
    if result.status == "infeasible" and inputs.classes:
        report.insert(0, {"severity": "hard", "kind": "infeasible", "class_id": None, "subject_id": None, "teacher_user_id": None,
                          "message": "The solver found no feasible timetable within the time limit (the locked lessons may contradict each other). See the items below for the collisions.", "details": None})
    result.conflicts = report + violations
    result.stats["num_conflicts"] = len(result.conflicts)
    result.stats["self_check_violations"] = len(violations)
    result.stats["self_check_hard"] = sum(1 for v in violations if v["severity"] == "hard")
    return result


# ── persistence ─────────────────────────────────────────────────────────────
def _conflict_rows(run_id: str, conflicts: list[dict], extended: bool) -> list[dict]:
    rows = []
    for c in conflicts:
        r = {k: v for k, v in c.items() if extended or k not in ("kind", "details")}
        if not extended and c.get("kind"):
            r["message"] = f"[{c['kind']}] {r['message']}"
        rows.append({**r, "run_id": run_id})
    return rows


def write_results(supabase, inputs: Inputs, result: SolveResult, label: str, is_test: bool) -> str:
    stats = {**result.stats, "status": result.status, "is_test": is_test, "regenerate_pending": False}
    if inputs.target_run_id:
        run_id = inputs.target_run_id
        old = supabase.table("timetable_runs").select("solver_stats").eq("id", run_id).single().execute().data or {}
        supabase.table("timetable_runs").update({"solver_stats": {**(old.get("solver_stats") or {}), **stats}, "generated_by": "solver"}).eq("id", run_id).execute()
    else:
        run_id = (
            supabase.table("timetable_runs")
            .insert({"academic_year_id": inputs.academic_year_id, "term_id": inputs.term_id, "status": "draft", "label": label, "generated_by": "solver", "solver_stats": stats})
            .execute()
            .data[0]["id"]
        )

    if result.slots:
        rows = [{**s, "run_id": run_id} for s in result.slots]
        for i in range(0, len(rows), 500):
            supabase.table("timetable_slots").insert(rows[i : i + 500]).execute()

    if result.conflicts:
        try:
            supabase.table("timetable_conflicts").insert(_conflict_rows(run_id, result.conflicts, True)).execute()
        except Exception as exc:  # migration 0056 (kind/details columns) not applied yet
            print(f"WARNING: writing conflicts with kind/details failed ({exc}); retrying without.", file=sys.stderr)
            supabase.table("timetable_conflicts").insert(_conflict_rows(run_id, result.conflicts, False)).execute()
    return run_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--academic-year-label", required=True)
    parser.add_argument("--label", default=None, help="Label for the resulting timetable_runs row")
    parser.add_argument("--dry-run", action="store_true", help="Solve and print results, don't write to Supabase")
    parser.add_argument("--keep-locked-from", default=None, help="Draft run id whose locked slots are kept as fixed; that run is filled in place")
    parser.add_argument("--max-lessons-per-day", type=int, default=MAX_TEACHER_LESSONS_PER_DAY)
    parser.add_argument("--max-consecutive", type=int, default=MAX_CONSECUTIVE_TEACHING_PERIODS)
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
    inputs.max_per_day = args.max_lessons_per_day
    inputs.max_consecutive = args.max_consecutive
    # "Re-run keeping locked lessons": the UI prepares a draft holding the locked
    # slots and flags it regenerate_pending; fill that draft in place.
    inputs.target_run_id = args.keep_locked_from or find_pending_run(supabase, inputs.academic_year_id)
    if inputs.target_run_id:
        inputs.fixed = fetch_fixed(supabase, inputs.target_run_id)
        print(f"Keeping {len(inputs.fixed)} locked lesson(s) from run {inputs.target_run_id}.")
    print(f"Loaded {len(inputs.classes)} class-subject pairs, {len(inputs.teacher_ids)} teachers.")

    result = generate(inputs)
    print(f"Solve status: {result.status}. Placed {len(result.slots)} new slots, {len(result.conflicts)} conflict rows.")
    for conflict in result.conflicts:
        print(f"  [{conflict['severity']}] {conflict['message']}")

    if args.dry_run:
        print(json.dumps({"slots": result.slots, "conflicts": result.conflicts, "stats": result.stats}, indent=2, default=str))
        return 0

    is_test = "TEST" in args.academic_year_label
    label = args.label or f"{args.academic_year_label} — generated {result.status}"
    run_id = write_results(supabase, inputs, result, label, is_test)
    print(f"Wrote timetable_runs.id = {run_id} (status=draft)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
