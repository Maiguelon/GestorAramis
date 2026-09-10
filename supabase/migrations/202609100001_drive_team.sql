-- Internal Drive bridge. Only the server may call this RPC after verifying Auth.
-- Tokens, OAuth verifiers and resumable URLs are encrypted before reaching SQL.
begin;

create function app_private.check_drive_cipher(value jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  perform app_private.check_object(value,array['iv','ciphertext']);
  if jsonb_typeof(value->'iv') is distinct from 'array'
    or jsonb_typeof(value->'ciphertext') is distinct from 'array' then raise exception 'VALIDATION'; end if;
  if jsonb_array_length(value->'iv')<>12 or jsonb_array_length(value->'ciphertext') not between 16 and 131072
    then raise exception 'VALIDATION'; end if;
  if exists(select 1 from jsonb_array_elements((value->'iv')||(value->'ciphertext')) x
    where jsonb_typeof(x)<>'number' or x::text !~ '^[0-9]{1,3}$' or (x::text)::integer>255)
    then raise exception 'VALIDATION'; end if;
end;
$$;
revoke all on function app_private.check_drive_cipher(jsonb) from public, anon, authenticated;

create table app_private.drive_connections (
  workspace_id uuid primary key references public.workspaces(id),
  generation uuid not null,
  encrypted_tokens jsonb not null,
  account_email text not null check (length(account_email) between 3 and 320),
  account_permission_id text not null check (account_permission_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  root_folder_id text check (root_folder_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  updated_at timestamptz not null default now()
);
create table app_private.drive_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  encrypted_payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index drive_oauth_states_expiry on app_private.drive_oauth_states(expires_at);
create table app_private.drive_folders (
  workspace_id uuid not null references public.workspaces(id),
  logical_key text not null check (length(logical_key) between 1 and 800),
  folder_id text not null check (folder_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  parent_id text check (parent_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  name text check (length(btrim(name)) between 1 and 240),
  created_at timestamptz not null default now(),
  primary key(workspace_id,logical_key),
  unique(workspace_id,folder_id)
);
create table app_private.drive_uploads (
  upload_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  piece_id uuid not null,
  client_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 240),
  mime_type text not null check (mime_type ~ '^[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+$'),
  byte_size bigint not null check (byte_size between 1 and 10737418240),
  fingerprint text not null check (length(fingerprint) between 1 and 1024),
  drive_file_id text not null check (drive_file_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  folder_id text not null check (folder_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  generation uuid not null,
  encrypted_session jsonb,
  byte_offset bigint not null default 0,
  status text not null default 'uploading' check (status in ('uploading','expired','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (byte_offset between 0 and byte_size),
  foreign key(workspace_id,client_id,piece_id) references public.pieces(workspace_id,client_id,id),
  unique(workspace_id,drive_file_id),
  unique(workspace_id,upload_id)
);
create index drive_uploads_owner on app_private.drive_uploads(workspace_id,user_id,piece_id);
-- This table deliberately does not participate in public review/material assets.
create table app_private.drive_team_assets (
  id uuid primary key,
  workspace_id uuid not null,
  checksum text not null check (checksum ~ '^[a-fA-F0-9]{32}$'),
  drive_revision_id text check (drive_revision_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,id) references app_private.drive_uploads(workspace_id,upload_id)
);
alter table app_private.drive_connections enable row level security;
alter table app_private.drive_oauth_states enable row level security;
alter table app_private.drive_folders enable row level security;
alter table app_private.drive_uploads enable row level security;
alter table app_private.drive_team_assets enable row level security;
revoke all on app_private.drive_connections,app_private.drive_oauth_states,app_private.drive_folders,
  app_private.drive_uploads,app_private.drive_team_assets from public,anon,authenticated,service_role;

create function app_private.drive_upload_json(u app_private.drive_uploads) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('uploadId',u.upload_id,'workspaceId',u.workspace_id,'userId',u.user_id,
    'pieceId',u.piece_id,'clientId',u.client_id,'name',u.name,'mimeType',u.mime_type,'size',u.byte_size,
    'fingerprint',u.fingerprint,'driveFileId',u.drive_file_id,'folderId',u.folder_id,'generation',u.generation,
    'encryptedSession',u.encrypted_session,'offset',u.byte_offset,'status',u.status,'createdAt',u.created_at,'updatedAt',u.updated_at);
$$;
create function app_private.drive_asset_json(a app_private.drive_team_assets,u app_private.drive_uploads) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',a.id,'workspaceId',u.workspace_id,'pieceId',u.piece_id,'clientId',u.client_id,
    'name',u.name,'mimeType',u.mime_type,'size',u.byte_size,'driveFileId',u.drive_file_id,'folderId',u.folder_id,
    'generation',u.generation,'checksum',a.checksum,'driveRevisionId',a.drive_revision_id,'createdAt',a.created_at);
$$;
revoke all on function app_private.drive_upload_json(app_private.drive_uploads),
  app_private.drive_asset_json(app_private.drive_team_assets,app_private.drive_uploads) from public,anon,authenticated;

create function public.aramis_drive(p_workspace_id uuid,p_user_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid; v_actor text; v_connection app_private.drive_connections; v_state app_private.drive_oauth_states;
  v_folder app_private.drive_folders; v_upload app_private.drive_uploads; v_asset app_private.drive_team_assets;
  v_piece public.pieces; v_id uuid; v_generation uuid; v_expected uuid; v_json jsonb; v_offset bigint;
begin
  -- Match the lock order of aramis_command; serialize completion against edits/archive.
  perform 1 from public.workspaces where id=p_workspace_id for update;
  select m.id,pr.display_name into v_member,v_actor from public.members m
    join public.profiles pr on pr.user_id=m.user_id
    where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role='staff' and m.active for share of m;
  if v_member is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'VALIDATION'; end if;

  if p_action in ('connection-get','connection-save') then
    select * into v_connection from app_private.drive_connections where workspace_id=p_workspace_id;
    if p_action='connection-save' then
      perform app_private.check_object(p_payload,array['expectedGeneration','generation','encryptedTokens','accountEmail','accountPermissionId','rootFolderId']);
      perform app_private.check_drive_cipher(p_payload->'encryptedTokens');
      v_generation:=(p_payload->>'generation')::uuid;
      v_expected:=(p_payload->>'expectedGeneration')::uuid;
      if v_generation is null or not (p_payload ? 'expectedGeneration') then raise exception 'VALIDATION'; end if;
      if v_connection.workspace_id is null then
        if v_expected is not null then raise exception 'CONFLICT'; end if;
      else
        if v_expected is distinct from v_connection.generation then raise exception 'CONFLICT'; end if;
        if p_payload->>'accountPermissionId' is distinct from v_connection.account_permission_id then raise exception 'ACCOUNT_CONFLICT'; end if;
        -- Reauthorization and token refresh retain the folder/upload namespace.
        if v_generation<>v_connection.generation then raise exception 'CONFLICT'; end if;
        if v_connection.root_folder_id is not null and p_payload->>'rootFolderId' is distinct from v_connection.root_folder_id
          then raise exception 'FOLDER_CONFLICT'; end if;
      end if;
      insert into app_private.drive_connections(workspace_id,generation,encrypted_tokens,account_email,account_permission_id,root_folder_id)
        values(p_workspace_id,v_generation,p_payload->'encryptedTokens',p_payload->>'accountEmail',p_payload->>'accountPermissionId',p_payload->>'rootFolderId')
        on conflict(workspace_id) do update set encrypted_tokens=excluded.encrypted_tokens,account_email=excluded.account_email,
          root_folder_id=excluded.root_folder_id,updated_at=now() returning * into v_connection;
    else perform app_private.check_object(p_payload,array[]::text[]); end if;
    if v_connection.workspace_id is null then return null; end if;
    return jsonb_build_object('generation',v_connection.generation,'encryptedTokens',v_connection.encrypted_tokens,
      'accountEmail',v_connection.account_email,'accountPermissionId',v_connection.account_permission_id,
      'rootFolderId',v_connection.root_folder_id,'updatedAt',v_connection.updated_at);
  elsif p_action='state-put' then
    perform app_private.check_object(p_payload,array['stateHash','encryptedPayload','expiresAt']);
    perform app_private.check_drive_cipher(p_payload->'encryptedPayload');
    if (p_payload->>'expiresAt')::timestamptz is null or (p_payload->>'expiresAt')::timestamptz<=now()
      or (p_payload->>'expiresAt')::timestamptz>now()+interval '1 hour' then raise exception 'VALIDATION'; end if;
    delete from app_private.drive_oauth_states where workspace_id=p_workspace_id and expires_at<=now();
    insert into app_private.drive_oauth_states(state_hash,workspace_id,user_id,encrypted_payload,expires_at)
      values(p_payload->>'stateHash',p_workspace_id,p_user_id,p_payload->'encryptedPayload',(p_payload->>'expiresAt')::timestamptz);
    return jsonb_build_object('stored',true);
  elsif p_action='state-take' then
    perform app_private.check_object(p_payload,array['stateHash']);
    delete from app_private.drive_oauth_states where state_hash=p_payload->>'stateHash' and workspace_id=p_workspace_id
      and user_id=p_user_id returning * into v_state;
    if v_state.state_hash is null or v_state.expires_at<=now() then return null; end if;
    return jsonb_build_object('stateHash',v_state.state_hash,'encryptedPayload',v_state.encrypted_payload,'expiresAt',v_state.expires_at);
  elsif p_action in ('folder-get','folder-put') then
    perform app_private.check_object(p_payload,case when p_action='folder-put' then array['logicalKey','folderId','parentId','name'] else array['logicalKey'] end);
    if p_action='folder-put' then
      if not exists(select 1 from app_private.drive_connections where workspace_id=p_workspace_id) then raise exception 'DRIVE_NOT_CONNECTED'; end if;
      -- A racing caller must use the winning reservation before creating in Drive.
      insert into app_private.drive_folders(workspace_id,logical_key,folder_id,parent_id,name)
        values(p_workspace_id,p_payload->>'logicalKey',p_payload->>'folderId',p_payload->>'parentId',p_payload->>'name')
        on conflict(workspace_id,logical_key) do nothing;
    end if;
    select * into v_folder from app_private.drive_folders where workspace_id=p_workspace_id and logical_key=p_payload->>'logicalKey';
    if v_folder.logical_key is null then return null; end if;
    return jsonb_build_object('logicalKey',v_folder.logical_key,'folderId',v_folder.folder_id,'parentId',v_folder.parent_id,'name',v_folder.name);
  elsif p_action in ('list-assets','get-asset') then
    perform app_private.check_object(p_payload,case when p_action='list-assets' then array['pieceId'] else array['assetId'] end);
    if p_action='get-asset' then
      select app_private.drive_asset_json(a,u) into v_json from app_private.drive_team_assets a
        join app_private.drive_uploads u on u.upload_id=a.id and u.workspace_id=a.workspace_id
        join public.pieces p on p.id=u.piece_id and p.workspace_id=u.workspace_id
        join public.clients c on c.id=u.client_id and c.workspace_id=u.workspace_id
        where a.workspace_id=p_workspace_id and a.id=(p_payload->>'assetId')::uuid and not p.archived and c.archived_at is null;
      return v_json;
    end if;
    if p_payload->>'pieceId' is not null and not exists(select 1 from public.pieces p join public.clients c
      on c.id=p.client_id and c.workspace_id=p.workspace_id where p.id=(p_payload->>'pieceId')::uuid
      and p.workspace_id=p_workspace_id and not p.archived and c.archived_at is null) then raise exception 'NOT_FOUND'; end if;
    select coalesce(jsonb_agg(app_private.drive_asset_json(a,u) order by a.created_at,a.id),'[]'::jsonb) into v_json
      from app_private.drive_team_assets a join app_private.drive_uploads u on u.upload_id=a.id and u.workspace_id=a.workspace_id
      join public.pieces p on p.id=u.piece_id and p.workspace_id=u.workspace_id
      join public.clients c on c.id=u.client_id and c.workspace_id=u.workspace_id
      where a.workspace_id=p_workspace_id and not p.archived and c.archived_at is null
        and (p_payload->>'pieceId' is null or u.piece_id=(p_payload->>'pieceId')::uuid);
    return v_json;
  elsif p_action in ('upload-put','upload-get','upload-update','upload-complete') then
    v_id:=(p_payload->>'uploadId')::uuid;
    if v_id is null then raise exception 'VALIDATION'; end if;
    select * into v_upload from app_private.drive_uploads where upload_id=v_id;
    if v_upload.upload_id is not null and (v_upload.workspace_id<>p_workspace_id or v_upload.user_id<>p_user_id)
      then raise exception 'NOT_FOUND'; end if;
    if p_action='upload-put' then
      perform app_private.check_object(p_payload,array['uploadId','pieceId','name','mimeType','size','fingerprint','driveFileId','folderId','generation','encryptedSession']);
      select p.* into v_piece from public.pieces p join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
        where p.id=(p_payload->>'pieceId')::uuid and p.workspace_id=p_workspace_id and not p.archived and c.archived_at is null for update of p;
      if v_piece.id is null then raise exception 'NOT_FOUND'; end if;
      if not exists(select 1 from app_private.drive_connections where workspace_id=p_workspace_id
        and generation=(p_payload->>'generation')::uuid) then raise exception 'DRIVE_NOT_CONNECTED'; end if;
      if not exists(select 1 from app_private.drive_folders where workspace_id=p_workspace_id and folder_id=p_payload->>'folderId')
        then raise exception 'FOLDER_NOT_FOUND'; end if;
      if jsonb_typeof(p_payload->'size') is distinct from 'number' or (p_payload->>'size')::numeric<>trunc((p_payload->>'size')::numeric)
        then raise exception 'VALIDATION'; end if;
      if p_payload->'encryptedSession' is not null and p_payload->'encryptedSession'<>'null'::jsonb
        then perform app_private.check_drive_cipher(p_payload->'encryptedSession'); end if;
      if v_upload.upload_id is not null then
        if v_upload.piece_id is distinct from (p_payload->>'pieceId')::uuid or v_upload.name is distinct from p_payload->>'name'
          or v_upload.mime_type is distinct from p_payload->>'mimeType' or v_upload.byte_size is distinct from (p_payload->>'size')::bigint
          or v_upload.fingerprint is distinct from p_payload->>'fingerprint'
          or v_upload.folder_id is distinct from p_payload->>'folderId' or v_upload.generation is distinct from (p_payload->>'generation')::uuid
          then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
        -- Concurrent initiators may each pre-generate an ID. Always return the
        -- first reservation; callers must use its driveFileId for external IO.
      else
        insert into app_private.drive_uploads(upload_id,workspace_id,user_id,piece_id,client_id,name,mime_type,byte_size,
          fingerprint,drive_file_id,folder_id,generation,encrypted_session)
          values(v_id,p_workspace_id,p_user_id,v_piece.id,v_piece.client_id,p_payload->>'name',p_payload->>'mimeType',(p_payload->>'size')::bigint,
            p_payload->>'fingerprint',p_payload->>'driveFileId',p_payload->>'folderId',(p_payload->>'generation')::uuid,nullif(p_payload->'encryptedSession','null'::jsonb))
          returning * into v_upload;
      end if;
      return app_private.drive_upload_json(v_upload);
    end if;
    if v_upload.upload_id is null then
      if p_action='upload-get' then return null; else raise exception 'NOT_FOUND'; end if;
    end if;
    select p.* into v_piece from public.pieces p join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
      where p.id=v_upload.piece_id and p.workspace_id=p_workspace_id and not p.archived and c.archived_at is null for update of p;
    if v_piece.id is null then raise exception 'NOT_FOUND'; end if;
    if p_action='upload-get' then
      perform app_private.check_object(p_payload,array['uploadId']);
      return app_private.drive_upload_json(v_upload);
    elsif p_action='upload-update' then
      perform app_private.check_object(p_payload,array['uploadId','encryptedSession','offset','status']);
      if v_upload.status='complete' then return app_private.drive_upload_json(v_upload); end if;
      if p_payload ? 'encryptedSession' then perform app_private.check_drive_cipher(p_payload->'encryptedSession'); end if;
      if p_payload ? 'status' and (p_payload->>'status' is null or p_payload->>'status' not in ('uploading','expired')) then raise exception 'VALIDATION'; end if;
      -- The null -> session transition is compare-and-set. A losing initiator
      -- receives the winner, including its offset/status, without changing it.
      if p_payload ? 'encryptedSession' and v_upload.encrypted_session is not null
        then return app_private.drive_upload_json(v_upload); end if;
      v_offset:=coalesce((p_payload->>'offset')::bigint,v_upload.byte_offset);
      if (p_payload ? 'offset' and (jsonb_typeof(p_payload->'offset') is distinct from 'number' or (p_payload->>'offset')::numeric<>trunc((p_payload->>'offset')::numeric)))
        or v_offset<v_upload.byte_offset or v_offset>v_upload.byte_size then raise exception 'CONFLICT'; end if;
      update app_private.drive_uploads set encrypted_session=coalesce(encrypted_session,p_payload->'encryptedSession'),
        byte_offset=v_offset,status=coalesce(p_payload->>'status',status),updated_at=now() where upload_id=v_id returning * into v_upload;
      return app_private.drive_upload_json(v_upload);
    else
      perform app_private.check_object(p_payload,array['uploadId','asset']);
      v_json:=p_payload->'asset';
      perform app_private.check_object(v_json,array['driveFileId','checksum','driveRevisionId','mimeType','size']);
      if v_json->>'driveFileId' is distinct from v_upload.drive_file_id or v_json->>'mimeType' is distinct from v_upload.mime_type
        or jsonb_typeof(v_json->'size') is distinct from 'number' or (v_json->>'size')::numeric<>v_upload.byte_size then raise exception 'ASSET_MISMATCH'; end if;
      select * into v_asset from app_private.drive_team_assets where id=v_id and workspace_id=p_workspace_id;
      if v_asset.id is not null then
        if v_asset.checksum is distinct from lower(v_json->>'checksum') or v_asset.drive_revision_id is distinct from v_json->>'driveRevisionId'
          then raise exception 'ASSET_MISMATCH'; end if;
        return app_private.drive_asset_json(v_asset,v_upload);
      end if;
      insert into app_private.drive_team_assets(id,workspace_id,checksum,drive_revision_id)
        values(v_id,p_workspace_id,lower(v_json->>'checksum'),v_json->>'driveRevisionId') returning * into v_asset;
      update app_private.drive_uploads set byte_offset=byte_size,status='complete',encrypted_session=null,updated_at=now()
        where upload_id=v_id returning * into v_upload;
      update public.pieces set revision=revision+1,updated_at=now() where id=v_piece.id;
      insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
        values(p_workspace_id,v_piece.client_id,v_piece.id,'Material agregado: '||v_upload.name||'.',v_actor,'internal');
      return app_private.drive_asset_json(v_asset,v_upload);
    end if;
  end if;
  raise exception 'UNKNOWN_ACTION';
end;
$$;
revoke all on function public.aramis_drive(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aramis_drive(uuid,uuid,text,jsonb) to service_role;
commit;
