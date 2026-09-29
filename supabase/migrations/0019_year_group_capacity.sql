-- Phase A of the admissions/LMS plan: admin-editable capacity per year
-- group, with "places remaining" computed from real enrolments rather
-- than a manually typed number that can go stale.
--
-- capacity is nullable and deliberately has no default — the public side
-- (public.year_group_places view, read below) only ever shows a year
-- group once an admin has actually set a number; unset stays invisible,
-- never a placeholder.
alter table public.year_groups
  add column capacity int check (capacity is null or capacity > 0);

-- "Places used" is NOT a raw count of public.enrolments rows: enrolments
-- links child -> class, and one child can hold several rows in the same
-- year group (one per subject-class they're enrolled in), so a raw count
-- would over-count. This counts DISTINCT children who have at least one
-- enrolment in a class belonging to the year group.
create or replace view public.year_group_places as
select
  yg.id as year_group_id,
  yg.name,
  yg.sort_order,
  yg.capacity,
  count(distinct e.child_id) filter (where yg.capacity is not null) as places_used,
  case when yg.capacity is not null
    then greatest(yg.capacity - count(distinct e.child_id), 0)
    else null
  end as places_remaining
from public.year_groups yg
left join public.classes c on c.year_group_id = yg.id
left join public.enrolments e on e.class_id = c.id
group by yg.id, yg.name, yg.sort_order, yg.capacity;

-- Public read: only capacity/remaining counts, no child/family data at
-- all — same privacy classification as bookable_staff's existing public
-- view (0001_init.sql), which this mirrors.
grant select on public.year_group_places to anon, authenticated;
