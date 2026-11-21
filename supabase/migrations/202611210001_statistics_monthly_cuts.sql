begin;

-- The first known commitment is immutable. Existing dates are only known as of
-- activation, so approvals before that timestamp cannot enter the deadline KPI.
create table app_private.piece_deadlines (
  piece_id uuid primary key references public.pieces(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  planned_date date not null,
  recorded_at timestamptz not null,
  origin text not null check (origin in ('existing', 'assigned'))
);
alter table app_private.piece_deadlines enable row level security;
revoke all on app_private.piece_deadlines from public, anon, authenticated, service_role;
insert into app_private.piece_deadlines
select id, workspace_id, planned_date, statement_timestamp(), 'existing'
from public.pieces where planned_date is not null;

create function app_private.capture_piece_deadline() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.planned_date is not null then
    insert into app_private.piece_deadlines(piece_id, workspace_id, planned_date, recorded_at, origin)
    values (new.id, new.workspace_id, new.planned_date, statement_timestamp(), 'assigned')
    on conflict (piece_id) do nothing;
  end if;
  return null;
end $$;
revoke all on function app_private.capture_piece_deadline() from public, anon, authenticated, service_role;
create trigger statistics_piece_deadline after insert or update of planned_date on public.pieces
for each row execute function app_private.capture_piece_deadline();

-- Keep the established calculation intact as a private primitive. The public
-- wrapper below checks access; the scheduled closer has a separate service grant.
alter function public.aramis_statistics(uuid,date,date,uuid,text) set schema app_private;
alter function app_private.aramis_statistics(uuid,date,date,uuid,text) rename to statistics_base;
do $$
declare body text; guard text := E'  if not app_private.may_read_statistics(p_workspace_id) then\n    raise exception ''forbidden'' using errcode = ''42501'';\n  end if;';
begin
  body := pg_get_functiondef('app_private.statistics_base(uuid,date,date,uuid,text)'::regprocedure);
  if strpos(body, guard) = 0 then raise exception 'Statistics access anchor missing'; end if;
  execute replace(body, guard, '');
end $$;
revoke all on function app_private.statistics_base(uuid,date,date,uuid,text) from public, anon, authenticated, service_role;

create function app_private.statistics_report(w uuid, f date, t date, client uuid, fmt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare base jsonb; extra jsonb;
begin
  base := app_private.statistics_base(w,f,t,client,fmt);
  with approvals as (
    select p.id, p.title, p.format, d.decided_at, deadline.planned_date,
      deadline.recorded_at <= d.decided_at as known_deadline,
      (select count(*) from app_private.deliveries v where v.piece_id=p.id and v.created_at<=d.decided_at) as versions,
      (select count(*) from app_private.deliveries v join app_private.delivery_decisions e on e.delivery_id=v.id
        where v.piece_id=p.id and e.kind='changes' and e.source='team' and e.occurred_at<=d.decided_at) as team_changes,
      (select count(*) from app_private.deliveries v join app_private.delivery_decisions e on e.delivery_id=v.id
        where v.piece_id=p.id and e.kind='changes' and e.source='client' and e.occurred_at<=d.decided_at) as client_changes,
      (select jsonb_agg(c.name order by lower(c.name),c.id) from public.clients c
        where c.workspace_id=w and c.id in (
          select pc.client_id from app_private.piece_clients pc where pc.piece_id=p.id
          union all select p.client_id where not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)
        )) as clients
    from public.pieces p
    join lateral (select * from app_private.deliveries v where v.piece_id=p.id order by version desc limit 1) d
      on d.status='approved' and d.invalidated_at is null
    left join app_private.piece_deadlines deadline on deadline.piece_id=p.id and deadline.workspace_id=w
    where p.workspace_id=w and p.status in ('approved','scheduled','published')
      and (fmt is null or p.format=fmt)
      and (client is null or exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id and pc.client_id=client)
        or (p.client_id=client and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)))
      and d.decided_at >= (f::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and d.decided_at < ((t+interval '1 month') at time zone 'America/Argentina/Buenos_Aires')
  ), measured as (
    select *, case when known_deadline is not true then 'unknown'
      when (decided_at at time zone 'America/Argentina/Buenos_Aires')::date <= planned_date then 'on_time'
      else 'late' end as deadline_result from approvals
  )
  select jsonb_build_object(
    'definitionVersion',2,
    'versions',(select jsonb_build_object('count',count(*),'median',percentile_cont(0.5) within group(order by versions::double precision),
      'one',count(*) filter(where versions=1),'two',count(*) filter(where versions=2),'threePlus',count(*) filter(where versions>=3)) from measured),
    'deadline',(select jsonb_build_object('count',count(*) filter(where deadline_result<>'unknown'),
      'onTime',count(*) filter(where deadline_result='on_time'),'late',count(*) filter(where deadline_result='late'),
      'unknown',count(*) filter(where deadline_result='unknown'),
      'percent',100.0*count(*) filter(where deadline_result='on_time')/nullif(count(*) filter(where deadline_result<>'unknown'),0)) from measured),
    'pieces',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'format',format,'clients',clients,
      'approvedAt',decided_at,'versions',versions,'teamChanges',team_changes,'clientChanges',client_changes,
      'deadline',case when known_deadline then planned_date else null end,'deadlineResult',deadline_result)
      order by decided_at,id),'[]'::jsonb) from measured)
  ) into extra;
  return base || extra;
