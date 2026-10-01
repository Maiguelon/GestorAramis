-- Staff history is read-only until an explicit restore command returns the piece to planning.
begin;

-- Keep the original delivery decision intact; it no longer authorizes resumed work.
alter table app_private.deliveries add column invalidated_at timestamptz;

create function app_private.restore_piece_command(w uuid,command jsonb,actor text) returns uuid
language plpgsql set search_path = '' as $$
declare p public.pieces; expected numeric; restored_at timestamptz := statement_timestamp();
begin
  perform app_private.check_object(command,array['type','pieceId','expectedRevision']);
  select x.* into p from public.pieces x join public.clients c on c.id=x.client_id and c.workspace_id=x.workspace_id
    where x.id=(command->>'pieceId')::uuid and x.workspace_id=w and c.archived_at is null for update of x;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(command->'expectedRevision') is distinct from 'number' then raise exception 'VALIDATION'; end if;
  expected := (command->>'expectedRevision')::numeric;
  if expected<>trunc(expected) or expected<0 then raise exception 'VALIDATION'; end if;
  if expected<>p.revision then raise exception 'CONFLICT'; end if;
  if not p.archived then raise exception 'INVALID_TRANSITION'; end if;

  update public.reviews set status='superseded' where piece_id=p.id and status in ('pending','approved');
  update app_private.deliveries set invalidated_at=coalesce(invalidated_at,restored_at)
    where piece_id=p.id and status in ('pending','approved');
  update public.shares s set revoked_at=coalesce(revoked_at,restored_at) where s.workspace_id=w and
    ((s.scope='review' and s.review_id in(select id from public.reviews where piece_id=p.id)) or
     (s.scope='material' and s.material_request_id in(select id from public.material_requests where piece_id=p.id)));
  update public.pieces set archived=false,status='planned',visible_to_client=false,revision=revision+1,updated_at=restored_at where id=p.id;
  insert into public.piece_production(piece_id,workspace_id,plan_month,work_area,production_stage)
    values(p.id,w,to_char(coalesce(p.planned_date,(p.created_at at time zone 'UTC')::date),'YYYY-MM'),'marketing','ready')
    on conflict(piece_id) do update set work_area='marketing',production_stage='ready';
  insert into public.activity(workspace_id,client_id,piece_id,text,actor,created_at,visibility)
    values(w,p.client_id,p.id,'Contenido recuperado a planificación.',actor,restored_at,'internal');
  return p.id;
end $$;
revoke all on function app_private.restore_piece_command(uuid,jsonb,text) from public,anon,authenticated;

-- Preserve all earlier logo/delivery patches and the membership/lock/receipt boundary.
do $migration$
declare body text; item record;
begin
  body:=pg_get_functiondef('app_private.piece_deliveries(uuid)'::regprocedure);
  if strpos(body,'''decidedAt'',d.decided_at')=0 then raise exception 'Delivery projection anchor missing'; end if;
  execute replace(body,'''decidedAt'',d.decided_at','''decidedAt'',d.decided_at,''invalidatedAt'',d.invalidated_at');

  body:=pg_get_functiondef('public.aramis_command(uuid,jsonb,uuid)'::regprocedure);
  for item in select * from (values
    ($old$'submit-delivery','review-delivery') then raise exception 'FEATURE_UNAVAILABLE'$old$,
     $new$'submit-delivery','review-delivery','restore-piece') then raise exception 'FEATURE_UNAVAILABLE'$new$),
    ($old$  if v_type in ('submit-delivery','review-delivery') then$old$,
     $new$  if v_type='restore-piece' then
    v_id:=app_private.restore_piece_command(p_workspace_id,p_command,v_actor);
  elsif v_type in ('submit-delivery','review-delivery') then$new$),
    ($old$where d.piece_id=v_id and d.status='approved' and d.caption=v_caption$old$,
     $new$where d.piece_id=v_id and d.status='approved' and d.invalidated_at is null and d.caption=v_caption$new$)
  ) as replacements(before_text,after_text) loop
    if strpos(body,item.before_text)=0 then raise exception 'History command anchor missing: %',item.before_text; end if;
    body:=replace(body,item.before_text,item.after_text);
  end loop;
  execute body;

  body:=pg_get_functiondef('app_private.delivery_command(uuid,jsonb,text)'::regprocedure);
  if strpos(body,'if d.id is null or d.id is distinct from')=0 then raise exception 'Delivery decision anchor missing'; end if;
  execute replace(body,'if d.id is null or d.id is distinct from','if d.invalidated_at is not null then raise exception ''INVALID_TRANSITION''; end if;'||chr(10)||'   if d.id is null or d.id is distinct from');

  -- Extend only the staff asset-read branch. Upload/import/trash still require an active piece.
  body:=pg_get_functiondef('public.aramis_drive(uuid,uuid,text,jsonb)'::regprocedure);
  if strpos(body,'and a.id=(p_payload->>''assetId'')::uuid and not p.archived and c.archived_at is null')=0
    or strpos(body,'and p.workspace_id=p_workspace_id and not p.archived and c.archived_at is null) then raise exception ''NOT_FOUND''; end if;')=0
    or strpos(body,'where a.available and a.workspace_id=p_workspace_id and not p.archived and c.archived_at is null')=0
    then raise exception 'Archived asset-read anchor missing'; end if;
  body:=replace(body,'and a.id=(p_payload->>''assetId'')::uuid and not p.archived and c.archived_at is null',
    'and a.id=(p_payload->>''assetId'')::uuid and c.archived_at is null');
  body:=replace(body,'and p.workspace_id=p_workspace_id and not p.archived and c.archived_at is null) then raise exception ''NOT_FOUND''; end if;',
    'and p.workspace_id=p_workspace_id and c.archived_at is null) then raise exception ''NOT_FOUND''; end if;');
  -- A broad list keeps hiding archived assets. Explicit pieceId is required for history material.
  body:=replace(body,'where a.available and a.workspace_id=p_workspace_id and not p.archived and c.archived_at is null',
    'where a.available and a.workspace_id=p_workspace_id and (not p.archived or p_payload->>''pieceId'' is not null) and c.archived_at is null');
  execute body;
end $migration$;

commit;
