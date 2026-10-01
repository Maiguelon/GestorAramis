-- Internal notifications: no historical backlog, no direct table access, no email sending in SQL.
begin;

create table app_private.notification_preferences (
  member_id uuid primary key, workspace_id uuid not null,
  audience text not null default 'unassigned' check(audience in ('unassigned','design','marketing')),
  cadence text not null default 'daily' check(cadence in ('daily','six_hours','hourly','immediate')),
  enabled boolean not null default true, daily_time time not null default '09:00',
  revision integer not null default 1 check(revision>0), last_sent_at timestamptz,
  foreign key(workspace_id,member_id) references public.members(workspace_id,id)
);
create table app_private.notification_preference_receipts (
  member_id uuid not null references public.members(id), request_id uuid not null,
  payload jsonb not null, result jsonb not null, primary key(member_id,request_id)
);
create table app_private.notification_piece_state (
  piece_id uuid primary key references public.pieces(id) on delete cascade,
  workspace_id uuid not null, target text check(target in ('design','marketing')),
  sequence bigint not null default 0
);
create table app_private.notification_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  piece_id uuid not null references public.pieces(id), sequence bigint not null,
  audience text not null check(audience in ('design','marketing')),
  kind text not null check(kind in ('ready','returned','review')), reason text not null default '',
  occurred_at timestamptz not null default now(), unique(piece_id,sequence)
);
create table app_private.notification_batches (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  member_id uuid not null references public.members(id), recipient text not null,
  audience text not null, items jsonb not null, payload jsonb,
  state text not null default 'ready' check(state in ('ready','retry','sent','cancelled','needs_review')),
  created_at timestamptz not null default now(), first_attempt_at timestamptz, sent_at timestamptz,
  retry_at timestamptz, attempts integer not null default 0,
  lease uuid, lease_until timestamptz, provider_id text, error_code text
);
create table app_private.notification_queue (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id),
  event_id uuid not null references app_private.notification_events(id),
  state text not null default 'pending' check(state in ('pending','batched','sent','skipped','needs_review')),
  batch_id uuid references app_private.notification_batches(id),
  queued_at timestamptz not null default now(), unique(member_id,event_id)
);
create index notification_pending_member on app_private.notification_queue(member_id,queued_at) where state='pending';
create index notification_batch_pending on app_private.notification_batches(workspace_id,retry_at) where state in ('ready','retry');

alter table app_private.notification_preferences enable row level security;
alter table app_private.notification_preference_receipts enable row level security;
alter table app_private.notification_piece_state enable row level security;
alter table app_private.notification_events enable row level security;
alter table app_private.notification_batches enable row level security;
alter table app_private.notification_queue enable row level security;
revoke all on app_private.notification_preferences,app_private.notification_preference_receipts,
 app_private.notification_piece_state,app_private.notification_events,app_private.notification_batches,
 app_private.notification_queue from public,anon,authenticated,service_role;

