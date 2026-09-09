-- Shared staff planning. No Drive, client mutations, raw capability tokens or demo fallback.
begin;

create table public.client_plans (
  client_id uuid primary key,
  workspace_id uuid not null,
  posts integer not null default 0 check (posts between 0 and 200),
  reels integer not null default 0 check (reels between 0 and 200),
  revision integer not null default 0 check (revision >= 0),
  generated_months text[] not null default '{}',
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete cascade
);
create table public.piece_production (
  piece_id uuid primary key,
  workspace_id uuid not null,
  plan_month text not null check (plan_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  work_area text not null default 'marketing' check (work_area in ('marketing','design')),
  production_stage text not null default 'ready' check (production_stage in ('ready','recording','editing')),
  script text not null default '',
  foreign key (workspace_id, piece_id) references public.pieces(workspace_id, id) on delete cascade
);
insert into public.client_plans(client_id,workspace_id) select id,workspace_id from public.clients;
insert into public.piece_production(piece_id,workspace_id,plan_month)
  select id,workspace_id,to_char(coalesce(planned_date, (created_at at time zone 'UTC')::date),'YYYY-MM') from public.pieces;
alter table public.client_plans enable row level security;
alter table public.piece_production enable row level security;
create policy client_plans_staff_read on public.client_plans for select to authenticated using (app_private.is_staff(workspace_id));
create policy piece_production_staff_read on public.piece_production for select to authenticated using (app_private.is_staff(workspace_id));
revoke all on public.client_plans, public.piece_production from public, anon, authenticated;
grant select on public.client_plans, public.piece_production to authenticated;
grant all on public.client_plans, public.piece_production to service_role;

-- Receipts retain no response snapshot: retry returns current state, preserving original entity ID.
-- They are scoped to the authenticated person so IDs cannot be used to read another user's result.
create table app_private.command_receipts (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  command jsonb not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id,request_id)
);
revoke all on app_private.command_receipts from public, anon, authenticated;
alter table app_private.command_receipts enable row level security;

create function app_private.check_object(value jsonb, allowed text[]) returns void
language plpgsql set search_path = '' as $$
begin
  if value is null or jsonb_typeof(value) <> 'object' then raise exception 'VALIDATION'; end if;
  if exists(select 1 from jsonb_object_keys(value) k where not (k = any(allowed))) then raise exception 'VALIDATION'; end if;
end;
$$;
create function app_private.check_strings(value jsonb, names text[], max_length integer default 100000) returns void
language plpgsql set search_path = '' as $$
declare k text;
begin
  foreach k in array names loop
    if value ? k and (jsonb_typeof(value->k) <> 'string' or length(value->>k) > max_length) then raise exception 'VALIDATION'; end if;
  end loop;
end;
$$;
create function app_private.check_month(value text) returns void
language plpgsql set search_path = '' as $$
begin
  if value is null or value !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'VALIDATION'; end if;
end;
$$;
create function app_private.check_plan(value jsonb) returns void
language plpgsql set search_path = '' as $$
declare k text; n numeric;
begin
  perform app_private.check_object(value,array['posts','reels']);
  foreach k in array array['posts','reels'] loop
    if jsonb_typeof(value->k) is distinct from 'number' then raise exception 'VALIDATION'; end if;
    n := (value->>k)::numeric;
    if n <> trunc(n) or n < 0 or n > 200 then raise exception 'VALIDATION'; end if;
  end loop;
end;
$$;
create function app_private.initials(value text) returns text
language sql immutable set search_path = '' as $$
  select upper(coalesce(string_agg(left(word,1),'' order by ordinal),''))
  from unnest(regexp_split_to_array(btrim(value),'\s+')) with ordinality words(word,ordinal) where ordinal <= 2;
$$;

