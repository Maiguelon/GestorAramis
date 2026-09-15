begin;
alter table app_private.drive_folders add column last_synced_at timestamptz;
alter table app_private.drive_uploads add column external boolean not null default false;
alter table app_private.drive_team_assets add column available boolean not null default true;

create or replace function app_private.drive_asset_json(a app_private.drive_team_assets,u app_private.drive_uploads) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',a.id,'workspaceId',u.workspace_id,'pieceId',u.piece_id,'clientId',u.client_id,
    'name',u.name,'mimeType',u.mime_type,'size',u.byte_size,'driveFileId',u.drive_file_id,'folderId',u.folder_id,
    'generation',u.generation,'checksum',a.checksum,'driveRevisionId',a.drive_revision_id,'createdAt',a.created_at,'external',u.external);
$$;

-- Preserve the existing function, its security checks and grants. Fail closed on schema drift.
do $$ declare definition text; begin
  select pg_get_functiondef('public.aramis_drive(uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if position('where a.workspace_id=p_workspace_id' in definition)=0 then raise exception 'Drive RPC anchor missing'; end if;
  definition:=replace(definition,'where a.workspace_id=p_workspace_id','where a.available and a.workspace_id=p_workspace_id');
  execute definition;
end $$;

create function public.aramis_drive_import(p_workspace_id uuid,p_user_id uuid,p_piece_id uuid,p_folder_id text,p_generation uuid,p_started_at timestamptz,p_files jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  piece public.pieces; member_id uuid; actor text; f jsonb; u app_private.drive_uploads;
  changed boolean:=false; removed integer; existing_checksum text; was_available boolean;
begin
  perform 1 from public.workspaces where id=p_workspace_id for update;
  select m.id,pr.display_name into member_id,actor from public.members m join public.profiles pr on pr.user_id=m.user_id
    where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role='staff' and m.active;
  if member_id is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select p.* into piece from public.pieces p join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
    where p.workspace_id=p_workspace_id and p.id=p_piece_id and not p.archived and c.archived_at is null for update of p;
  if piece.id is null then raise exception 'NOT_FOUND'; end if;
  if not exists(select 1 from app_private.drive_connections where workspace_id=p_workspace_id and generation=p_generation)
    then raise exception 'CONFLICT'; end if;
  if not exists(select 1 from app_private.drive_folders where workspace_id=p_workspace_id and folder_id=p_folder_id
    and logical_key in ('piece:'||p_piece_id::text,'piece:'||p_piece_id::text||':material')) then raise exception 'FOLDER_NOT_FOUND'; end if;
  if p_started_at is null or p_started_at>now()+interval '1 minute' then raise exception 'VALIDATION'; end if;
  if exists(select 1 from app_private.drive_folders where workspace_id=p_workspace_id and folder_id=p_folder_id and last_synced_at>=p_started_at) then return jsonb_build_object('changed',false); end if;
  if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)>10000 then raise exception 'VALIDATION'; end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_files) x) then raise exception 'VALIDATION'; end if;
  for f in select value from jsonb_array_elements(p_files) loop
    perform app_private.check_object(f,array['id','name','mimeType','size','checksum']);
    if coalesce(f->>'id','') !~ '^[a-zA-Z0-9_-]{1,160}$' or length(btrim(coalesce(f->>'name',''))) not between 1 and 240
      or coalesce(f->>'checksum','') !~ '^[a-f0-9]{32}$' or coalesce(f->>'mimeType','') !~ '^(video/|image/|application/pdf$)'
      or jsonb_typeof(f->'size') is distinct from 'number' or (f->>'size')::numeric<>trunc((f->>'size')::numeric)
      or (f->>'size')::numeric not between 1 and 2147483648 then raise exception 'VALIDATION'; end if;
    select * into u from app_private.drive_uploads where workspace_id=p_workspace_id and drive_file_id=f->>'id';
    if u.upload_id is not null and (not u.external or u.piece_id<>p_piece_id or u.folder_id<>p_folder_id) then continue; end if;
    if u.upload_id is null then
      insert into app_private.drive_uploads(upload_id,workspace_id,user_id,piece_id,client_id,name,mime_type,byte_size,
        fingerprint,drive_file_id,folder_id,generation,status,byte_offset,external)
        values(gen_random_uuid(),p_workspace_id,p_user_id,p_piece_id,piece.client_id,f->>'name',f->>'mimeType',(f->>'size')::bigint,
          'drive-import:'||(f->>'id'),f->>'id',p_folder_id,p_generation,'complete',(f->>'size')::bigint,true) returning * into u;
      insert into app_private.drive_team_assets(id,workspace_id,checksum) values(u.upload_id,p_workspace_id,f->>'checksum');
      changed:=true;
    else
      select checksum,available into existing_checksum,was_available from app_private.drive_team_assets where id=u.upload_id;
      if u.name is distinct from f->>'name' or u.mime_type is distinct from f->>'mimeType' or u.byte_size<>(f->>'size')::bigint
        or existing_checksum is distinct from f->>'checksum' or not was_available then
        update app_private.drive_uploads set name=f->>'name',mime_type=f->>'mimeType',byte_size=(f->>'size')::bigint,
          byte_offset=(f->>'size')::bigint,updated_at=now() where upload_id=u.upload_id;
        update app_private.drive_team_assets set checksum=f->>'checksum',available=true where id=u.upload_id;
        changed:=true;
      end if;
    end if;
  end loop;
  update app_private.drive_team_assets a set available=false from app_private.drive_uploads stored_upload
    where a.id=stored_upload.upload_id and a.workspace_id=p_workspace_id and stored_upload.external and stored_upload.piece_id=p_piece_id and stored_upload.folder_id=p_folder_id
      and a.available and not exists(select 1 from jsonb_array_elements(p_files) x where x->>'id'=stored_upload.drive_file_id);
  get diagnostics removed=row_count;
  if changed or removed>0 then
    update public.pieces set revision=revision+1,updated_at=now() where id=p_piece_id;
    insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
      values(p_workspace_id,piece.client_id,p_piece_id,'Material actualizado desde Drive.',actor,'internal');
  end if;
  update app_private.drive_folders set last_synced_at=p_started_at where workspace_id=p_workspace_id and folder_id=p_folder_id;
  return jsonb_build_object('changed',changed or removed>0);
end $$;
revoke all on function public.aramis_drive_import(uuid,uuid,uuid,text,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.aramis_drive_import(uuid,uuid,uuid,text,uuid,timestamptz,jsonb) to service_role;
commit;
