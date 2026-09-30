-- Removes MFA app-wide, per explicit request after being told exactly what
-- it covered: the general admin-action MfaGate (frontend UI only, no RLS
-- ever checked it), and the Safeguarding Log's extra "freshly re-checked
-- token" requirement, which WAS enforced here at the RLS level via
-- current_token_fresh(15) on safeguarding_concerns, safeguarding_chronology,
-- and the two safeguarding-attachment policy sets (0015_compliance.sql).
--
-- Rather than hand-editing every one of those ~10 policies (risky — each
-- bundles the freshness check alongside its own role/permission condition),
-- this neutralises the single shared function they all call through. Every
-- policy keeps its role/permission check; only the "...and the token must
-- be fresh" clause stops doing anything. Frontend: MfaGate.tsx and
-- FreshMfaGate.tsx are deleted, and every place that rendered them
-- (LearnGate, the invite flow, StaffApp's admin panel, SafeguardingLog) no
-- longer gates on MFA at all.
--
-- The trusted_devices table/RPCs (0017) exist purely to support MfaGate's
-- "remember this device" feature and are now unused — left in place rather
-- than dropped, since nothing reads or writes them and removing a table is
-- a more invasive change than this request called for.
create or replace function public.current_token_fresh(max_age_minutes int)
returns boolean
language sql
stable
as $$
  select true;
$$;
