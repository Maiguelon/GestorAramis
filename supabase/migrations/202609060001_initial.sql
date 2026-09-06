-- Production foundation. Run in a NEW Supabase project; no service credentials in this file.
-- Direct authenticated access is read-only. Business mutations require future transactional RPCs.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  initials text not null default '',
  color text not null default '#1b2a41' check (color ~ '^#[0-9a-fA-F]{6}$'),
  contact_name text not null default '',
  phone text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references public.profiles(user_id),
  role text not null check (role in ('staff', 'client')),
  client_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'staff' and client_id is null) or (role = 'client' and client_id is not null)),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  unique (workspace_id, user_id),
  unique (workspace_id, id),
  unique (workspace_id, id, role)
);
create index members_auth_lookup on public.members (user_id, workspace_id) where active;

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 240),
  format text not null default 'post' check (format in ('reel', 'carousel', 'post', 'story')),
  status text not null default 'planned' check (status in ('planned', 'production', 'review', 'approved', 'scheduled', 'published')),
  owner_member_id uuid not null,
  owner_role text not null default 'staff' check (owner_role = 'staff'),
  planned_date date,
  visible_to_client boolean not null default false,
  caption text not null default '',
  archived boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  foreign key (workspace_id, owner_member_id, owner_role) references public.members(workspace_id, id, role),
  unique (workspace_id, id),
  unique (workspace_id, client_id, id)
);
create index pieces_calendar on public.pieces (workspace_id, client_id, planned_date) where not archived;

-- RLS controls rows, not columns. Internal notes must NEVER share a client-readable row.
create table public.piece_internal_notes (
  piece_id uuid primary key,
  workspace_id uuid not null,
  note text not null default '',
  foreign key (workspace_id, piece_id) references public.pieces(workspace_id, id) on delete cascade
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  piece_id uuid not null,
  version integer not null check (version > 0),
  caption text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes', 'superseded')),
  -- Build snapshot + associations, then seal within one server transaction before issuing a link.
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (workspace_id, client_id, piece_id) references public.pieces(workspace_id, client_id, id),
  unique (piece_id, version),
  unique (workspace_id, id),
  unique (workspace_id, client_id, id),
  unique (workspace_id, client_id, piece_id, id),
  check (status in ('pending', 'superseded') or sealed_at is not null)
);
create unique index one_current_review_per_piece on public.reviews (piece_id) where status <> 'superseded';

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  piece_id uuid not null,
  instructions text not null check (length(btrim(instructions)) between 1 and 10000),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'received', 'complete')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (workspace_id, client_id, piece_id) references public.pieces(workspace_id, client_id, id),
  unique (workspace_id, id),
  unique (workspace_id, client_id, id),
  unique (workspace_id, client_id, piece_id, id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  piece_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 255),
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  drive_file_id text not null unique check (drive_file_id ~ '^[a-zA-Z0-9_-]{1,160}$'),
  checksum text not null check (checksum ~ '^[a-fA-F0-9]{32}$'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id, piece_id) references public.pieces(workspace_id, client_id, id),
  unique (workspace_id, client_id, piece_id, id)
);

create table public.review_assets (
  workspace_id uuid not null,
  client_id uuid not null,
  piece_id uuid not null,
  review_id uuid not null,
  asset_id uuid not null,
  position integer not null check (position >= 0),
  primary key (review_id, asset_id),
  unique (review_id, position),
  foreign key (workspace_id, client_id, piece_id, review_id) references public.reviews(workspace_id, client_id, piece_id, id),
  foreign key (workspace_id, client_id, piece_id, asset_id) references public.assets(workspace_id, client_id, piece_id, id)
);

