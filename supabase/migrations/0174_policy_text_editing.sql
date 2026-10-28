-- Policies editable as text in the portal (owner request, 28 October 2026).
--
-- Each policy's wording now lives in policy_links itself: `meta` holds the
-- header table (subtitle, applies to, owner, approved by, agreed with, date
-- of issue, next review, basis, read alongside, availability) and `body_md`
-- the sections in markdown. The website build renders both into the PDF at
-- /policies/<slug>.pdf and a readable page at /policies/<slug>/
-- (scripts/build-policies.cjs --from-db; src/app/(marketing)/policies/[slug]).
-- An uploaded file (file_path) still wins over generated text when present,
-- so the existing upload route keeps working.
--
-- A change to the text counts as a new version of the policy: the trigger
-- bumps file_updated_at so anyone who must sign it is asked to sign again,
-- exactly as replacing the file does.

alter table public.policy_links
  add column if not exists body_md text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists body_updated_at timestamptz;

comment on column public.policy_links.body_md is 'Policy sections in markdown (## 1. Title …). Rendered to the PDF and the web page at build time. Null = file-only policy.';
comment on column public.policy_links.meta is 'Header fields: subtitle, appliesTo, owner, approvedBy, agreedWith, dateOfIssue, nextReview, basis, readAlongside, availability.';

create or replace function public.policy_links_body_changed()
returns trigger language plpgsql as $$
begin
  if new.body_md is distinct from old.body_md or new.meta is distinct from old.meta then
    new.body_updated_at := now();
    new.file_updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists policy_links_body_changed on public.policy_links;
create trigger policy_links_body_changed
  before update on public.policy_links
  for each row execute function public.policy_links_body_changed();