create function public.aramis_workspace(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_name text; v_state jsonb;
begin
  select m.id,w.name into v_member,v_name from public.members m join public.workspaces w on w.id=m.workspace_id
    where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and m.active and m.role='staff';
  if v_member is null then raise exception 'forbidden' using errcode='42501'; end if;
  select jsonb_build_object(
    'schemaVersion',1,
    'clients',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'initials',c.initials,'color',c.color,
      'contactName',c.contact_name,'phone',c.phone,'monthlyPlan',jsonb_build_object('posts',coalesce(cp.posts,0),'reels',coalesce(cp.reels,0)),
      'revision',coalesce(cp.revision,0),'generatedMonths',coalesce(to_jsonb(cp.generated_months),'[]'::jsonb)) order by c.created_at,c.id)
      from public.clients c left join public.client_plans cp on cp.client_id=c.id where c.workspace_id=p_workspace_id and c.archived_at is null),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',pr.display_name,'initials',app_private.initials(pr.display_name)) order by m.created_at,m.id)
      from public.members m join public.profiles pr on pr.user_id=m.user_id where m.workspace_id=p_workspace_id and m.role='staff' and m.active),'[]'::jsonb),
    'pieces',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'clientId',p.client_id,'title',p.title,'format',p.format,'status',p.status,
      'ownerId',p.owner_member_id,'plannedDate',p.planned_date,'visibleToClient',p.visible_to_client,'caption',coalesce(d.caption,''),
      'internalNote',coalesce(n.note,''),'archived',p.archived,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
      'planMonth',coalesce(pp.plan_month,to_char(coalesce(p.planned_date,(p.created_at at time zone 'UTC')::date),'YYYY-MM')),
      'workArea',coalesce(pp.work_area,'marketing'),'productionStage',coalesce(pp.production_stage,'ready'),'script',coalesce(pp.script,''),'teamAssets','[]'::jsonb)
      order by p.created_at,p.id) from public.pieces p left join public.piece_drafts d on d.piece_id=p.id
      left join public.piece_internal_notes n on n.piece_id=p.id left join public.piece_production pp on pp.piece_id=p.id where p.workspace_id=p_workspace_id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'pieceId',r.piece_id,'version',r.version,'caption',r.caption,'status',r.status,
      'assets','[]'::jsonb,'createdAt',r.created_at,'sentAt',r.sent_at) order by r.created_at,r.id) from public.reviews r where r.workspace_id=p_workspace_id),'[]'::jsonb),
    'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'pieceId',m.piece_id,'instructions',m.instructions,'dueDate',m.due_date,'status',m.status,
      'assets','[]'::jsonb,'createdAt',m.created_at,'sentAt',m.sent_at) order by m.created_at,m.id) from public.material_requests m where m.workspace_id=p_workspace_id),'[]'::jsonb),
    'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reviewId',r.review_id,'kind',r.kind,'comment',r.comment,'authorName',r.author_name,
      'source',r.source,'recordedBy',r.recorded_by_member_id,'createdAt',r.created_at) order by r.created_at,r.id) from public.responses r where r.workspace_id=p_workspace_id),'[]'::jsonb),
    'shares','[]'::jsonb,
    'activities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'pieceId',a.piece_id,'text',a.text,'actor',a.actor,'visibility',a.visibility,'createdAt',a.created_at)
      order by a.created_at,a.id) from public.activity a where a.workspace_id=p_workspace_id),'[]'::jsonb)
  ) into v_state;
  return jsonb_build_object('state',v_state,'memberId',v_member,'workspaceId',p_workspace_id,'workspaceName',v_name);
end;
$$;

