-- The eligibility quiz's original "which of 3 regions" question was a poor
-- proxy for the actual constraint (can lessons run at a workable local time
-- for this child?) — replaced with an actual timezone + a computed flag for
-- whether the offset from the UK is too large for live lessons to be
-- workable, rather than silently sorting every family into a "band" that
-- doesn't really exist.

alter table public.eligibility_responses drop constraint eligibility_responses_region_check;
alter table public.eligibility_responses rename column region to timezone;
alter table public.eligibility_responses add column utc_offset_hours numeric(4,1);
alter table public.eligibility_responses add column timezone_concern boolean not null default false;
