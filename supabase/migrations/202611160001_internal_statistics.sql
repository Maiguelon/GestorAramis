begin;

create table app_private.statistics_readers (
  workspace_id uuid not null,
  member_id uuid not null,
  primary key (workspace_id, member_id),
  foreign key (workspace_id, member_id) references public.members(workspace_id, id) on delete cascade
);
alter table app_private.statistics_readers enable row level security;
revoke all on app_private.statistics_readers from public, anon, authenticated, service_role;

create function app_private.may_read_statistics(w uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from app_private.statistics_readers reader
    join public.members member on member.workspace_id = reader.workspace_id and member.id = reader.member_id
    where reader.workspace_id = w and member.user_id = (select auth.uid())
      and member.active and member.role = 'staff'
  );
$$;
revoke all on function app_private.may_read_statistics(uuid) from public, anon, authenticated, service_role;

-- Decisions can be replaced on the delivery row. Preserve their original order and source.
create table app_private.delivery_decisions (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references app_private.deliveries(id) on delete cascade,
  kind text not null check (kind in ('approved', 'changes', 'reopened')),
  source text not null check (source in ('team', 'client')),
  occurred_at timestamptz not null
);
create index delivery_decisions_history on app_private.delivery_decisions(delivery_id, occurred_at, id);
alter table app_private.delivery_decisions enable row level security;
revoke all on app_private.delivery_decisions from public, anon, authenticated, service_role;

-- Import only decisions whose source and timestamp are still present on the version.
-- A prior decision overwritten before this migration is not reconstructed.
insert into app_private.delivery_decisions(delivery_id, kind, source, occurred_at)
select id, status, source, decided_at from app_private.deliveries
where status in ('approved', 'changes') and source is not null and decided_at >= created_at;

create function app_private.capture_delivery_decision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('approved', 'changes') and new.source is not null and new.decided_at is not null
    and (new.status, new.source, new.decided_at) is distinct from (old.status, old.source, old.decided_at) then
    insert into app_private.delivery_decisions(delivery_id, kind, source, occurred_at)
    values (new.id, new.status, new.source, new.decided_at);
  elsif new.status = 'pending' and old.status = 'approved' then
    insert into app_private.delivery_decisions(delivery_id, kind, source, occurred_at)
    values (new.id, 'reopened', 'team', statement_timestamp());
  end if;
  return null;
end $$;
revoke all on function app_private.capture_delivery_decision() from public, anon, authenticated, service_role;
create trigger statistics_delivery_decision after update of status, source, decided_at on app_private.deliveries
for each row execute function app_private.capture_delivery_decision();