create function public.aramis_command(p_workspace_id uuid,p_command jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_member uuid; v_actor text; v_type text; v_data jsonb; v_receipt app_private.command_receipts%rowtype;
  v_client public.clients%rowtype; v_plan public.client_plans%rowtype; v_piece public.pieces%rowtype; v_review public.reviews%rowtype;
  v_id uuid; v_owner uuid; v_name text; v_title text; v_format text; v_month text; v_date date; v_status text; v_caption text;
  v_caption_changed boolean; v_leaves_review boolean; v_count integer; v_index integer; v_total integer; v_posts integer; v_reels integer;
  v_expected numeric; v_text text; v_now timestamptz := statement_timestamp(); v_key text;
begin
  -- Serialize every workspace command before checking membership and receipts. Membership SHARE
  -- lock prevents revocation mid-command; concurrent admin revocation waits for this transaction.
  if v_user is null or not app_private.is_staff(p_workspace_id) then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=p_workspace_id for update;
  select m.id,pr.display_name into v_member,v_actor from public.members m join public.profiles pr on pr.user_id=m.user_id
    where m.workspace_id=p_workspace_id and m.user_id=v_user and m.active and m.role='staff' for share of m;
  if v_member is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'VALIDATION'; end if;
  if p_command is null or jsonb_typeof(p_command)<>'object' then raise exception 'VALIDATION'; end if;
  if jsonb_typeof(p_command->'type') is distinct from 'string' then raise exception 'VALIDATION'; end if;
  v_type := p_command->>'type';
  -- Unsupported features return a clear boundary, and never create a successful receipt.
  if v_type not in ('create-client','update-client','generate-month','create-piece','update-piece') then raise exception 'FEATURE_UNAVAILABLE'; end if;
  select * into v_receipt from app_private.command_receipts where workspace_id=p_workspace_id and user_id=v_user and request_id=p_request_id;
  if found then
    if v_receipt.command is distinct from p_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return public.aramis_workspace(p_workspace_id) || jsonb_build_object('entityId',v_receipt.entity_id);
  end if;
  if v_type in ('create-client','update-client') then
    perform app_private.check_object(p_command,case when v_type='create-client' then array['type','input'] else array['type','clientId','expectedRevision','patch'] end);
    v_data := case when v_type='create-client' then p_command->'input' else p_command->'patch' end;
    perform app_private.check_object(v_data,array['name','contactName','phone','monthlyPlan']);
    perform app_private.check_strings(v_data,array['name'],160);
    perform app_private.check_strings(v_data,array['contactName','phone'],1000);
    if v_data ? 'name' and length(btrim(v_data->>'name'))=0 then raise exception 'VALIDATION'; end if;
    if v_data ? 'monthlyPlan' then perform app_private.check_plan(v_data->'monthlyPlan'); end if;
    if v_type='create-client' then
      if not (v_data ?& array['name','contactName','phone','monthlyPlan']) then raise exception 'VALIDATION'; end if;
      v_name := btrim(v_data->>'name'); v_id := gen_random_uuid();
      select count(*) into v_count from public.clients where workspace_id=p_workspace_id and archived_at is null;
      insert into public.clients(id,workspace_id,name,initials,color,contact_name,phone,created_at)
        values(v_id,p_workspace_id,v_name,app_private.initials(v_name),(array['#8b2634','#5c9cd9','#f4b943'])[v_count%3+1],btrim(v_data->>'contactName'),btrim(v_data->>'phone'),v_now);
      insert into public.client_plans(client_id,workspace_id,posts,reels) values(v_id,p_workspace_id,(v_data->'monthlyPlan'->>'posts')::integer,(v_data->'monthlyPlan'->>'reels')::integer);
    else
      v_id := (p_command->>'clientId')::uuid;
      select * into v_client from public.clients where id=v_id and workspace_id=p_workspace_id and archived_at is null;
      if not found then raise exception 'NOT_FOUND'; end if;
      insert into public.client_plans(client_id,workspace_id) values(v_id,p_workspace_id) on conflict do nothing;
      select * into v_plan from public.client_plans where client_id=v_id;
      if jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' then raise exception 'VALIDATION'; end if;
      v_expected := (p_command->>'expectedRevision')::numeric;
      if v_expected<>trunc(v_expected) or v_expected<0 then raise exception 'VALIDATION'; end if;
      if v_plan.revision<>v_expected then raise exception 'CONFLICT'; end if;
      v_name := coalesce(btrim(v_data->>'name'),v_client.name);
      update public.clients set name=v_name,initials=app_private.initials(v_name),contact_name=coalesce(btrim(v_data->>'contactName'),contact_name),phone=coalesce(btrim(v_data->>'phone'),phone) where id=v_id;
      update public.client_plans set posts=coalesce((v_data->'monthlyPlan'->>'posts')::integer,posts),reels=coalesce((v_data->'monthlyPlan'->>'reels')::integer,reels),revision=revision+1 where client_id=v_id;
    end if;
  elsif v_type in ('generate-month','create-piece') then
    perform app_private.check_object(p_command,case when v_type='generate-month' then array['type','clientId','month','ownerId'] else array['type','input'] end);
    v_data := case when v_type='create-piece' then p_command->'input' else p_command end;
    if v_type='create-piece' then perform app_private.check_object(v_data,array['clientId','title','ownerId','planMonth','workArea','format','plannedDate']); end if;
    select * into v_client from public.clients where id=(v_data->>'clientId')::uuid and workspace_id=p_workspace_id and archived_at is null;
    if not found then raise exception 'NOT_FOUND'; end if;
    v_owner := case when v_data ? 'ownerId' then (v_data->>'ownerId')::uuid else v_member end;
    perform 1 from public.members where id=v_owner and workspace_id=p_workspace_id and role='staff' and active for share;
    if not found then raise exception 'VALIDATION'; end if;
    if v_type='generate-month' then
      perform app_private.check_strings(v_data,array['month']); v_month := v_data->>'month'; perform app_private.check_month(v_month);
      insert into public.client_plans(client_id,workspace_id) values(v_client.id,p_workspace_id) on conflict do nothing;
      select * into v_plan from public.client_plans where client_id=v_client.id;
      if v_month=any(v_plan.generated_months) then raise exception 'MONTH_EXISTS'; end if;
      if v_plan.posts+v_plan.reels=0 then raise exception 'EMPTY_PLAN'; end if;
      foreach v_format in array array['post','reel'] loop
        v_total := case when v_format='post' then v_plan.posts else v_plan.reels end;
        select count(*) into v_count from public.pieces p left join public.piece_production pp on pp.piece_id=p.id
          where p.workspace_id=p_workspace_id and p.client_id=v_client.id and not p.archived
          and coalesce(pp.plan_month,to_char(coalesce(p.planned_date,(p.created_at at time zone 'UTC')::date),'YYYY-MM'))=v_month
          and (p.format=v_format or (v_format='post' and p.format='carousel'));
        for v_index in (v_count+1)..v_total loop
          v_id := gen_random_uuid();
          v_title := (case when v_format='post' then 'Posteo ' else 'Reel ' end)||lpad(v_index::text,greatest(2,length(v_index::text)),'0');
          insert into public.pieces(id,workspace_id,client_id,title,format,owner_member_id,created_at,updated_at) values(v_id,p_workspace_id,v_client.id,v_title,v_format,v_owner,v_now,v_now);
          insert into public.piece_production(piece_id,workspace_id,plan_month) values(v_id,p_workspace_id,v_month);
          insert into public.piece_drafts(piece_id,workspace_id) values(v_id,p_workspace_id);
          insert into public.piece_internal_notes(piece_id,workspace_id) values(v_id,p_workspace_id);
          insert into public.activity(workspace_id,client_id,piece_id,text,actor,created_at) values(p_workspace_id,v_client.id,v_id,'Contenido creado desde el plan de '||v_month||'.',v_actor,v_now);
        end loop;
      end loop;
      update public.client_plans set generated_months=array_append(generated_months,v_month),revision=revision+1 where client_id=v_client.id;
      v_id := v_client.id;
    else
      perform app_private.check_strings(v_data,array['title'],240);
      perform app_private.check_strings(v_data,array['planMonth','format','workArea']);
      v_format := coalesce(v_data->>'format','post');
      if v_format not in ('post','reel','carousel','story') or (v_data ? 'workArea' and v_data->>'workArea' not in ('marketing','design')) then raise exception 'VALIDATION'; end if;
      if v_data ? 'plannedDate' and v_data->'plannedDate'<>'null'::jsonb then
        if jsonb_typeof(v_data->'plannedDate')<>'string' or v_data->>'plannedDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'VALIDATION'; end if;
        v_date := (v_data->>'plannedDate')::date;
      end if;
      v_month := coalesce(v_data->>'planMonth',to_char(v_date,'YYYY-MM'),to_char(v_now at time zone 'UTC','YYYY-MM')); perform app_private.check_month(v_month);
      v_title := coalesce(nullif(btrim(v_data->>'title'),''),case v_format when 'post' then 'Posteo' when 'reel' then 'Reel' when 'carousel' then 'Carrusel' else 'Historia' end||' sin título');
      v_id := gen_random_uuid();
      insert into public.pieces(id,workspace_id,client_id,title,format,owner_member_id,planned_date,created_at,updated_at) values(v_id,p_workspace_id,v_client.id,v_title,v_format,v_owner,v_date,v_now,v_now);
      insert into public.piece_production(piece_id,workspace_id,plan_month,work_area) values(v_id,p_workspace_id,v_month,coalesce(v_data->>'workArea','marketing'));
      insert into public.piece_drafts(piece_id,workspace_id) values(v_id,p_workspace_id);
      insert into public.piece_internal_notes(piece_id,workspace_id) values(v_id,p_workspace_id);
      insert into public.activity(workspace_id,client_id,piece_id,text,actor,created_at) values(p_workspace_id,v_client.id,v_id,'Contenido creado.',v_actor,v_now);
    end if;
  else
    perform app_private.check_object(p_command,array['type','pieceId','expectedRevision','patch']);
    v_id := (p_command->>'pieceId')::uuid;
    select * into v_piece from public.pieces where id=v_id and workspace_id=p_workspace_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_piece.archived then raise exception 'ARCHIVED'; end if;
    if jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' then raise exception 'VALIDATION'; end if;
    v_expected := (p_command->>'expectedRevision')::numeric;
    if v_expected<>trunc(v_expected) or v_expected<0 then raise exception 'VALIDATION'; end if;
    if v_piece.revision<>v_expected then raise exception 'CONFLICT'; end if;
    v_data := p_command->'patch';
    perform app_private.check_object(v_data,array['title','format','ownerId','plannedDate','visibleToClient','caption','internalNote','archived','status','planMonth','workArea','productionStage','script','teamAssets']);
    if v_data ? 'teamAssets' then raise exception 'FEATURE_UNAVAILABLE'; end if;
    perform app_private.check_strings(v_data,array['title'],240);
    perform app_private.check_strings(v_data,array['caption','internalNote','script','format','status','planMonth','workArea','productionStage']);
    if v_data ? 'title' and length(btrim(v_data->>'title'))=0 then raise exception 'VALIDATION'; end if;
    foreach v_key in array array['visibleToClient','archived'] loop
      if v_data ? v_key and jsonb_typeof(v_data->v_key)<>'boolean' then raise exception 'VALIDATION'; end if;
    end loop;
    if v_data ? 'format' and v_data->>'format' not in ('post','reel','carousel','story') then raise exception 'VALIDATION'; end if;
    if v_data ? 'workArea' and v_data->>'workArea' not in ('marketing','design') then raise exception 'VALIDATION'; end if;
    if v_data ? 'productionStage' and v_data->>'productionStage' not in ('ready','recording','editing') then raise exception 'VALIDATION'; end if;
    if v_data ? 'planMonth' then perform app_private.check_month(v_data->>'planMonth'); end if;
    v_date := v_piece.planned_date;
    if v_data ? 'plannedDate' then
      if v_data->'plannedDate'='null'::jsonb then v_date := null;
      else
        if jsonb_typeof(v_data->'plannedDate')<>'string' or v_data->>'plannedDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'VALIDATION'; end if;
        v_date := (v_data->>'plannedDate')::date;
      end if;
    end if;
    v_owner := v_piece.owner_member_id;
    if v_data ? 'ownerId' then
      v_owner := (v_data->>'ownerId')::uuid;
      perform 1 from public.members where id=v_owner and workspace_id=p_workspace_id and role='staff' and active for share;
      if not found then raise exception 'VALIDATION'; end if;
    end if;
    select coalesce((select caption from public.piece_drafts where piece_id=v_id),'') into v_caption;
    v_caption_changed := v_data ? 'caption' and v_data->>'caption'<>v_caption;
    v_status := coalesce(v_data->>'status',v_piece.status);
    if v_status not in ('planned','production','review','approved','scheduled','published') then raise exception 'VALIDATION'; end if;
    if v_piece.status='published' and (v_caption_changed or v_status<>'published') then raise exception 'PUBLISHED_IMMUTABLE'; end if;
    if v_data ? 'status' then
      if v_status in ('review','approved') and v_status<>v_piece.status then raise exception 'INVALID_TRANSITION'; end if;
      if v_status in ('scheduled','published') then
        select * into v_review from public.reviews where workspace_id=p_workspace_id and piece_id=v_id order by version desc limit 1;
        if v_review.id is null or v_review.status<>'approved' or v_review.sealed_at is null or v_review.caption<>v_caption or v_caption_changed then raise exception 'APPROVAL_REQUIRED'; end if;
      end if;
    end if;
    v_leaves_review := v_data ? 'status' and v_status in ('planned','production') and v_status<>v_piece.status;
    if v_caption_changed or v_leaves_review or (v_data->'archived'='true'::jsonb and v_piece.status<>'published') then
      update public.reviews set status='superseded' where piece_id=v_id and status in ('pending','approved');
      if v_piece.status in ('review','approved','scheduled','published') then
        v_status := case when v_data ? 'status' and v_data->>'status' in ('planned','production') then v_data->>'status' else 'production' end;
      end if;
    end if;
    update public.pieces set title=coalesce(btrim(v_data->>'title'),title),format=coalesce(v_data->>'format',format),owner_member_id=v_owner,planned_date=v_date,
      visible_to_client=coalesce((v_data->>'visibleToClient')::boolean,visible_to_client),archived=coalesce((v_data->>'archived')::boolean,archived),status=v_status,revision=revision+1,updated_at=v_now where id=v_id;
    insert into public.piece_drafts(piece_id,workspace_id,caption,updated_at) values(v_id,p_workspace_id,coalesce(v_data->>'caption',v_caption),v_now)
      on conflict(piece_id) do update set caption=excluded.caption,updated_at=excluded.updated_at;
    if v_data ? 'internalNote' then
      insert into public.piece_internal_notes(piece_id,workspace_id,note) values(v_id,p_workspace_id,v_data->>'internalNote') on conflict(piece_id) do update set note=excluded.note;
    end if;
    insert into public.piece_production(piece_id,workspace_id,plan_month) values(v_id,p_workspace_id,to_char(coalesce(v_piece.planned_date,(v_piece.created_at at time zone 'UTC')::date),'YYYY-MM')) on conflict do nothing;
    update public.piece_production set plan_month=coalesce(v_data->>'planMonth',plan_month),work_area=coalesce(v_data->>'workArea',work_area),
      production_stage=coalesce(v_data->>'productionStage',production_stage),script=coalesce(v_data->>'script',script) where piece_id=v_id;
    if v_data->'archived'='true'::jsonb then
      update public.shares s set revoked_at=coalesce(revoked_at,v_now) where s.workspace_id=p_workspace_id and
        ((s.scope='review' and s.review_id in(select id from public.reviews where piece_id=v_id)) or
         (s.scope='material' and s.material_request_id in(select id from public.material_requests where piece_id=v_id)));
    end if;
    v_text := case when v_caption_changed then 'Texto actualizado; se requiere una nueva revisión.' when v_data->'archived'='true'::jsonb then 'Contenido archivado.' else 'Contenido actualizado.' end;
    insert into public.activity(workspace_id,client_id,piece_id,text,actor,created_at) values(p_workspace_id,v_piece.client_id,v_id,v_text,v_actor,v_now);
  end if;
  insert into app_private.command_receipts(workspace_id,user_id,request_id,command,entity_id,created_at) values(p_workspace_id,v_user,p_request_id,p_command,v_id,v_now);
  return public.aramis_workspace(p_workspace_id)||jsonb_build_object('entityId',v_id);
exception
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or check_violation then
    raise exception 'VALIDATION';
end;
$$;

revoke all on function app_private.check_object(jsonb,text[]),app_private.check_strings(jsonb,text[],integer),app_private.check_month(text),app_private.check_plan(jsonb),app_private.initials(text) from public, anon, authenticated;
revoke all on function public.aramis_workspace(uuid),public.aramis_command(uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.aramis_workspace(uuid),public.aramis_command(uuid,jsonb,uuid) to authenticated;
commit;
