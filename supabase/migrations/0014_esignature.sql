-- Phase C: document/policy e-signature for /learn. Same conventions as
-- 0010-0013 — see their headers.
--
-- Versioning: a signature always references the EXACT document version
-- signed. Sanity's `policyLink.file` field already gives each PDF upload
-- its own asset id/URL (a new upload is a new Sanity asset, never an
-- in-place mutation of the old one) — that asset id IS the version
-- identifier; this migration doesn't invent a parallel versioning scheme.
-- `signable_documents` mirrors the small subset of policyLink fields this
-- feature needs (title, target roles, whether a signature is required),
-- synced from Sanity the same way `terms` syncs from `termDate`
-- (scripts/sync-signable-documents-from-sanity.mjs, keyed on
-- sanity_document_id — one row per Sanity document) — Sanity Studio (the
-- policyLink schema, extended with `requiresSignature` +
-- `signatureTargetRoles` fields) is the single source of truth for "which
-- documents need a signature", never hand-entered here.

-- ── signable_documents (synced from Sanity, see header) ──────────────────
create table public.signable_documents (
  id uuid primary key default gen_random_uuid(),
  sanity_document_id text not null unique,
  title text not null,
  target_roles public.learn_role[] not null default '{}',
  requires_signature boolean not null default false,
  current_asset_id text not null, -- Sanity file asset id/URL for the CURRENT version — see header
  synced_at timestamptz not null default now()
);

alter table public.signable_documents enable row level security;

create policy "signable_documents: authenticated read"
  on public.signable_documents for select
  to authenticated
  using (true);

-- Written only by the sync script (service-role key) — never hand-edited
-- here, matching `terms`' own "Sanity-owned, no direct client write"
-- pattern (0008).

-- ── document_signatures ───────────────────────────────────────────────────
-- `asset_id_signed` is captured redundantly alongside document_id on every
-- signature row (not just looked up via document_id -> current_asset_id)
-- specifically so a LATER re-upload in Sanity (new asset id) never
-- retroactively changes what an OLD signature is understood to have
-- covered — the audit-critical guarantee from the brief ("never 'the
-- policy' in the abstract").
create table public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.signable_documents(id) on delete cascade,
  asset_id_signed text not null,
  signer_id uuid not null references public.profiles(id),
  typed_full_name text not null,
  affirmed boolean not null check (affirmed), -- the checkbox; a row can only ever exist affirmed=true
  signed_at timestamptz not null default now(),
  unique (document_id, asset_id_signed, signer_id)
);

alter table public.document_signatures enable row level security;

create index document_signatures_signer_idx on public.document_signatures (signer_id);
create index document_signatures_document_idx on public.document_signatures (document_id);

create policy "document_signatures: signer reads own history"
  on public.document_signatures for select
  to authenticated
  using (signer_id = auth.uid());

-- Signing is a direct client insert (not an Edge Function) — deliberately
-- so: there is no elevated privilege being exercised (a user can only ever
-- sign as themselves, for the current version, and can never edit or
-- retract a signature afterwards — no UPDATE/DELETE policy exists at all),
-- so a service-role round trip adds latency without adding safety here.
create policy "document_signatures: sign as self, current version only"
  on public.document_signatures for insert
  to authenticated
  with check (
    signer_id = auth.uid()
    and affirmed = true
    and exists (
      select 1 from public.signable_documents d
      where d.id = document_signatures.document_id
        and d.requires_signature = true
        and d.current_asset_id = document_signatures.asset_id_signed
    )
  );

create policy "document_signatures: can_export_data/head_teacher/admin read all"
  on public.document_signatures for select
  to authenticated
  using (public.current_has_permission('can_export_data') or public.current_has_role(array['head_teacher', 'admin']));

create trigger audit_document_signatures
  after insert on public.document_signatures
  for each row execute function public.audit_row_change();

-- ── outstanding_signatures: who-hasn't-signed-what, computed at read time
-- (never stored — a stored "outstanding" flag would just be the inverse of
-- "does a document_signatures row for the CURRENT asset_id exist", a fact
-- that's already fully derivable, so storing it would just be another copy
-- to keep in sync — ground rule 1/5). Cross join of every person holding a
-- targeted role against every signature-required document, minus anyone
-- who already signed the CURRENT version.
-- Admin-only (this necessarily lists OTHER people's compliance status, not
-- "read own"). `security_invoker` is deliberately left at its default
-- (false) — this view is NOT scoped by relying on the querying user's own
-- RLS on `user_roles`/`profiles`/`document_signatures` (an ordinary parent
-- has no read access to those rows for other people anyway, which would
-- just make the view return nothing useful for them); instead the
-- permission check is baked directly into the WHERE clause below, the same
-- explicit-condition technique `assessments_for_family` (0011) uses, so
-- the view is safe to grant broadly without depending on base-table policy
-- shape.
create view public.outstanding_signatures as
  select
    p.id as user_id,
    p.full_name,
    p.email,
    d.id as document_id,
    d.title,
    d.current_asset_id
  from public.signable_documents d
  join public.user_roles ur on ur.role = any(d.target_roles)
  join public.profiles p on p.id = ur.user_id
  where d.requires_signature = true
    and (public.current_has_permission('can_export_data') or public.current_has_role(array['head_teacher', 'admin']))
    and not exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.signer_id = p.id and s.asset_id_signed = d.current_asset_id
    );

grant select on public.outstanding_signatures to authenticated;

-- ── my_outstanding_signatures: the "pending your signature" prompt every
-- authenticated /learn user needs on their own home dashboard — same idea
-- as above but scoped to the caller only via auth.uid(), so it's safe to
-- grant broadly (a user only ever sees their own outstanding documents).
create view public.my_outstanding_signatures as
  select d.id as document_id, d.title, d.current_asset_id
  from public.signable_documents d
  join public.user_roles ur on ur.role = any(d.target_roles) and ur.user_id = auth.uid()
  where d.requires_signature = true
    and not exists (
      select 1 from public.document_signatures s
      where s.document_id = d.id and s.signer_id = auth.uid() and s.asset_id_signed = d.current_asset_id
    );

grant select on public.my_outstanding_signatures to authenticated;
