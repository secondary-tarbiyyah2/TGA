-- Automatic "who needs to sign what".
--
-- Until now every website policy had to be switched on for signing by hand in
-- Documents & signatures, with the audience (Staff / Parents / Students)
-- picked each time. This migration:
--
--  * policy_signing_audience(number, title) -> learn_role[]: the recommended
--    signers for a policy, from its title (so a policy added later by an admin
--    is covered too) with the policy number as a fallback. Returns '{}' for
--    information-only policies (curriculum, assessment, admissions, ...).
--  * Creates or updates the signable_documents row for every live policy with
--    that audience, switching signing ON where the audience is non-empty and
--    OFF where it is empty. Audiences an admin has already customised by hand
--    (auto_audience = false) are left alone.
--  * A trigger does the same for every policy added or renamed afterwards,
--    so a new policy is routed to the right people the moment it exists.
--  * signable_documents.auto_audience records whether the audience is still
--    the automatic one; the admin UI clears it when someone overrides it.
--
-- Idempotent.

alter table public.signable_documents
  add column if not exists auto_audience boolean not null default true;

create or replace function public.policy_signing_audience(p_number text, p_title text)
returns public.learn_role[]
language plpgsql
immutable
as $$
declare
  t text := lower(coalesce(p_title, ''));
  staff public.learn_role[] := array['head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover']::public.learn_role[];
  parents public.learn_role[] := array['parent']::public.learn_role[];
  students public.learn_role[] := array['student']::public.learn_role[];
begin
  -- Staff-only policies
  if t ~ '(code of conduct|safer recruitment|whistleblow|staff qualif|risk assessment|prevent|extremism|data protection|gdpr|marking and feedback|equality)' then
    return staff;
  end if;
  -- Everyone who is in a live lesson
  if t ~ '(online safety|acceptable use|live lesson protocol)' then
    return staff || parents || students;
  end if;
  -- Staff and parents
  if t ~ '(safeguarding|child protection|recording of live lessons|use of images|health, safety|wellbeing)' then
    return staff || parents;
  end if;
  -- Parents and pupils
  if t ~ '(behaviour|bullying|homework|academic integrity|secure assessment)' then
    return parents || students;
  end if;
  -- Parents only
  if t ~ '(attendance|medical condition|fees|fee policy|relationships, sex|rshe|examinations|private candidates|parent communication|communication charter)' then
    return parents;
  end if;
  -- Fallback by policy number for the standard 2026-27 set
  return case p_number
    when '01' then staff || parents
    when '02' then staff || parents || students
    when '03' then staff || parents || students
    when '04' then staff || parents
    when '05' then staff
    when '06' then parents || students
    when '07' then parents || students
    when '08' then parents
    when '09' then parents
    when '10' then staff || parents
    when '11' then staff
    when '14' then staff
    when '15' then parents || students
    when '17' then parents
    when '19' then parents
    when '20' then parents || students
    when '25' then parents
    when '27' then parents
    when '28' then staff
    when '29' then staff
    when '30' then staff
    when '31' then staff
    when '32' then staff
    when '33' then staff
    else '{}'::public.learn_role[]
  end;
end;
$$;

-- Create/refresh the signing row for one policy with the recommended audience.
create or replace function public.policy_links_auto_sign(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pl public.policy_links%rowtype;
  aud public.learn_role[];
  existing public.signable_documents%rowtype;
begin
  select * into pl from public.policy_links where id = p_id;
  if not found or pl.deleted_at is not null then return; end if;
  aud := public.policy_signing_audience(pl.number, pl.title);
  select * into existing from public.signable_documents d
    where d.source = 'policy' and (d.policy_link_id = pl.id or d.sanity_document_id = 'policy:' || pl.id::text)
    limit 1;
  if found then
    if existing.auto_audience then
      update public.signable_documents
        set target_roles = aud, requires_signature = (cardinality(aud) > 0)
        where id = existing.id;
    end if;
  else
    insert into public.signable_documents (sanity_document_id, policy_link_id, title, file_url, target_roles, requires_signature, source, current_asset_id, auto_audience)
    values ('policy:' || pl.id::text, pl.id, pl.number || '. ' || pl.title, pl.file_url, aud, cardinality(aud) > 0, 'policy', 'pending', true);
  end if;
end;
$$;

create or replace function public.policy_links_auto_sign_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.policy_links_auto_sign(new.id);
  return new;
end;
$$;

drop trigger if exists policy_links_auto_sign_trg on public.policy_links;
create trigger policy_links_auto_sign_trg
  after insert or update of number, title, deleted_at on public.policy_links
  for each row execute function public.policy_links_auto_sign_trg();

-- Apply to every live policy now.
do $$
declare r record;
begin
  for r in select id from public.policy_links where deleted_at is null loop
    perform public.policy_links_auto_sign(r.id);
  end loop;
end $$;

grant execute on function public.policy_signing_audience(text, text) to authenticated;
revoke all on function public.policy_links_auto_sign(uuid) from public, authenticated;