create table public.material_request_assets (
  workspace_id uuid not null,
  client_id uuid not null,
  piece_id uuid not null,
  request_id uuid not null,
  asset_id uuid not null,
  primary key (request_id, asset_id),
  foreign key (workspace_id, client_id, piece_id, request_id) references public.material_requests(workspace_id, client_id, piece_id, id),
  foreign key (workspace_id, client_id, piece_id, asset_id) references public.assets(workspace_id, client_id, piece_id, id)
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  review_id uuid not null,
  kind text not null check (kind in ('approved', 'changes', 'comment')),
  comment text not null default '',
  author_name text not null check (length(btrim(author_name)) between 1 and 160),
  source text not null check (source in ('link', 'whatsapp')),
  recorded_by_member_id uuid,
  recorded_by_role text not null default 'staff' check (recorded_by_role = 'staff'),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  check (kind <> 'changes' or length(btrim(comment)) > 0),
  check (kind <> 'comment' or length(btrim(comment)) > 0),
  check ((source = 'whatsapp' and recorded_by_member_id is not null) or (source = 'link' and recorded_by_member_id is null)),
  foreign key (workspace_id, client_id, review_id) references public.reviews(workspace_id, client_id, id),
  foreign key (workspace_id, recorded_by_member_id, recorded_by_role) references public.members(workspace_id, id, role),
  unique (review_id, idempotency_key)
);
create unique index one_decision_per_review on public.responses (review_id) where kind in ('approved', 'changes');

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  scope text not null check (scope in ('calendar', 'review', 'material')),
  review_id uuid,
  material_request_id uuid,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at),
  check (
    (scope = 'calendar' and review_id is null and material_request_id is null) or
    (scope = 'review' and review_id is not null and material_request_id is null) or
    (scope = 'material' and review_id is null and material_request_id is not null)
  ),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  foreign key (workspace_id, client_id, review_id) references public.reviews(workspace_id, client_id, id),
  foreign key (workspace_id, client_id, material_request_id) references public.material_requests(workspace_id, client_id, id)
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  piece_id uuid not null,
  text text not null check (length(btrim(text)) > 0),
  actor text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'client')),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id, piece_id) references public.pieces(workspace_id, client_id, id)
);
create index activity_piece on public.activity (piece_id, created_at);

-- Security-definer helpers use a fixed search_path and fully qualified tables.
-- No helper accepts a user ID: identity is always auth.uid().
create function app_private.is_staff(wanted_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid())
    and m.workspace_id = wanted_workspace and m.role = 'staff' and m.active);
$$;

create function app_private.can_read_client(wanted_workspace uuid, wanted_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid())
    and m.workspace_id = wanted_workspace and m.active
    and (m.role = 'staff' or (m.role = 'client' and m.client_id = wanted_client)));
$$;

create function app_private.can_read_piece(wanted_workspace uuid, wanted_piece uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pieces p where p.id = wanted_piece and p.workspace_id = wanted_workspace
    and (app_private.is_staff(p.workspace_id) or
      (p.visible_to_client and not p.archived and app_private.can_read_client(p.workspace_id, p.client_id))));
$$;

