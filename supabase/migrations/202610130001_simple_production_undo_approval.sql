-- Preparation stays in Planning. Undoing an accidental approval reopens the same snapshot.
begin;

create function app_private.undo_approval_command(w uuid,command jsonb,actor text) returns uuid
language plpgsql set search_path='' as $$
declare p public.pieces; d app_private.deliveries; r public.reviews; expected numeric; version_number integer;
begin
  perform app_private.check_object(command,array['type','pieceId','expectedRevision','approvalId']);
  select x.* into p from public.pieces x join public.clients c on c.id=x.client_id and c.workspace_id=x.workspace_id
    where x.id=(command->>'pieceId')::uuid and x.workspace_id=w and not x.archived and c.archived_at is null for update of x;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(command->'expectedRevision') is distinct from 'number'
    or jsonb_typeof(command->'approvalId') is distinct from 'string' then raise exception 'VALIDATION'; end if;
  expected:=(command->>'expectedRevision')::numeric;
  if expected<>trunc(expected) or expected<0 then raise exception 'VALIDATION'; end if;
  if expected<>p.revision then raise exception 'CONFLICT'; end if;
  if p.status<>'approved' then raise exception 'INVALID_TRANSITION'; end if;
  select * into d from app_private.deliveries where piece_id=p.id order by version desc limit 1 for update;
  if d.id is not null then
    if d.id is distinct from (command->>'approvalId')::uuid then raise exception 'CONFLICT'; end if;
    if d.status<>'approved' or d.invalidated_at is not null or d.caption is distinct from
      coalesce((select caption from public.piece_drafts where piece_id=p.id),'') then raise exception 'INVALID_TRANSITION'; end if;
    -- The original approval, author, origin and comment remain in the append-only activity log.
    -- Only its current decision is cleared; identity, version, caption and exact assets stay fixed.
    update app_private.deliveries set status='pending',comment='',source=null,decided_by=null,decided_at=null where id=d.id;
    version_number:=d.version;
  else
    select * into r from public.reviews where piece_id=p.id order by version desc limit 1 for update;
    if r.id is null or r.id is distinct from (command->>'approvalId')::uuid then raise exception 'CONFLICT'; end if;
    if r.status<>'approved' or r.sealed_at is null or r.caption is distinct from
      coalesce((select caption from public.piece_drafts where piece_id=p.id),'') then raise exception 'INVALID_TRANSITION'; end if;
    update public.reviews set status='pending' where id=r.id;
    version_number:=r.version;
  end if;
  update public.pieces set status='review',revision=revision+1,updated_at=statement_timestamp() where id=p.id;
  update public.piece_production set work_area='marketing',production_stage='ready' where piece_id=p.id;
  insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
    values(w,p.client_id,p.id,'Aprobación de v'||version_number||' deshecha por el equipo; vuelve a revisión.',actor,'internal');
  return p.id;
end $$;
revoke all on function app_private.undo_approval_command(uuid,jsonb,text) from public,anon,authenticated,service_role;

-- Extend the original command transaction: staff membership, workspace lock and receipts remain intact.
do $migration$
declare body text; item record;
begin
  body:=pg_get_functiondef('public.aramis_command(uuid,jsonb,uuid)'::regprocedure);
  for item in select * from (values
    ($old$'review-delivery','restore-piece') then raise exception 'FEATURE_UNAVAILABLE'$old$,
     $new$'review-delivery','restore-piece','undo-approval') then raise exception 'FEATURE_UNAVAILABLE'$new$),
    ($old$  if v_type='restore-piece' then$old$,
     $new$  if v_type='undo-approval' then
    v_id:=app_private.undo_approval_command(p_workspace_id,p_command,v_actor);
  elsif v_type='restore-piece' then$new$),
    ($old$    v_data := p_command->'patch';$old$,
     $new$    v_data := p_command->'patch';
    if v_data->>'productionStage'='recording' then
      v_data:=v_data||jsonb_build_object('status','planned','workArea','marketing','productionStage','ready');
    elsif v_data->>'status'='production' then
      v_data:=v_data||jsonb_build_object('workArea','design','productionStage','ready');
    elsif v_data->>'status'='planned' then
      v_data:=v_data||jsonb_build_object('workArea','marketing','productionStage','ready');
    end if;$new$)
  ) as replacements(before_text,after_text) loop
    if strpos(body,item.before_text)=0 then raise exception 'Simple workflow command anchor missing: %',item.before_text; end if;
    body:=replace(body,item.before_text,item.after_text);
  end loop;
  execute body;
end $migration$;

-- Retire old recording/Marketing production work, without touching approvals, archives or files.
-- Take the same workspace lock as commands and recheck candidates after acquiring it.
do $$
declare w record; p record;
begin
  for w in select distinct workspace_id from public.pieces order by workspace_id loop
    perform 1 from public.workspaces where id=w.workspace_id for update;
    for p in select x.id,x.workspace_id,x.client_id from public.pieces x
      join public.clients c on c.id=x.client_id and c.workspace_id=x.workspace_id
      join public.piece_production pr on pr.piece_id=x.id and pr.workspace_id=x.workspace_id
      where x.workspace_id=w.workspace_id and x.status='production' and not x.archived and c.archived_at is null
        and (pr.production_stage='recording' or pr.work_area='marketing') for update of x
    loop
      update public.piece_production set production_stage='ready',work_area='marketing' where piece_id=p.id;
      update public.pieces set status='planned',revision=revision+1,updated_at=statement_timestamp() where id=p.id;
      insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
        values(p.workspace_id,p.client_id,p.id,'Preparación y grabación integradas a Planificación.','Sistema','internal');
    end loop;
  end loop;
end $$;
commit;
