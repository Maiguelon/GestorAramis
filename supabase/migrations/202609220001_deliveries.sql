-- Internal deliveries are private; client approvals remain a separate integration.
begin;
create table app_private.deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  piece_id uuid not null references public.pieces(id),
  version integer not null check (version>0),
  caption text not null,
  assets jsonb not null check (jsonb_typeof(assets)='array'),
  status text not null check (status in ('pending','approved','changes')),
  created_at timestamptz not null default now(),
  created_by text not null,
  comment text not null default '',
  source text check (source in ('team','client')),
  decided_by text,
  decided_at timestamptz,
  unique(piece_id,version)
);
alter table app_private.deliveries enable row level security;
revoke all on app_private.deliveries from public,anon,authenticated;

create function app_private.piece_deliveries(target uuid) returns jsonb
language sql stable set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'version',d.version,'caption',d.caption,
 'assets',d.assets,'status',d.status,'createdAt',d.created_at,'createdBy',d.created_by,
 'comment',d.comment,'source',d.source,'decidedBy',d.decided_by,'decidedAt',d.decided_at) order by d.version desc),'[]'::jsonb)
 from app_private.deliveries d where d.piece_id=target;
$$;
revoke all on function app_private.piece_deliveries(uuid) from public,anon,authenticated;

-- Called inside aramis_command's membership check, workspace lock and idempotency receipt.
create function app_private.delivery_command(w uuid,command jsonb,actor text) returns uuid
language plpgsql set search_path = '' as $$
declare p public.pieces; d app_private.deliveries; expected numeric; files jsonb; item jsonb; ids jsonb;
  target uuid; n integer; decision text; note text; origin text;
begin
 perform app_private.check_object(command,case when command->>'type'='submit-delivery'
   then array['type','pieceId','expectedRevision','assetIds']
   else array['type','pieceId','expectedRevision','deliveryId','decision','comment','source'] end);
 select x.* into p from public.pieces x join public.clients c on c.id=x.client_id and c.workspace_id=x.workspace_id
 where x.id=(command->>'pieceId')::uuid and x.workspace_id=w and not x.archived and c.archived_at is null for update of x;
 if p.id is null then raise exception 'NOT_FOUND'; end if;
 if jsonb_typeof(command->'expectedRevision') is distinct from 'number' then raise exception 'VALIDATION'; end if;
 expected:=(command->>'expectedRevision')::numeric;
 if expected<>p.revision then raise exception 'CONFLICT'; end if;
 select * into d from app_private.deliveries where piece_id=p.id order by version desc limit 1;
 if command->>'type'='submit-delivery' then
   if p.status<>'production' then raise exception 'INVALID_TRANSITION'; end if;
   ids:=command->'assetIds';
   if jsonb_typeof(ids) is distinct from 'array' then raise exception 'VALIDATION'; end if;
   n:=jsonb_array_length(ids);
   if n not between 1 and 100 or (select count(distinct x) from jsonb_array_elements_text(ids) x)<>n then raise exception 'DELIVERY_FILES_REQUIRED'; end if;
   files:='[]'::jsonb;
   for item in select value from jsonb_array_elements(ids) loop
     if jsonb_typeof(item)<>'string' then raise exception 'VALIDATION'; end if;
     target:=(item#>>'{}')::uuid;
     select jsonb_build_object('id',a.id,'name',u.name,'mimeType',u.mime_type,'size',u.byte_size,'source','drive') into item
       from app_private.drive_team_assets a join app_private.drive_uploads u on u.upload_id=a.id and u.workspace_id=a.workspace_id
       join app_private.drive_folders f on f.workspace_id=u.workspace_id and f.folder_id=u.folder_id
       join app_private.drive_connections co on co.workspace_id=u.workspace_id and co.generation=u.generation
       where a.id=target and a.workspace_id=w and u.piece_id=p.id and a.available and a.drive_revision_id is not null and u.status='complete' and not u.external
       and f.logical_key='piece:'||p.id::text||':delivery';
     if item is null then raise exception 'DELIVERY_FILES_REQUIRED'; end if;
     files:=files||jsonb_build_array(item);
   end loop;
   insert into app_private.deliveries(workspace_id,piece_id,version,caption,assets,status,created_by)
     values(w,p.id,coalesce(d.version,0)+1,coalesce((select caption from public.piece_drafts where piece_id=p.id),''),files,'pending',actor);
   update public.pieces set status='review',revision=revision+1,updated_at=now() where id=p.id;
   update public.piece_production set work_area='marketing' where piece_id=p.id;
   note:='Entrega v'||(coalesce(d.version,0)+1)||' enviada a revisión.';
 else
   if d.id is null or d.id is distinct from (command->>'deliveryId')::uuid then raise exception 'CONFLICT'; end if;
   decision:=command->>'decision'; origin:=command->>'source';
   if decision is null or decision not in ('approved','changes') or origin is null or origin not in ('team','client')
     or jsonb_typeof(command->'comment') is distinct from 'string' then raise exception 'VALIDATION'; end if;
   note:=btrim(command->>'comment');
   if length(note)>10000 or (decision='changes' and length(note)=0) then raise exception 'CHANGE_REASON_REQUIRED'; end if;
   if (decision='approved' and (p.status<>'review' or d.status<>'pending'))
     or (decision='changes' and (p.status not in ('review','approved','scheduled') or d.status not in ('pending','approved')))
     then raise exception 'INVALID_TRANSITION'; end if;
   update app_private.deliveries set status=decision,comment=note,source=origin,decided_by=actor,decided_at=now() where id=d.id;
   update public.pieces set status=case when decision='changes' then 'production' else 'approved' end,
     revision=revision+1,updated_at=now() where id=p.id;
   update public.piece_production set work_area=case when decision='changes' then 'design' else 'marketing' end,
     production_stage=case when decision='changes' then 'ready' else production_stage end where piece_id=p.id;
   note:=case when decision='changes' then 'Cambios solicitados' else 'Entrega aprobada' end||' en v'||d.version||
     case when origin='client' then ' (cliente, registrado por el equipo)' else ' (equipo)' end||case when note<>'' then ': '||note else '.' end;
 end if;
 insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility) values(w,p.client_id,p.id,note,actor,'internal');
 return p.id;