revoke all on all functions in schema app_private from public;
grant execute on function app_private.is_staff(uuid), app_private.can_read_client(uuid, uuid), app_private.can_read_piece(uuid, uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.members enable row level security;
alter table public.pieces enable row level security;
alter table public.piece_internal_notes enable row level security;
alter table public.reviews enable row level security;
alter table public.material_requests enable row level security;
alter table public.assets enable row level security;
alter table public.review_assets enable row level security;
alter table public.material_request_assets enable row level security;
alter table public.responses enable row level security;
alter table public.shares enable row level security;
alter table public.activity enable row level security;

create policy workspaces_staff_read on public.workspaces for select to authenticated using (app_private.is_staff(id));
create policy profiles_member_read on public.profiles for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from public.members m where m.user_id = profiles.user_id and app_private.is_staff(m.workspace_id)
  )
);
create policy clients_member_read on public.clients for select to authenticated using (app_private.can_read_client(workspace_id, id));
create policy members_self_or_staff_read on public.members for select to authenticated using (
  (user_id = (select auth.uid()) and active) or app_private.is_staff(workspace_id)
);
create policy pieces_member_read on public.pieces for select to authenticated using (
  app_private.is_staff(workspace_id) or (visible_to_client and not archived and app_private.can_read_client(workspace_id, client_id))
);
create policy notes_staff_only on public.piece_internal_notes for select to authenticated using (app_private.is_staff(workspace_id));
create policy reviews_member_read on public.reviews for select to authenticated using (
  app_private.is_staff(workspace_id) or (sealed_at is not null and app_private.can_read_piece(workspace_id, piece_id))
);
create policy materials_member_read on public.material_requests for select to authenticated using (app_private.can_read_piece(workspace_id, piece_id));
-- Drive IDs and hashes are server projections, not directly client-readable metadata.
create policy assets_staff_only on public.assets for select to authenticated using (app_private.is_staff(workspace_id));
create policy review_assets_member_read on public.review_assets for select to authenticated using (
  exists (select 1 from public.reviews r where r.id = review_id and r.workspace_id = review_assets.workspace_id)
);
create policy material_assets_member_read on public.material_request_assets for select to authenticated using (app_private.can_read_piece(workspace_id, piece_id));
create policy responses_member_read on public.responses for select to authenticated using (
  exists (select 1 from public.reviews r where r.id = review_id and r.workspace_id = responses.workspace_id)
);
create policy activity_member_read on public.activity for select to authenticated using (
  app_private.is_staff(workspace_id) or (visibility = 'client' and app_private.can_read_piece(workspace_id, piece_id))
);
-- shares intentionally has NO authenticated/anon policy: only the trusted backend can resolve hashes.

revoke all on public.workspaces, public.profiles, public.clients, public.members, public.pieces,
  public.piece_internal_notes, public.reviews, public.material_requests, public.assets,
  public.review_assets, public.material_request_assets, public.responses, public.shares, public.activity
  from public, anon, authenticated;
grant select on public.workspaces, public.profiles, public.clients, public.members, public.pieces,
  public.piece_internal_notes, public.reviews, public.material_requests, public.assets,
  public.review_assets, public.material_request_assets, public.responses, public.activity to authenticated;
grant all on public.workspaces, public.profiles, public.clients, public.members, public.pieces,
  public.piece_internal_notes, public.reviews, public.material_requests, public.assets,
  public.review_assets, public.material_request_assets, public.responses, public.shares, public.activity to service_role;

create function app_private.guard_review_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.sealed_at is not null and (
    new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or
    new.piece_id is distinct from old.piece_id or new.version is distinct from old.version or
    new.caption is distinct from old.caption or new.sealed_at is distinct from old.sealed_at
  ) then raise exception 'sealed_review_immutable' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger sealed_review_snapshot before update on public.reviews for each row execute function app_private.guard_review_snapshot();

create function app_private.guard_review_assets() returns trigger
language plpgsql set search_path = '' as $$
declare target_review uuid; target_sealed_at timestamptz;
begin
  target_review := case when tg_op = 'DELETE' then old.review_id else new.review_id end;
  -- Lock serializes sealing with snapshot association changes.
  select sealed_at into target_sealed_at from public.reviews where id = target_review for update;
  if target_sealed_at is not null then raise exception 'sealed_review_assets_immutable' using errcode = '23514'; end if;
  if tg_op = 'UPDATE' and old.review_id is distinct from new.review_id then
    select sealed_at into target_sealed_at from public.reviews where id = old.review_id for update;
    if target_sealed_at is not null then raise exception 'sealed_review_assets_immutable' using errcode = '23514'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger sealed_review_asset_guard before insert or update or delete on public.review_assets for each row execute function app_private.guard_review_assets();

create function app_private.guard_verified_asset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.workspace_id, new.client_id, new.piece_id, new.drive_file_id, new.checksum, new.byte_size, new.mime_type)
    is distinct from row(old.workspace_id, old.client_id, old.piece_id, old.drive_file_id, old.checksum, old.byte_size, old.mime_type)
  then raise exception 'verified_asset_immutable' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger verified_asset_guard before update on public.assets for each row execute function app_private.guard_verified_asset();

revoke all on function app_private.guard_review_snapshot(), app_private.guard_review_assets(), app_private.guard_verified_asset() from public;

commit;