-- Publish the UI capability to the current session only. The stats RPC rechecks it itself.
do $$
declare body text;
begin
  body := pg_get_functiondef('public.aramis_workspace(uuid)'::regprocedure);
  if strpos(body,'''memberId'',v_member') = 0 then raise exception 'Statistics workspace anchor missing'; end if;
  execute replace(body, '''memberId'',v_member',
    '''memberId'',v_member,''canViewStatistics'',app_private.may_read_statistics(p_workspace_id)');
end $$;

create function public.aramis_statistics(
  p_workspace_id uuid, p_from date, p_through date, p_client_id uuid, p_format text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  start_at timestamptz;
  end_at timestamptz;
  result jsonb;
begin
  if not app_private.may_read_statistics(p_workspace_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_through is null
    or p_from < date '2000-01-01' or p_through > date '2099-12-01'
    or extract(day from p_from) <> 1 or extract(day from p_through) <> 1
    or p_through < p_from or p_through >= p_from + interval '24 months'
    or (p_format is not null and p_format not in ('reel', 'post', 'carousel', 'story')) then
    raise exception 'VALIDATION';
  end if;
  start_at := p_from::timestamp at time zone 'America/Argentina/Buenos_Aires';
  end_at := (p_through + interval '1 month') at time zone 'America/Argentina/Buenos_Aires';

  with workspace_pieces as (
    select p.id, p.client_id, p.status, p.archived,
      coalesce(pp.plan_month, to_char(coalesce(p.planned_date, (p.created_at at time zone 'UTC')::date), 'YYYY-MM')) as plan_month
    from public.pieces p left join public.piece_production pp on pp.piece_id = p.id
    where p.workspace_id = p_workspace_id and (p_format is null or p.format = p_format)
  ), recipients as (
    select pc.piece_id, pc.client_id, true as shared
    from app_private.piece_clients pc join workspace_pieces p on p.id = pc.piece_id
    union all
    select p.id, p.client_id, false
    from workspace_pieces p where not exists (select 1 from app_private.piece_clients pc where pc.piece_id = p.id)
  ), pieces as (
    select p.* from workspace_pieces p
    where p_client_id is null or exists (
      select 1 from recipients r where r.piece_id = p.id and r.client_id = p_client_id
    )
  ), approvals as (
    select p.id as piece_id, d.decided_at,
      exists (
        select 1 from app_private.deliveries earlier
        join app_private.delivery_decisions decision on decision.delivery_id = earlier.id and decision.kind = 'changes'
        where earlier.piece_id = p.id and decision.occurred_at <= d.decided_at
      ) as had_changes
    from pieces p
    join lateral (
      select version.id, version.status, version.invalidated_at, version.decided_at
      from app_private.deliveries version where version.piece_id = p.id
      order by version.version desc limit 1
    ) d on d.status = 'approved' and d.invalidated_at is null and d.decided_at is not null
    where p.status in ('approved', 'scheduled', 'published')
  ), approved_in_period as (
    select * from approvals where decided_at >= start_at and decided_at < end_at
  ), first_deliveries as (
    select extract(epoch from (d.created_at - ready.occurred_at)) / 3600 as hours
    from app_private.deliveries d join pieces p on p.id = d.piece_id
    join lateral (
      select e.occurred_at from app_private.notification_events e
      where e.workspace_id = p_workspace_id and e.piece_id = p.id
        and e.kind = 'ready' and e.audience = 'design' and e.occurred_at <= d.created_at
      order by e.sequence desc limit 1
    ) ready on true
    where d.version = 1 and d.created_at >= start_at and d.created_at < end_at
  ), internal_reviews as (
    select extract(epoch from (first_decision.occurred_at - d.created_at)) / 3600 as hours
    from app_private.deliveries d join pieces p on p.id = d.piece_id
    join lateral (
      select decision.occurred_at, decision.source
      from app_private.delivery_decisions decision
      where decision.delivery_id = d.id and decision.kind in ('approved', 'changes')
        and decision.occurred_at >= d.created_at
      order by decision.occurred_at, decision.id limit 1
    ) first_decision on first_decision.source = 'team'
    where first_decision.occurred_at >= start_at and first_decision.occurred_at < end_at
  ), by_client as (
    select r.client_id,
      count(*) filter (where a.piece_id is not null) as approved,
      count(*) filter (where a.had_changes) as reworked,
      count(*) filter (where r.shared and a.piece_id is not null) as shared_approved,
      count(*) filter (where not r.shared and not p.archived
        and p.plan_month between to_char(p_from, 'YYYY-MM') and to_char(p_through, 'YYYY-MM')) as assigned,
      count(*) filter (where not r.shared and not p.archived and p.status in ('approved', 'scheduled', 'published')
        and p.plan_month between to_char(p_from, 'YYYY-MM') and to_char(p_through, 'YYYY-MM')) as plan_approved
    from recipients r join pieces p on p.id = r.piece_id
    left join approved_in_period a on a.piece_id = p.id
    where p_client_id is null or r.client_id = p_client_id
    group by r.client_id
  )
  select jsonb_build_object(
    'approved', (select count(*) from approved_in_period),
    'clientsServed', (select count(*) from by_client where approved > 0),
    'firstDelivery', (select jsonb_build_object('count', count(*), 'medianHours',
      percentile_cont(0.5) within group (order by hours::double precision)) from first_deliveries),
    'internalReview', (select jsonb_build_object('count', count(*), 'medianHours',
      percentile_cont(0.5) within group (order by hours::double precision)) from internal_reviews),
    'clients', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
      order by lower(c.name), c.id), '[]'::jsonb) from public.clients c where c.workspace_id = p_workspace_id),
    'byClient', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'approved', b.approved, 'reworked', b.reworked,
      'sharedApproved', b.shared_approved, 'assigned', b.assigned, 'planApproved', b.plan_approved
      ) order by lower(c.name), c.id), '[]'::jsonb)
      from by_client b join public.clients c on c.id = b.client_id and c.workspace_id = p_workspace_id
      where b.approved > 0 or b.assigned > 0)
  ) into result;
  return result;
end $$;
revoke all on function public.aramis_statistics(uuid, date, date, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.aramis_statistics(uuid, date, date, uuid, text) to authenticated;

commit;
