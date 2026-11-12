"use client";

// Portal demo only: the database functions the portal calls (supabase.rpc),
// answered from the made-up school with the same columns the real ones return
// (see the migrations named beside each).

import type { Row, Tables } from "@/lib/demo/postgrest";
import { db, recordInsert, recordUpdate, whoAmI } from "@/lib/demo/store";

type Args = Record<string, unknown>;

const nameOf = (t: Tables, id: unknown) => (t.profiles.find((p) => p.id === id)?.full_name as string) || "Staff member";
const first = (n: string) => n.split(" ")[0];
const initial = (n: string) => (n.split(" ")[1] || "").slice(0, 1);
const rolesOf = (t: Tables, user: unknown) => [...new Set(t.user_roles.filter((r) => r.user_id === user).map((r) => String(r.role)))];
const isStaffRole = (r: string) => ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "senco"].includes(r);

function threadSummary(t: Tables, th: Row, me: string): Row {
  const msgs = t.message_thread_messages.filter((m) => m.thread_id === th.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const members = t.message_thread_members.filter((m) => m.thread_id === th.id);
  const mine = members.find((m) => m.user_id === me);
  const others = members.filter((m) => m.user_id !== me);
  const last = msgs[msgs.length - 1];
  const child = th.child_id ? t.children.find((c) => c.id === th.child_id) : null;
  const other = others[0];
  const title = th.kind === "group" ? (th.title as string) : other ? nameOf(t, other.user_id) : "Conversation";
  const unread = msgs.filter((m) => m.sender_id !== me && !t.message_reads.some((r) => r.message_id === m.id && r.reader_id === me)).length;
  return {
    thread_id: th.id,
    kind: th.kind,
    title,
    subtitle: th.kind === "group" ? `${members.length} members` : child ? `About ${child.name}` : rolesOf(t, other?.user_id).includes("parent") ? "Parent" : "Staff",
    other_user_id: th.kind === "group" ? null : other?.user_id ?? null,
    group_type: th.group_type ?? null,
    member_count: members.length,
    includes_pupils: members.some((m) => m.member_role === "student"),
    my_role: mine?.member_role ?? "staff",
    is_admin: !!mine?.is_admin,
    members_can_reply: th.members_can_reply !== false,
    can_post: th.members_can_reply !== false || !!mine?.is_admin,
    created_at: th.created_at,
    last_at: last?.created_at ?? th.created_at,
    last_preview: last ? String(last.body).slice(0, 120) : null,
    last_sender_id: last?.sender_id ?? null,
    last_sender_name: last ? nameOf(t, last.sender_id) : null,
    unread,
  };
}

export async function rpc(name: string, a: Args, t: Tables): Promise<unknown> {
  const me = whoAmI();
  const uid = me?.userId || "";
  const raw = db().tables;
  switch (name) {
    // ── classes and teachers ─────────────────────────────────────────────
    case "my_teaching_classes": {
      const ids = new Set(raw.class_subject_teachers.filter((x) => x.teacher_id === uid).map((x) => x.class_id));
      return raw.classes
        .filter((c) => ids.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, subject_id: c.subject_id, subject_name: c.subject, year_group: c.year_group, year_group_name: raw.year_groups.find((y) => y.id === c.year_group_id)?.name ?? null, pupils: raw.enrolments.filter((e) => e.class_id === c.id).length }));
    }
    case "class_teacher_names": {
      const ids = raw.class_subject_teachers.filter((x) => x.class_id === a.p_class_id).map((x) => x.teacher_id);
      return [...new Set(ids)].map((i) => nameOf(raw, i)).join(", ");
    }
    case "meet_my_teachers": {
      const kids = new Set(me?.childIds || []);
      const classIds = new Set(raw.enrolments.filter((e) => kids.has(String(e.child_id)) && (!a.p_class_id || e.class_id === a.p_class_id)).map((e) => e.class_id));
      const byTeacher = new Map<string, string[]>();
      for (const x of raw.class_subject_teachers.filter((x) => classIds.has(x.class_id))) byTeacher.set(String(x.teacher_id), [...(byTeacher.get(String(x.teacher_id)) || []), String(raw.classes.find((c) => c.id === x.class_id)?.name)]);
      return [...byTeacher.entries()].map(([tid, classNames]) => {
        const sp = raw.staff_profiles.find((s) => s.user_id === tid);
        return { teacher_id: tid, full_name: nameOf(raw, tid), display_title: sp?.display_title ?? null, bio: sp?.bio ?? null, qualifications: sp?.qualifications ?? null, subjects_taught: sp?.subjects_taught ?? [], years_experience: sp?.years_experience ?? null, languages: sp?.languages ?? [], photo_path: null, contact_email: raw.profiles.find((p) => p.id === tid)?.email ?? null, class_names: classNames };
      });
    }
    case "class_enrolment_candidates": {
      const c = raw.classes.find((x) => x.id === a.p_class_id);
      const inClass = new Set(raw.enrolments.filter((e) => e.class_id === a.p_class_id).map((e) => e.child_id));
      return raw.children.filter((ch) => !inClass.has(ch.id) && (!c || ch.year_group_id === c.year_group_id)).map((ch) => ({ id: ch.id, name: ch.name, year_group_id: ch.year_group_id }));
    }
    case "set_child_classes": {
      const child = a.p_child_id as string;
      const want = new Set((a.p_class_ids as string[]) || []);
      raw.enrolments = raw.enrolments.filter((e) => e.child_id !== child || want.has(String(e.class_id)));
      const have = new Set(raw.enrolments.filter((e) => e.child_id === child).map((e) => String(e.class_id)));
      const added = [...want].filter((c) => !have.has(c)).map((c) => ({ id: crypto.randomUUID(), class_id: c, child_id: child, created_at: new Date().toISOString() }));
      raw.enrolments.push(...added);
      if (added.length) recordInsert("enrolments", added);
      return null;
    }
    case "set_class_meeting_url": {
      const c = raw.classes.filter((x) => x.id === a.p_class_id);
      c.forEach((x) => (x.meeting_url = a.p_url));
      recordUpdate("classes", c, { meeting_url: a.p_url });
      return null;
    }
    case "class_comments_for":
      return raw.class_post_comments.filter((c) => c.class_id === a.p_class_id).map((c) => ({ id: c.id, announcement_id: c.announcement_id, material_id: c.material_id, author_id: c.author_id, author_name: nameOf(raw, c.author_id), body: c.body, created_at: c.created_at, deleted_at: c.deleted_at }));
    case "teacher_pupil_health":
      return raw.pupil_details.map((d) => ({ child_id: d.child_id, address_line1: d.address_line1, address_line2: d.address_line2, town: d.town, postcode: d.postcode, medical_conditions: d.medical_conditions, allergies: d.allergies, medication: d.medication, dietary_needs: d.dietary_needs, sen_notes: d.sen_notes, health_confirmed: d.health_confirmed, photo_consent: d.photo_consent, trip_consent: d.trip_consent, completed_at: d.completed_at, updated_at: d.updated_at }));
    case "pupil_pronoun": {
      const d = raw.pupil_details.find((x) => x.child_id === a.p_child_id);
      return d?.gender === "Female" ? "she" : "he";
    }
    case "enrichment_roster":
      return raw.children.slice(0, 9).map((c) => ({ child_id: c.id, child_name: c.name, year_group: raw.year_groups.find((y) => y.id === c.year_group_id)?.name }));
    case "period_supervisor_names":
      return raw.timetable_periods.filter((p) => p.supervisor_user_id).map((p) => ({ period_id: p.id, supervisor_name: nameOf(raw, p.supervisor_user_id) }));
    case "grade_for_percent": {
      const b = raw.grade_boundaries.filter((g) => g.mark_scheme_id === a.p_mark_scheme_id).sort((x, y) => Number(y.min_percent) - Number(x.min_percent));
      return (b.find((g) => Number(a.p_percent) >= Number(g.min_percent))?.label as string) ?? null;
    }

    // ── staff ────────────────────────────────────────────────────────────
    case "admin_staff_directory":
      return raw.profiles
        .filter((p) => rolesOf(raw, p.id).some(isStaffRole))
        .map((p) => {
          const sp = raw.staff_profiles.find((s) => s.user_id === p.id);
          return { user_id: p.id, full_name: p.full_name, email: p.email, phone: sp?.phone ?? null, display_title: sp?.display_title ?? null, roles: rolesOf(raw, p.id), active: sp?.active !== false, is_dsl: raw.user_permissions.some((x) => x.user_id === p.id && x.permission === "safeguarding_lead") };
        });
    case "admin_update_staff": {
      const p = raw.profiles.filter((x) => x.id === a.p_user);
      p.forEach((x) => Object.assign(x, { full_name: a.p_full_name, email: a.p_email }));
      recordUpdate("profiles", p, { full_name: a.p_full_name, email: a.p_email });
      return null;
    }
    case "admin_set_staff_roles":
    case "set_safeguarding_lead":
    case "set_senco":
    case "admissions_log_document_access":
    case "audit_log_record_export":
    case "log_pupil_detail_view":
    case "mark_messages_delivered":
    case "shift_heartbeat":
    case "student_login_password_changed":
    case "set_my_pin":
    case "remove_my_pin":
    case "set_parent_evening_join_url":
    case "cancel_my_withdrawal_notice":
    case "revision_tick_todo":
    case "curriculum_set_signoff":
      return null;
    case "has_my_pin":
      return false; // no PIN to type in the demo
    case "my_pin_status":
      return "none"; // PINs are optional: the family area opens straight away
    case "verify_my_pin":
      return true;
    case "my_pin_lock_remaining":
      return 0;
    case "clock_in_policy":
      return [{ require_clock_in: false, clock_in_roles: [], auto_clock_out_hours: 10 }];
    case "clock_in_or_resume":
      return "clocked_in";
    case "close_stale_shifts":
      return 0;
    case "log_lesson_join":
      return true;
    case "parent_evening_teacher_options":
      return raw.profiles.filter((p) => rolesOf(raw, p.id).some(isStaffRole)).map((p) => ({ user_id: p.id, full_name: p.full_name, role: rolesOf(raw, p.id)[0] }));

    // ── messages ─────────────────────────────────────────────────────────
    case "my_message_threads": {
      const mine = new Set(raw.message_thread_members.filter((m) => m.user_id === uid).map((m) => m.thread_id));
      return raw.message_threads.filter((th) => mine.has(th.id)).map((th) => threadSummary(raw, th, uid));
    }
    case "thread_unread_counts": {
      const mine = new Set(raw.message_thread_members.filter((m) => m.user_id === uid).map((m) => m.thread_id));
      return raw.message_threads.filter((th) => mine.has(th.id)).map((th) => ({ thread_id: th.id, unread: threadSummary(raw, th, uid).unread }));
    }
    case "mark_thread_read": {
      const add: Row[] = [];
      for (const m of raw.message_thread_messages.filter((m) => m.thread_id === a.p_thread_id && m.sender_id !== uid)) {
        if (!raw.message_reads.some((r) => r.message_id === m.id && r.reader_id === uid)) add.push({ message_id: m.id, reader_id: uid, read_at: new Date().toISOString() });
      }
      raw.message_reads.push(...add);
      if (add.length) recordInsert("message_reads", add);
      return null;
    }
    case "thread_members":
      return raw.message_thread_members.filter((m) => m.thread_id === a.p_thread_id).map((m) => ({ user_id: m.user_id, full_name: nameOf(raw, m.user_id), member_role: m.member_role, is_admin: m.is_admin, added_at: m.added_at }));
    case "thread_sender_names":
      return raw.message_thread_members.filter((m) => m.thread_id === a.p_thread_id).map((m) => ({ user_id: m.user_id, full_name: nameOf(raw, m.user_id), is_staff: m.member_role === "staff" }));
    case "thread_delivery":
      return raw.message_thread_members.filter((m) => m.thread_id === a.p_thread_id).map((m) => ({ user_id: m.user_id, delivered_at: new Date().toISOString() }));
    case "message_receipts": {
      const msgs = raw.message_thread_messages.filter((m) => m.thread_id === a.p_thread_id);
      const audience = raw.message_thread_members.filter((m) => m.thread_id === a.p_thread_id).length - 1;
      return raw.message_reads.filter((r) => msgs.some((m) => m.id === r.message_id && m.sender_id !== r.reader_id)).map((r) => ({ message_id: r.message_id, audience, reader_id: r.reader_id, reader_name: nameOf(raw, r.reader_id), read_at: r.read_at }));
    }
    case "message_directory": {
      const out: Row[] = [];
      for (const p of raw.profiles) {
        const roles = rolesOf(raw, p.id);
        if (p.id === uid) continue;
        if (me?.role === "parent" || me?.role === "student") {
          if (!roles.some(isStaffRole)) continue;
        } else if (roles.includes("student")) continue;
        const kids = raw.children.filter((c) => c.parent_user_id === p.id).map((c) => c.name);
        out.push({ user_id: p.id, full_name: p.full_name, roles, detail: kids.length ? `Parent of ${kids.join(", ")}` : (raw.staff_profiles.find((s) => s.user_id === p.id)?.display_title as string) || null });
      }
      return out;
    }
    case "message_group_presets":
      return [
        ...raw.classes.map((c) => ({ preset_type: "class", preset_id: c.id, name: c.name, parents: raw.enrolments.filter((e) => e.class_id === c.id).length, pupils: raw.enrolments.filter((e) => e.class_id === c.id).length })),
        ...raw.year_groups.map((y) => ({ preset_type: "year_group", preset_id: y.id, name: y.name, parents: raw.children.filter((c) => c.year_group_id === y.id).length, pupils: raw.children.filter((c) => c.year_group_id === y.id).length })),
      ];
    case "message_group_candidates":
      return raw.profiles
        .filter((p) => p.id !== uid)
        .map((p) => {
          const roles = rolesOf(raw, p.id);
          const kind = roles.some(isStaffRole) ? "staff" : roles.includes("parent") ? "parent" : "student";
          return { user_id: p.id, full_name: p.full_name, member_kind: kind, detail: kind === "parent" ? `Parent of ${raw.children.filter((c) => c.parent_user_id === p.id).map((c) => first(String(c.name))).join(", ")}` : null };
        });
    case "create_message_group": {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const th = { id, kind: "group", child_id: null, parent_id: null, teacher_id: null, staff_a_id: null, staff_b_id: null, created_at: now, title: a.p_title, group_type: a.p_group_type, class_id: a.p_class_id ?? null, year_group_id: a.p_year_group_id ?? null, created_by: uid, members_can_reply: true };
      raw.message_threads.push(th);
      recordInsert("message_threads", [th]);
      const members = [{ id: crypto.randomUUID(), thread_id: id, user_id: uid, member_role: "staff", is_admin: true, added_by: uid, added_at: now }];
      for (const u of (a.p_member_ids as string[]) || []) members.push({ id: crypto.randomUUID(), thread_id: id, user_id: u, member_role: rolesOf(raw, u).includes("parent") ? "parent" : "staff", is_admin: false, added_by: uid, added_at: now });
      raw.message_thread_members.push(...members);
      recordInsert("message_thread_members", members);
      return id;
    }
    case "search_messages": {
      const q = String(a.p_query || "").toLowerCase();
      const mine = new Set(raw.message_thread_members.filter((m) => m.user_id === uid).map((m) => m.thread_id));
      return raw.message_thread_messages.filter((m) => mine.has(m.thread_id) && String(m.body).toLowerCase().includes(q)).map((m) => ({ message_id: m.id, thread_id: m.thread_id, sender_id: m.sender_id, sender_name: nameOf(raw, m.sender_id), body: m.body, created_at: m.created_at }));
    }
    case "oversight_list_threads":
      return raw.message_threads.map((th) => {
        const members = raw.message_thread_members.filter((m) => m.thread_id === th.id);
        const msgs = raw.message_thread_messages.filter((m) => m.thread_id === th.id).sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
        const last = msgs[msgs.length - 1];
        const child = raw.children.find((c) => c.id === th.child_id);
        return { thread_id: th.id, kind: th.kind, category: th.kind === "group" ? "group" : th.kind === "staff" ? "staff" : "family", name_a: nameOf(raw, members[0]?.user_id), role_a: members[0]?.member_role, name_b: th.kind === "group" ? th.title : nameOf(raw, members[1]?.user_id), role_b: th.kind === "group" ? "group" : members[1]?.member_role, child_name: child?.name ?? null, created_at: th.created_at, last_at: last?.created_at ?? th.created_at, last_preview: last ? String(last.body).slice(0, 120) : null, last_sender_id: last?.sender_id ?? null, message_count: msgs.length, flagged_count: msgs.filter((m) => m.flagged).length };
      });
    case "oversight_open_thread":
      return raw.message_thread_messages.filter((m) => m.thread_id === a.p_thread_id).map((m) => ({ id: m.id, sender_id: m.sender_id, sender_name: nameOf(raw, m.sender_id), body: m.body, original_body: m.original_body, created_at: m.created_at, flagged: m.flagged, flagged_keywords: m.flagged_keywords, edited_at: m.edited_at, recalled_at: m.recalled_at }));

    // ── behaviour, houses, stars ─────────────────────────────────────────
    case "house_standings": {
      const days = a.p_days ? Number(a.p_days) : null;
      const since = days ? Date.now() - days * 86400000 : 0;
      const myKids = new Set(me?.childIds || []);
      const rows = raw.houses.map((h) => {
        const members = raw.house_members.filter((m) => m.house_id === h.id).map((m) => m.child_id);
        const merit = raw.behaviour_records.filter((b) => b.kind === "merit" && !b.voided_at && members.includes(b.child_id) && Date.parse(String(b.occurred_on)) >= since).reduce((n, b) => n + Number(b.points || 0), 0);
        const bonus = raw.house_point_awards.filter((x) => x.house_id === h.id && !x.voided_at && Date.parse(String(x.awarded_on)) >= since).reduce((n, x) => n + Number(x.points || 0), 0);
        return { house_id: h.id, name: h.name, colour: h.colour, motto: h.motto, merit_points: merit, bonus_points: bonus, total_points: merit + bonus, member_count: members.length, is_mine: members.some((m) => myKids.has(String(m))), rank: 0 };
      });
      rows.sort((x, y) => y.total_points - x.total_points).forEach((r, i) => (r.rank = i + 1));
      return rows;
    }
    case "merit_leaderboard": {
      const days = a.p_days ? Number(a.p_days) : null;
      const since = days ? Date.now() - days * 86400000 : 0;
      let pool = raw.children;
      if (a.p_scope === "class" && a.p_scope_id) {
        const ids = new Set(raw.enrolments.filter((e) => e.class_id === a.p_scope_id).map((e) => e.child_id));
        pool = pool.filter((c) => ids.has(c.id));
      } else if (a.p_scope === "year_group" && a.p_scope_id) pool = pool.filter((c) => c.year_group_id === a.p_scope_id);
      const myKids = new Set(me?.childIds || []);
      return pool
        .map((c) => ({ c, merits: raw.behaviour_records.filter((b) => b.child_id === c.id && b.kind === "merit" && !b.voided_at && Date.parse(String(b.occurred_on)) >= since).length }))
        .filter((x) => x.merits > 0)
        .sort((x, y) => y.merits - x.merits)
        .slice(0, Number(a.p_limit) || 5)
        .map((x, i) => ({ rank: i + 1, first_name: first(String(x.c.name)), surname_initial: initial(String(x.c.name)), merits: x.merits, is_mine: myKids.has(String(x.c.id)) }));
    }
    case "star_of_the_week_board": {
      const myKids = new Set(me?.childIds || []);
      return raw.star_of_the_week
        .filter((s) => s.status === "approved")
        .map((s) => {
          const c = raw.children.find((x) => x.id === s.child_id);
          return { week_start: s.week_start, class_name: raw.classes.find((x) => x.id === s.class_id)?.name, first_name: first(String(c?.name)), surname_initial: initial(String(c?.name)), reason: s.reason, is_mine: myKids.has(String(s.child_id)) };
        });
    }
    case "star_candidates": {
      const ids = raw.enrolments.filter((e) => e.class_id === a.p_class_id).map((e) => e.child_id);
      return raw.children
        .filter((c) => ids.includes(c.id))
        .map((c, i) => {
          const merits = raw.behaviour_records.filter((b) => b.child_id === c.id && b.kind === "merit").length;
          return { child_id: c.id, child_name: c.name, hidden: false, merits, merit_points: merits, net_points: merits - (i % 3 === 0 ? 1 : 0), homework_set: 4, homework_done: 3 + (i % 2), quran_sessions: 3, quran_average: 7.5, lessons: 12, attended: 11 + (i % 2), stars_this_term: i % 4 === 0 ? 1 : 0, stars_all_time: i % 4 === 0 ? 1 : 0, last_star_week: null };
        });
    }
    case "child_streaks":
      return [{ attendance_days: 12, homework_on_time: 5 }];

    // ── parents' evening ─────────────────────────────────────────────────
    case "parent_evening_options": {
      const kids = raw.children.filter((c) => (me?.childIds || []).includes(String(c.id)));
      const out: Row[] = [];
      for (const ev of raw.parent_evenings.filter((e) => e.status === "open")) {
        for (const k of kids) {
          const classIds = raw.enrolments.filter((e) => e.child_id === k.id).map((e) => e.class_id);
          const byT = new Map<string, string[]>();
          for (const x of raw.class_subject_teachers.filter((x) => classIds.includes(x.class_id))) byT.set(String(x.teacher_id), [...(byT.get(String(x.teacher_id)) || []), String(raw.classes.find((c) => c.id === x.class_id)?.name)]);
          for (const [tid, cn] of byT) out.push({ evening_id: ev.id, child_id: k.id, child_name: k.name, teacher_id: tid, teacher_name: nameOf(raw, tid), class_names: cn });
        }
      }
      return out;
    }
    case "my_parent_evening_bookings":
      return raw.parent_evening_bookings
        .filter((b) => b.parent_user_id === uid && b.status === "booked")
        .map((b) => {
          const ev = raw.parent_evenings.find((e) => e.id === b.evening_id);
          return { booking_id: b.id, evening_id: b.evening_id, evening_title: ev?.title, location: ev?.location, child_id: b.child_id, child_name: raw.children.find((c) => c.id === b.child_id)?.name, teacher_id: b.teacher_id, teacher_name: nameOf(raw, b.teacher_id), slot_start: b.slot_start, slot_end: b.slot_end, join_url: "https://teams.microsoft.com/l/meetup-join/demo" };
        });
    case "my_parent_evening_schedule":
      return raw.parent_evening_bookings.filter((b) => b.evening_id === a.p_evening_id && b.teacher_id === uid && b.status === "booked").map((b) => ({ booking_id: b.id, child_name: raw.children.find((c) => c.id === b.child_id)?.name, parent_name: nameOf(raw, b.parent_user_id), slot_start: b.slot_start, slot_end: b.slot_end, join_url: "https://teams.microsoft.com/l/meetup-join/demo" }));
    case "parent_evening_admin_bookings":
      return raw.parent_evening_bookings.filter((b) => b.evening_id === a.p_evening_id && b.status === "booked").map((b) => ({ booking_id: b.id, teacher_id: b.teacher_id, teacher_name: nameOf(raw, b.teacher_id), child_name: raw.children.find((c) => c.id === b.child_id)?.name, parent_name: nameOf(raw, b.parent_user_id), slot_start: b.slot_start, slot_end: b.slot_end }));
    case "parent_evening_taken_slots":
      return raw.parent_evening_bookings.filter((b) => b.evening_id === a.p_evening_id && b.teacher_id === a.p_teacher_id && b.status === "booked").map((b) => ({ slot_start: b.slot_start, mine: b.parent_user_id === uid }));
    case "book_parent_evening_slot": {
      const ev = raw.parent_evenings.find((e) => e.id === a.p_evening_id);
      const start = new Date(String(a.p_slot_start));
      const row = { id: crypto.randomUUID(), evening_id: a.p_evening_id, teacher_id: a.p_teacher_id, child_id: a.p_child_id, parent_user_id: uid, slot_start: start.toISOString(), slot_end: new Date(start.getTime() + Number(ev?.slot_minutes || 10) * 60000).toISOString(), status: "booked", booked_at: new Date().toISOString(), cancelled_at: null, cancelled_by: null };
      raw.parent_evening_bookings.push(row);
      recordInsert("parent_evening_bookings", [row]);
      return row.id;
    }
    case "cancel_parent_evening_booking": {
      const b = raw.parent_evening_bookings.filter((x) => x.id === a.p_booking_id);
      b.forEach((x) => Object.assign(x, { status: "cancelled", cancelled_at: new Date().toISOString() }));
      recordUpdate("parent_evening_bookings", b, { status: "cancelled" });
      return null;
    }
    case "rebook_parent_evening_slot": {
      const b = raw.parent_evening_bookings.filter((x) => x.id === a.p_booking_id);
      const start = new Date(String(a.p_new_slot_start));
      b.forEach((x) => Object.assign(x, { slot_start: start.toISOString(), slot_end: new Date(start.getTime() + 600000).toISOString() }));
      recordUpdate("parent_evening_bookings", b, { slot_start: start.toISOString() });
      return a.p_booking_id;
    }
    case "open_evening_upcoming":
      return raw.open_evening_sessions.map((s) => ({ id: s.id, title: s.title, description: s.description, starts_at: s.starts_at, ends_at: s.ends_at, capacity: s.capacity, seats_left: Number(s.capacity) - raw.open_evening_bookings.filter((b) => b.session_id === s.id).length }));
    case "get_open_slots": {
      const out: Row[] = [];
      const from = new Date(String(a.p_from || new Date().toISOString().slice(0, 10)));
      for (let d = 1; d <= 10; d++) {
        const day = new Date(from.getTime() + d * 86400000);
        if (day.getDay() === 0 || day.getDay() === 6) continue;
        for (const h of [10, 11, 14]) {
          const s = new Date(day);
          s.setHours(h, 0, 0, 0);
          out.push({ slot_start: s.toISOString(), slot_end: new Date(s.getTime() + 1200000).toISOString() });
        }
      }
      return out;
    }

    // ── safeguarding and SEND ────────────────────────────────────────────
    case "safeguarding_review_queue":
      return raw.safeguarding_reviews.map((r) => ({ id: r.id, child_name: raw.children.find((c) => c.id === r.child_id)?.name, rule: r.rule, reason: r.reason, concern_count: (r.concern_ids as string[]).length, opened_at: r.opened_at, due_at: r.due_at, status: r.status, checklist: r.checklist, reviewed_by_name: r.reviewed_by ? nameOf(raw, r.reviewed_by) : null, reviewed_at: r.reviewed_at, decision: r.decision, outcome: r.outcome, notes: r.notes, is_overdue: Date.parse(String(r.due_at)) < Date.now() }));
    case "safeguarding_leads":
      return [{ full_name: "Amina Rahman", kind: "safeguarding_lead" }, { full_name: "Amina Rahman", kind: "head_teacher" }];
    case "safeguarding_contacts":
      return [{ full_name: "Amina Rahman", kind: "safeguarding_lead", role_label: "Designated Safeguarding Lead" }, { full_name: "Amina Rahman", kind: "head_teacher", role_label: "Headteacher" }];
    case "send_register":
      return raw.children.map((c) => {
        const plan = raw.send_support_plans.find((p) => p.child_id === c.id);
        return { child_id: c.id, child_name: c.name, year_group: raw.year_groups.find((y) => y.id === c.year_group_id)?.name, plan_id: plan?.id ?? null, status: plan?.status ?? null, support_level: plan?.support_level ?? null, primary_need: plan?.primary_need ?? null, next_review_due: plan?.next_review_due ?? null, last_reviewed_on: plan?.last_reviewed_on ?? null, senco_name: plan ? "Ruqayyah Ahmed" : null, key_adult_name: plan ? "Hafsa Qureshi" : null, has_access: !!plan?.access_extra_time_pct, adjustments_count: plan ? (plan.adjustments as string[]).length : 0, open_targets: plan ? 1 : 0, flagged: false, family_agreed_at: plan ? plan.updated_at : null, unseen_comments: 0, updated_at: plan?.updated_at ?? null };
      }).filter((r) => r.plan_id);
    case "send_pupil_options":
      return raw.children.map((c) => ({ child_id: c.id, child_name: c.name, year_group: raw.year_groups.find((y) => y.id === c.year_group_id)?.name, has_plan: raw.send_support_plans.some((p) => p.child_id === c.id) }));
    case "send_staff_options":
      return raw.profiles.filter((p) => rolesOf(raw, p.id).some(isStaffRole)).map((p) => ({ user_id: p.id, full_name: p.full_name, is_senco: rolesOf(raw, p.id).includes("senco") }));
    case "send_staff_names":
      return ((a.p_ids as string[]) || []).map((i) => ({ user_id: i, full_name: nameOf(raw, i) }));
    case "send_access_arrangements": {
      const p = raw.send_support_plans.find((x) => x.child_id === a.p_child && x.status === "active");
      return p ? { extra_time_pct: p.access_extra_time_pct, reader: p.access_reader, scribe: p.access_scribe, rest_breaks: p.access_rest_breaks, word_processor: p.access_word_processor, separate_room: p.access_separate_room, other: p.access_other } : null;
    }
    case "send_sources":
      return { pupil_details: raw.pupil_details.find((d) => d.child_id === a.p_child)?.sen_notes ?? null, application: null, assessment: null };
    case "send_change_log":
      return raw.send_support_plans.slice(0, 4).map((p) => ({ changed_at: p.updated_at, actor_name: "Ruqayyah Ahmed", action: "update", what: "Support plan", child_id: p.child_id, child_name: raw.children.find((c) => c.id === p.child_id)?.name, fields: ["adjustments", "next_review_due"] }));

    // ── fees ─────────────────────────────────────────────────────────────
    case "fee_record_manual_payment": {
      const c = raw.fee_charges.find((x) => x.id === a.p_charge);
      if (!c) return { __error: "charge not found" };
      const amount = Number(a.p_amount_pence);
      const pay = { id: crypto.randomUUID(), charge_id: c.id, amount: amount / 100, method: "manual", paid_on: (a.p_paid_on as string) || new Date().toISOString().slice(0, 10), reference: `TGA-P-${10001 + raw.fee_payments.length}`, recorded_by: uid, created_at: new Date().toISOString(), amount_pence: amount, payment_method_type: "manual", stripe_payment_intent_id: null, stripe_charge_id: null, stripe_checkout_session_id: null, stripe_fee_pence: 0, net_pence: amount, refunded_pence: 0, disputed: false, livemode: false, recorded_reason: a.p_reason };
      raw.fee_payments.push(pay);
      recordInsert("fee_payments", [pay]);
      const paid = Number(c.paid_pence) + amount;
      const patch = { paid_pence: paid, status: paid >= Number(c.amount_pence) ? "paid" : "part_paid" };
      Object.assign(c, patch);
      recordUpdate("fee_charges", [c], patch);
      return pay.id;
    }
    case "fee_charge_waive": {
      const c = raw.fee_charges.filter((x) => x.id === a.p_charge);
      const patch = { status: "waived", waived_reason: a.p_reason, waived_by: uid, waived_at: new Date().toISOString() };
      c.forEach((x) => Object.assign(x, patch));
      recordUpdate("fee_charges", c, patch);
      return null;
    }

    // ── curriculum ───────────────────────────────────────────────────────
    case "curriculum_can_edit_lesson":
      return me?.role === "head_teacher" || me?.role === "teacher";
    case "curriculum_review_transition": {
      const s = raw.curriculum_signoffs.find((x) => x.subject_slug === a.p_subject && x.scope === a.p_scope && x.ref === a.p_ref);
      if (s) {
        Object.assign(s, { status: a.p_to });
        recordUpdate("curriculum_signoffs", [s], { status: a.p_to });
      } else {
        const row = { id: crypto.randomUUID(), subject_slug: a.p_subject, scope: a.p_scope, ref: a.p_ref, status: a.p_to, note: a.p_note ?? null, checked_by: uid, checked_name: me?.name, checked_at: new Date().toISOString(), submitted_by: uid, submitted_name: me?.name, submitted_at: new Date().toISOString(), approved_by: null, approved_name: null, approved_at: null, approved_version: null, changed_since_approval: false };
        raw.curriculum_signoffs.push(row);
        recordInsert("curriculum_signoffs", [row]);
      }
      return a.p_to;
    }
    case "curriculum_save_lesson_content": {
      const l = raw.curriculum_lessons.filter((x) => x.id === a.p_lesson);
      const now = new Date().toISOString();
      l.forEach((x) => Object.assign(x, { content: a.p_content, content_updated_at: now, content_updated_by: uid, content_updated_by_name: me?.name }));
      recordUpdate("curriculum_lessons", l, { content: a.p_content, content_updated_at: now });
      return now;
    }
    case "curriculum_replace_deck":
    case "curriculum_restore_version":
      return 2;
    case "curriculum_restore_unit":
      return a.p_version;
    case "lesson_pupil_pdf_path":
      return null;
    case "revision_create_todos":
      return 0;
    case "revision_create_draft_pack":
      return crypto.randomUUID();
    case "family_revision":
      return [];

    // ── quizzes (switched off by default; kept answering) ────────────────
    case "quiz_info":
      return { homework_id: a.p_homework, title: "Quiz", question_count: 0, total_marks: 0, time_limit_minutes: null, max_attempts: 1, attempts: [], can_start: false };
    case "quiz_start":
    case "quiz_save":
    case "quiz_submit":
    case "quiz_mark":
    case "quiz_result":
      return { ok: false, error: "quizzes_switched_off" };

    // ── audit, retention, documents ──────────────────────────────────────
    case "audit_log_facets":
      return [
        ...["children", "attendance_records", "fee_charges", "school_features"].map((v) => ({ kind: "table", value: v })),
        ...["insert", "update", "delete"].map((v) => ({ kind: "action", value: v })),
        ...["head@demo-school.example", "office@demo-school.example"].map((v) => ({ kind: "actor", value: v })),
      ];
    case "audit_log_search": {
      const rows = raw.audit_log;
      const lim = Number(a.p_limit) || 50;
      const off = Number(a.p_offset) || 0;
      return rows.slice(off, off + lim).map((r, i) => ({ id: i + 1 + off, created_at: r.created_at, actor_email: raw.profiles.find((p) => p.id === r.actor_id)?.email ?? null, action: r.action, target_table: r.target_table, target_id: null, summary: `${r.action === "insert" ? "Added" : "Changed"} a ${String(r.target_table).replace(/_/g, " ")} record`, changed_fields: ["status"], masked: false, total_count: rows.length }));
    }
    case "retention_preview":
      return [];
    case "retention_run":
      return 0;
    case "policy_signing_audience":
      return ["teacher", "admin", "head_teacher"];
  }
  // Unknown function: nothing to show, without an error.
  console.info("[demo] rpc not modelled:", name);
  return [];
}
