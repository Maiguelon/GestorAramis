-- A fixed recipient selection belongs to one internal piece, not to cloned tasks.
begin;

create table app_private.piece_clients (
  workspace_id uuid not null,
  piece_id uuid not null,
  client_id uuid not null,
  position integer not null check (position between 1 and 200),
  primary key (piece_id, client_id),
  unique (piece_id, position),
  foreign key (workspace_id,piece_id) references public.pieces(workspace_id,id) on delete cascade,
  foreign key (workspace_id,client_id) references public.clients(workspace_id,id)
);
create index piece_clients_client on app_private.piece_clients(workspace_id,client_id,piece_id);
alter table app_private.piece_clients enable row level security;
revoke all on app_private.piece_clients from public,anon,authenticated;
grant select on app_private.piece_clients to service_role;

create function app_private.check_piece_clients(w uuid,input jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if not input ? 'clientIds' then return; end if;
  if jsonb_typeof(input->'clientIds') is distinct from 'array' then raise exception 'VALIDATION'; end if;
  if jsonb_array_length(input->'clientIds') not between 1 and 200
    or input->'clientIds'->>0 is distinct from input->>'clientId' then raise exception 'VALIDATION'; end if;
  if exists(select 1 from jsonb_array_elements(input->'clientIds') x
    where jsonb_typeof(x)<>'string' or x#>>'{}' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
    then raise exception 'VALIDATION'; end if;
  if (select count(*)<>count(distinct value::uuid) from jsonb_array_elements_text(input->'clientIds'))
    then raise exception 'VALIDATION'; end if;
  perform 1 from public.clients c where c.workspace_id=w and c.archived_at is null
    and c.id in (select value::uuid from jsonb_array_elements_text(input->'clientIds')) order by c.id for share;
  if (select count(*) from public.clients c where c.workspace_id=w and c.archived_at is null
    and c.id in (select value::uuid from jsonb_array_elements_text(input->'clientIds')))
    <>jsonb_array_length(input->'clientIds') then raise exception 'VALIDATION'; end if;
end $$;
revoke all on function app_private.check_piece_clients(uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.piece_client_names(target uuid) returns text
language sql stable set search_path='' as $$
  select coalesce((select string_agg(c.name,', ' order by pc.position)
    from app_private.piece_clients pc join public.clients c on c.workspace_id=pc.workspace_id and c.id=pc.client_id
    where pc.piece_id=target and c.archived_at is null),
    (select c.name from public.pieces p join public.clients c on c.id=p.client_id where p.id=target));
$$;
revoke all on function app_private.piece_client_names(uuid) from public,anon,authenticated,service_role;

-- Keep membership, receipts, locking and the existing workflow commands in place.
do $migration$
declare body text; item record;
begin
  body:=pg_get_functiondef('public.aramis_workspace(uuid)'::regprocedure);
  if strpos(body,'return jsonb_build_object(''state'',v_state')=0 then raise exception 'Multiclient workspace anchor missing'; end if;
  body:=replace(body,'return jsonb_build_object(''state'',v_state',
    $new$v_state:=jsonb_set(v_state,'{pieces}',coalesce((select jsonb_agg(entry || coalesce(
      (select jsonb_build_object('clientIds',jsonb_agg(pc.client_id order by pc.position))
        from app_private.piece_clients pc where pc.workspace_id=p_workspace_id and pc.piece_id=(entry->>'id')::uuid
        having count(*)>1),'{}'::jsonb)) from jsonb_array_elements(v_state->'pieces') entry),'[]'::jsonb));
  return jsonb_build_object('state',v_state$new$);
  execute body;
  body:=pg_get_functiondef('public.aramis_command(uuid,jsonb,uuid)'::regprocedure);
  for item in select * from (values
    ($old$if v_type='create-piece' then perform app_private.check_object(v_data,array['clientId','title','ownerId','planMonth','workArea','format','plannedDate']); end if;$old$,
     $new$if v_type='create-piece' then
      perform app_private.check_object(v_data,array['clientId','clientIds','title','ownerId','planMonth','workArea','format','plannedDate']);
      perform app_private.check_piece_clients(p_workspace_id,v_data);
    end if;$new$),
    ($old$      insert into public.activity(workspace_id,client_id,piece_id,text,actor,created_at) values(p_workspace_id,v_client.id,v_id,'Contenido creado.',v_actor,v_now);$old$,
     $new$      if jsonb_array_length(v_data->'clientIds')>1 then
        insert into app_private.piece_clients(workspace_id,piece_id,client_id,position)
          select p_workspace_id,v_id,value::uuid,ordinality::integer from jsonb_array_elements_text(v_data->'clientIds') with ordinality;
      end if;
      insert into public.activity(workspace_id,client_id,piece_id,text,actor,created_at)
        values(p_workspace_id,v_client.id,v_id,case when jsonb_array_length(v_data->'clientIds')>1
          then 'Contenido multicliente creado: '||app_private.piece_client_names(v_id)||'.' else 'Contenido creado.' end,v_actor,v_now);$new$),
    ($old$and (p.format=v_format or (v_format='post' and p.format='carousel'));$old$,
     $new$and (p.format=v_format or (v_format='post' and p.format='carousel'))
          and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id);$new$),
    ($old$    v_data := p_command->'patch';$old$,
     $new$    v_data := p_command->'patch';
    if v_data->'visibleToClient'='true'::jsonb and exists(select 1 from app_private.piece_clients where piece_id=v_id)
      then raise exception 'FEATURE_UNAVAILABLE'; end if;$new$)
  ) as replacements(before_text,after_text) loop
    if strpos(body,item.before_text)=0 then raise exception 'Multiclient command anchor missing: %',item.before_text; end if;
    body:=replace(body,item.before_text,item.after_text);
  end loop;
  execute body;
  body:=pg_get_functiondef('public.aramis_notification_dispatch(uuid,text,jsonb,timestamptz)'::regprocedure);
  if strpos(body,'''client'',c.name')=0 then raise exception 'Multiclient notification anchor missing'; end if;
  execute replace(body,'''client'',c.name','''client'',app_private.piece_client_names(p.id)');
end $migration$;
commit;