create function app_private.notification_target(target_piece uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when p.status='review' then 'marketing'
   when p.status='production' and coalesce(pr.work_area,'design')='design'
    and coalesce(pr.production_stage,'ready')<>'recording'
    and not exists(select 1 from public.material_requests r where r.piece_id=p.id and r.status<>'complete') then 'design'
   else null end
 from public.pieces p join public.clients c on c.id=p.client_id and c.workspace_id=p.workspace_id
 left join public.piece_production pr on pr.piece_id=p.id
 where p.id=target_piece and not p.archived and c.archived_at is null;
$$;

-- Deferred triggers observe the FINAL piece + production + material state at commit.
-- A delivery command edits multiple tables; intermediate values must never send alerts.
create function app_private.capture_notification_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_piece uuid; w uuid; t text; previous app_private.notification_piece_state; seq bigint;
 event_id uuid; kind text; reason text:='';
begin
 target_piece:=coalesce(to_jsonb(new)->>'piece_id',to_jsonb(old)->>'piece_id',to_jsonb(new)->>'id')::uuid;
 select workspace_id into w from public.pieces where id=target_piece;
 if w is null then return null; end if;
 t:=app_private.notification_target(target_piece);
 insert into app_private.notification_piece_state(piece_id,workspace_id) values(target_piece,w) on conflict do nothing;
 select * into previous from app_private.notification_piece_state where piece_id=target_piece for update;
 if previous.target is not distinct from t then return null; end if;
 seq:=previous.sequence+1;
 update app_private.notification_piece_state set target=t,sequence=seq where piece_id=target_piece;
 if t is null then return null; end if;
 kind:=case when t='marketing' then 'review' else 'ready' end;
 if t='design' then
   select case when d.status='changes' then left(d.comment,1000) end into reason from app_private.deliveries d
    where d.piece_id=target_piece and d.invalidated_at is null order by d.version desc limit 1;
   if reason is not null then kind:='returned'; end if;
 end if;
 insert into app_private.notification_events(workspace_id,piece_id,sequence,audience,kind,reason)
  values(w,target_piece,seq,t,kind,coalesce(reason,'')) returning id into event_id;
 insert into app_private.notification_queue(member_id,event_id)
  select pref.member_id,event_id from app_private.notification_preferences pref join public.members m on m.id=pref.member_id
  where pref.workspace_id=w and pref.enabled and pref.audience=t and m.active and m.role='staff';
 return null;
end $$;

-- Initialize the present state WITHOUT retroactively notifying the existing backlog.
insert into app_private.notification_piece_state(piece_id,workspace_id,target)
 select id,workspace_id,app_private.notification_target(id) from public.pieces;
insert into app_private.notification_preferences(member_id,workspace_id)
 select id,workspace_id from public.members where role='staff' and active;
create constraint trigger notification_piece_transition after insert or update on public.pieces
 deferrable initially deferred for each row execute function app_private.capture_notification_transition();
create constraint trigger notification_production_transition after insert or update or delete on public.piece_production
 deferrable initially deferred for each row execute function app_private.capture_notification_transition();
create constraint trigger notification_material_transition after insert or update or delete on public.material_requests
 deferrable initially deferred for each row execute function app_private.capture_notification_transition();

create function app_private.notification_pref_json(pref app_private.notification_preferences) returns jsonb
language sql stable set search_path='' as $$
 select case when pref.member_id is null then null else jsonb_build_object('audience',pref.audience,'cadence',pref.cadence,'enabled',pref.enabled,
  'dailyTime',to_char(pref.daily_time,'HH24:MI'),'revision',pref.revision) end;
$$;
create function public.aramis_notification_preferences(p_workspace_id uuid,p_payload jsonb default null,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member uuid; pref app_private.notification_preferences; receipt app_private.notification_preference_receipts;
 result jsonb; last_email jsonb;
begin
 if auth.uid() is null or not app_private.is_staff(p_workspace_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.workspaces where id=p_workspace_id for update;
 select id into v_member from public.members where workspace_id=p_workspace_id and user_id=auth.uid() and active and role='staff' for share;
 if v_member is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into pref from app_private.notification_preferences where notification_preferences.member_id=v_member for update;
 if p_payload is not null then
  if p_request_id is null then raise exception 'VALIDATION'; end if;
  select * into receipt from app_private.notification_preference_receipts r where r.member_id=v_member and r.request_id=p_request_id;
  if found then
    if receipt.payload is distinct from p_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return receipt.result;
  end if;
  perform app_private.check_object(p_payload,array['audience','cadence','enabled','dailyTime','expectedRevision']);
  if p_payload->>'audience' not in ('unassigned','design','marketing') or p_payload->>'audience' is null
   or p_payload->>'cadence' not in ('daily','six_hours','hourly','immediate') or p_payload->>'cadence' is null
   or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean'
   or coalesce(p_payload->>'dailyTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number'
   or (p_payload->>'expectedRevision')::numeric<>coalesce(pref.revision,0) then
    if jsonb_typeof(p_payload->'expectedRevision')='number' and (p_payload->>'expectedRevision')::numeric<>coalesce(pref.revision,0) then raise exception 'CONFLICT'; end if;
    raise exception 'VALIDATION';
  end if;
  insert into app_private.notification_preferences(member_id,workspace_id,audience,cadence,enabled,daily_time)
   values(v_member,p_workspace_id,p_payload->>'audience',p_payload->>'cadence',(p_payload->>'enabled')::boolean,(p_payload->>'dailyTime')::time)
   on conflict(member_id) do update set audience=excluded.audience,cadence=excluded.cadence,enabled=excluded.enabled,
    daily_time=excluded.daily_time,revision=notification_preferences.revision+1 returning * into pref;
  update app_private.notification_queue q set state='skipped' from app_private.notification_events e
   where q.member_id=v_member and q.event_id=e.id and q.state='pending' and (not pref.enabled or e.audience<>pref.audience);
 end if;
 select jsonb_build_object('status',b.state,'at',coalesce(b.sent_at,b.first_attempt_at,b.created_at)) into last_email
  from app_private.notification_batches b where b.member_id=v_member order by b.created_at desc,b.id desc limit 1;
 result:=jsonb_build_object('preferences',coalesce(app_private.notification_pref_json(pref),
  '{"audience":"unassigned","cadence":"daily","enabled":true,"dailyTime":"09:00","revision":0}'::jsonb),'lastEmail',last_email);
 if p_payload is not null then insert into app_private.notification_preference_receipts values(v_member,p_request_id,p_payload,result); end if;
 return result;
end $$;

create function app_private.notification_bucket(cadence text,daily_time time,at_time timestamptz) returns timestamptz
language sql stable set search_path='' as $$
 select (case cadence when 'daily' then date_trunc('day',at_time at time zone 'America/Argentina/Buenos_Aires')::date+daily_time
  when 'six_hours' then date_trunc('day',at_time at time zone 'America/Argentina/Buenos_Aires')+
    floor(extract(hour from at_time at time zone 'America/Argentina/Buenos_Aires')/6)*interval '6 hours'
  when 'hourly' then date_trunc('hour',at_time at time zone 'America/Argentina/Buenos_Aires')
  else at_time at time zone 'America/Argentina/Buenos_Aires' end) at time zone 'America/Argentina/Buenos_Aires';
$$;

create function public.aramis_notification_dispatch(p_workspace_id uuid,p_action text,p_payload jsonb default '{}',p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare b app_private.notification_batches; pref app_private.notification_preferences; mid uuid; email text;
 ids uuid[]; items jsonb; lease_id uuid:=gen_random_uuid(); valid boolean; bucket timestamptz; result jsonb;
begin
 if p_now is null then raise exception 'VALIDATION'; end if;
 perform 1 from public.workspaces where id=p_workspace_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_action='claim' then
  update app_private.notification_queue q set state='skipped' from app_private.notification_events e,app_private.notification_piece_state s,
    app_private.notification_preferences n,public.members m
   where q.event_id=e.id and e.piece_id=s.piece_id and e.workspace_id=p_workspace_id
    and q.member_id=n.member_id and m.id=n.member_id and q.state='pending'
    and (s.sequence<>e.sequence or s.target is distinct from e.audience or not n.enabled or n.audience<>e.audience or not m.active or m.role<>'staff' or app_private.notification_target(e.piece_id) is distinct from e.audience);
  -- Provider idempotency lasts 24h. Never blindly retry beyond a 23h safety window.
  update app_private.notification_batches set state='needs_review',error_code='retry_window_expired',lease=null,lease_until=null
   where workspace_id=p_workspace_id and state in ('ready','retry') and first_attempt_at<=p_now-interval '23 hours'
    and (lease_until is null or lease_until<=p_now);
  update app_private.notification_queue q set state='needs_review' from app_private.notification_batches x
   where q.batch_id=x.id and x.workspace_id=p_workspace_id and x.state='needs_review' and q.state='batched';
  select * into b from app_private.notification_batches
   where workspace_id=p_workspace_id and state in ('ready','retry') and coalesce(retry_at,created_at)<=p_now
    and (lease_until is null or lease_until<=p_now) order by created_at,id limit 1 for update skip locked;
  if b.id is null then
   for pref in select n.* from app_private.notification_preferences n join public.members m on m.id=n.member_id
     where n.workspace_id=p_workspace_id and n.enabled and n.audience<>'unassigned' and m.active and m.role='staff'
      and not exists(select 1 from app_private.notification_batches x where x.member_id=n.member_id and x.state in ('ready','retry','needs_review'))
     order by n.member_id
   loop
    bucket:=app_private.notification_bucket(pref.cadence,pref.daily_time,p_now);
    if pref.cadence<>'immediate' and (p_now<bucket or pref.last_sent_at>=bucket) then continue; end if;
    select u.email into email from auth.users u join public.members m on m.user_id=u.id
     where m.id=pref.member_id and u.email_confirmed_at is not null;
    if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then continue; end if;
    select array_agg(id) into ids from (select q.id from app_private.notification_queue q
     where q.member_id=pref.member_id and q.state='pending' and q.queued_at<=bucket order by q.queued_at,q.id limit 200) queued;
    if ids is null then continue; end if;
    select jsonb_agg(jsonb_build_object('pieceId',p.id,'sequence',e.sequence,'client',c.name,'title',p.title,
     'format',p.format,'plannedDate',p.planned_date,'kind',e.kind,'reason',e.reason) order by p.planned_date nulls last,p.title,p.id) into items
     from app_private.notification_queue q join app_private.notification_events e on e.id=q.event_id
     join public.pieces p on p.id=e.piece_id join public.clients c on c.id=p.client_id where q.id=any(ids);
    insert into app_private.notification_batches(workspace_id,member_id,recipient,audience,items,created_at)
     values(p_workspace_id,pref.member_id,email,pref.audience,items,p_now) returning * into b;
    update app_private.notification_queue set state='batched',batch_id=b.id where id=any(ids);
    exit;
   end loop;
  end if;
  if b.id is null then return 'null'::jsonb; end if;
  update app_private.notification_batches set lease=lease_id,lease_until=p_now+interval '3 minutes' where id=b.id;
  return jsonb_build_object('id',b.id,'lease',lease_id,'recipient',b.recipient,'audience',b.audience,
   'items',b.items,'payload',b.payload,'firstAttemptAt',b.first_attempt_at);
 end if;
 select * into b from app_private.notification_batches where id=(p_payload->>'id')::uuid and workspace_id=p_workspace_id for update;
 if b.id is null then raise exception 'NOT_FOUND'; end if;
 if b.lease is null or b.lease_until is null or p_payload->>'lease' is null or b.lease is distinct from (p_payload->>'lease')::uuid or b.lease_until<=p_now or b.state not in ('ready','retry') then raise exception 'CONFLICT'; end if;
 if p_action='begin-send' then
  select exists(select 1 from app_private.notification_preferences n join public.members m on m.id=n.member_id
   join auth.users u on u.id=m.user_id where n.member_id=b.member_id and n.enabled and n.audience=b.audience
    and m.active and m.role='staff' and u.email=b.recipient and u.email_confirmed_at is not null)
   and not exists(select 1 from app_private.notification_queue q join app_private.notification_events e on e.id=q.event_id
    join app_private.notification_piece_state s on s.piece_id=e.piece_id where q.batch_id=b.id
     and (s.sequence<>e.sequence or s.target is distinct from e.audience or app_private.notification_target(e.piece_id) is distinct from e.audience)) into valid;
  if not valid then
   update app_private.notification_batches set state=case when b.first_attempt_at is null then 'cancelled' else 'needs_review' end,
    error_code='no_longer_actionable',lease=null,lease_until=null where id=b.id;
   update app_private.notification_queue set state=case when b.first_attempt_at is null then 'pending' else 'needs_review' end,batch_id=case when b.first_attempt_at is null then null else batch_id end where batch_id=b.id;
   return jsonb_build_object('send',false);
  end if;
  if b.payload is null then
   perform app_private.check_object(p_payload,array['id','lease','email']);
   if jsonb_typeof(p_payload->'email') is distinct from 'object' or p_payload->'email'->'to'<>jsonb_build_array(b.recipient) then raise exception 'VALIDATION'; end if;
   update app_private.notification_batches set payload=p_payload->'email' where id=b.id;
  end if;
  update app_private.notification_batches set first_attempt_at=coalesce(first_attempt_at,p_now),attempts=attempts+1 where id=b.id returning * into b;
  return jsonb_build_object('send',true,'email',b.payload);
 elsif p_action='sent' then
  if length(coalesce(p_payload->>'providerId','')) not between 1 and 160 then raise exception 'VALIDATION'; end if;
  update app_private.notification_batches set state='sent',sent_at=p_now,provider_id=p_payload->>'providerId',lease=null,lease_until=null,error_code=null where id=b.id;
  update app_private.notification_queue set state='sent' where batch_id=b.id;
  update app_private.notification_preferences set last_sent_at=p_now where member_id=b.member_id;
 elsif p_action='failed' then
  update app_private.notification_batches set state=case when b.attempts>=7 or coalesce((p_payload->>'permanent')::boolean,false) then 'needs_review' else 'retry' end,
   retry_at=p_now+least(3600,power(2,greatest(0,b.attempts-1))*60)*interval '1 second',
   error_code=case when p_payload->>'code' in ('provider_rejected','provider_unavailable','unknown_result','invalid_payload') then p_payload->>'code' else 'unknown_result' end,
   lease=null,lease_until=null where id=b.id returning * into b;
  if b.state='needs_review' then update app_private.notification_queue set state='needs_review' where batch_id=b.id; end if;
 else raise exception 'VALIDATION'; end if;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function app_private.notification_target(uuid),app_private.capture_notification_transition(),
 app_private.notification_pref_json(app_private.notification_preferences),app_private.notification_bucket(text,time,timestamptz)
 from public,anon,authenticated,service_role;
revoke all on function public.aramis_notification_preferences(uuid,jsonb,uuid),
 public.aramis_notification_dispatch(uuid,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.aramis_notification_preferences(uuid,jsonb,uuid) to authenticated;
grant execute on function public.aramis_notification_dispatch(uuid,text,jsonb,timestamptz) to service_role;
commit;