end $$;
revoke all on function app_private.delivery_command(uuid,jsonb,text) from public,anon,authenticated;

-- Extend definitions while retaining the existing authorization and receipt boundary.
do $migration$
declare body text; item record;
begin
 body:=pg_get_functiondef('public.aramis_workspace(uuid)'::regprocedure);
 if strpos(body,'''teamAssets'',''[]''::jsonb')=0 then raise exception 'Workspace anchor missing'; end if;
 execute replace(body,'''teamAssets'',''[]''::jsonb','''deliveries'',app_private.piece_deliveries(p.id),''teamAssets'',''[]''::jsonb');
 body:=pg_get_functiondef('public.aramis_command(uuid,jsonb,uuid)'::regprocedure);
 for item in select * from (values
 ($old$'generate-month','create-piece','update-piece') then raise exception 'FEATURE_UNAVAILABLE'$old$,
  $new$'generate-month','create-piece','update-piece','submit-delivery','review-delivery') then raise exception 'FEATURE_UNAVAILABLE'$new$),
 ($old$  if v_type in ('create-client','update-client') then$old$,
  $new$  if v_type in ('submit-delivery','review-delivery') then
    v_id:=app_private.delivery_command(p_workspace_id,p_command,v_actor);
  elsif v_type in ('create-client','update-client') then$new$),
 ($old$    if v_data ? 'status' then
      if v_status in ('review','approved')$old$,
  $new$    if exists(select 1 from app_private.deliveries where piece_id=v_id) and v_piece.status in ('review','approved','scheduled','published')
      and (v_caption_changed or (v_status<>v_piece.status and v_status not in ('scheduled','published')))
      then raise exception 'DELIVERY_LOCKED'; end if;
    if v_data ? 'status' then
      if v_status in ('review','approved')$new$),
 ($old$if v_review.id is null or v_review.status<>'approved' or v_review.sealed_at is null or v_review.caption<>v_caption or v_caption_changed then raise exception 'APPROVAL_REQUIRED'; end if;$old$,
  $new$if (v_review.id is null or v_review.status<>'approved' or v_review.sealed_at is null or v_review.caption<>v_caption or v_caption_changed)
          and not exists(select 1 from app_private.deliveries d where d.piece_id=v_id and d.status='approved' and d.caption=v_caption and not v_caption_changed
            and d.version=(select max(version) from app_private.deliveries where piece_id=v_id)) then raise exception 'APPROVAL_REQUIRED'; end if;$new$)
 ) as replacements(before_text,after_text) loop
   if strpos(body,item.before_text)=0 then raise exception 'Command anchor missing: %',item.before_text; end if;
   body:=replace(body,item.before_text,item.after_text);
 end loop;
 execute body;
end $migration$;

-- Purpose is derived from the reserved folder, never supplied by the browser on completion.
create function app_private.upload_purpose(u app_private.drive_uploads) returns text
language sql stable set search_path='' as $$
 select case when exists(select 1 from app_private.drive_folders f where f.workspace_id=u.workspace_id and f.folder_id=u.folder_id
   and f.logical_key='piece:'||u.piece_id::text||':delivery') then 'delivery' else 'material' end;
$$;
revoke all on function app_private.upload_purpose(app_private.drive_uploads) from public,anon,authenticated;
do $$ declare body text; begin
 body:=pg_get_functiondef('app_private.drive_asset_json(app_private.drive_team_assets,app_private.drive_uploads)'::regprocedure);
 if strpos(body,'''id'', a.id')>0 then body:=replace(body,'''id'', a.id','''purpose'',app_private.upload_purpose(u),''id'', a.id');
 elsif strpos(body,'''id'',a.id')>0 then body:=replace(body,'''id'',a.id','''purpose'',app_private.upload_purpose(u),''id'',a.id');
 else raise exception 'Asset anchor missing'; end if;
 body:=replace(body,'IMMUTABLE','STABLE'); execute body;
 body:=pg_get_functiondef('app_private.drive_upload_json(app_private.drive_uploads)'::regprocedure);
 if strpos(body,'''uploadId'',u.upload_id')=0 then raise exception 'Upload anchor missing'; end if;
 body:=replace(body,'''uploadId'',u.upload_id','''purpose'',app_private.upload_purpose(u),''uploadId'',u.upload_id');
 body:=replace(body,'IMMUTABLE','STABLE'); execute body;
end $$;
commit;