end $$;
revoke all on function app_private.statistics_report(uuid,date,date,uuid,text) from public, anon, authenticated, service_role;

create function public.aramis_statistics(p_workspace_id uuid,p_from date,p_through date,p_client_id uuid,p_format text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.may_read_statistics(p_workspace_id) then raise exception 'forbidden' using errcode='42501'; end if;
  return app_private.statistics_report(p_workspace_id,p_from,p_through,p_client_id,p_format);
end $$;
revoke all on function public.aramis_statistics(uuid,date,date,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.aramis_statistics(uuid,date,date,uuid,text) to authenticated;

create table app_private.statistics_tracking (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  started_at timestamptz not null default statement_timestamp()
);
create table app_private.statistics_monthly_snapshots (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month date not null check (extract(day from month)=1),
  captured_at timestamptz not null default statement_timestamp(),
  capture_type text not null check (capture_type in ('manual','automatic')),
  definition_version integer not null,
  report jsonb not null,
  primary key(workspace_id,month)
);
alter table app_private.statistics_tracking enable row level security;
alter table app_private.statistics_monthly_snapshots enable row level security;
revoke all on app_private.statistics_tracking, app_private.statistics_monthly_snapshots from public, anon, authenticated, service_role;
insert into app_private.statistics_tracking(workspace_id) select distinct workspace_id from app_private.statistics_readers;
create function app_private.start_statistics_tracking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app_private.statistics_tracking(workspace_id) values(new.workspace_id) on conflict do nothing;
  return null;
end $$;
revoke all on function app_private.start_statistics_tracking() from public, anon, authenticated, service_role;
create trigger statistics_tracking_start after insert on app_private.statistics_readers
for each row execute function app_private.start_statistics_tracking();

create function app_private.statistics_snapshot_json(s app_private.statistics_monthly_snapshots) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('month',to_char(s.month,'YYYY-MM'),'capturedAt',s.captured_at,
    'captureType',s.capture_type,'definitionVersion',s.definition_version,'report',s.report);
$$;
revoke all on function app_private.statistics_snapshot_json(app_private.statistics_monthly_snapshots) from public, anon, authenticated, service_role;

create function app_private.capture_statistics_month(w uuid,m date,kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved app_private.statistics_monthly_snapshots; result jsonb;
begin
  if m is null or extract(day from m)<>1 or m<date '2000-01-01'
    or m>=date_trunc('month',statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'VALIDATION';
  end if;
  -- All captures of this workspace serialize; the first successful write wins.
  perform 1 from app_private.statistics_tracking where workspace_id=w for update;
  if not found then raise exception 'VALIDATION'; end if;
  select * into saved from app_private.statistics_monthly_snapshots where workspace_id=w and month=m;
  if found then return app_private.statistics_snapshot_json(saved); end if;
  result := app_private.statistics_report(w,m,m,null,null);
  insert into app_private.statistics_monthly_snapshots(workspace_id,month,capture_type,definition_version,report)
  values(w,m,kind,2,result) returning * into saved;
  return app_private.statistics_snapshot_json(saved);
end $$;
revoke all on function app_private.capture_statistics_month(uuid,date,text) from public, anon, authenticated, service_role;

create function public.aramis_statistics_snapshots(p_workspace_id uuid,p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not app_private.may_read_statistics(p_workspace_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_month is null then
    select coalesce(jsonb_agg(app_private.statistics_snapshot_json(s)-'report' order by month desc),'[]'::jsonb)
    into result from app_private.statistics_monthly_snapshots s where workspace_id=p_workspace_id;
  else
    select app_private.statistics_snapshot_json(s) into result from app_private.statistics_monthly_snapshots s
    where workspace_id=p_workspace_id and month=p_month;
  end if;
  return result;
end $$;
revoke all on function public.aramis_statistics_snapshots(uuid,date) from public, anon, authenticated, service_role;
grant execute on function public.aramis_statistics_snapshots(uuid,date) to authenticated;

create function public.aramis_statistics_snapshot(p_workspace_id uuid,p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.may_read_statistics(p_workspace_id) then raise exception 'forbidden' using errcode='42501'; end if;
  return app_private.capture_statistics_month(p_workspace_id,p_month,'manual');
end $$;
revoke all on function public.aramis_statistics_snapshot(uuid,date) from public, anon, authenticated, service_role;
grant execute on function public.aramis_statistics_snapshot(uuid,date) to authenticated;

-- Called independently of email preferences. Catch up one closed month per tick,
-- starting with the activation month; never manufacture historical month-end cuts.
create function public.aramis_statistics_close_month(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m date;
begin
  select candidate::date into m from app_private.statistics_tracking tracking
  cross join lateral generate_series(date_trunc('month',tracking.started_at at time zone 'America/Argentina/Buenos_Aires'),
    date_trunc('month',statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')-interval '1 month',interval '1 month') candidate
  where tracking.workspace_id=p_workspace_id and not exists (
    select 1 from app_private.statistics_monthly_snapshots s where s.workspace_id=p_workspace_id and s.month=candidate::date)
  order by candidate limit 1;
  if m is null then return null; end if;
  return app_private.capture_statistics_month(p_workspace_id,m,'automatic')-'report';
end $$;
revoke all on function public.aramis_statistics_close_month(uuid) from public, anon, authenticated, service_role;
grant execute on function public.aramis_statistics_close_month(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
