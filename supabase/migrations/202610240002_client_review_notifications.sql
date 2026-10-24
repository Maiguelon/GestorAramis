-- Reuse existing preferences, cadences, leases and frozen provider idempotency.
begin;
alter table app_private.notification_events
 drop constraint notification_events_kind_check,
 add constraint notification_events_kind_check check(kind in ('ready','returned','review','client_approved','client_changes','client_comment')),
 add column client_request_id uuid references app_private.client_pilot_requests(id),
 add column client_response_key uuid,
 add column source text not null default 'team' check(source in ('team','client'));

create function app_private.client_review_notify(target uuid,response_key uuid,answers jsonb) returns void
language plpgsql set search_path='' as $$
declare r app_private.client_pilot_requests; area text; selected jsonb; event_id uuid; seq bigint; event_kind text; reason text;
begin
 select * into r from app_private.client_pilot_requests where id=target;
 for area in select unnest(array['marketing','design']) loop
   select jsonb_agg(a) into selected from jsonb_array_elements(answers) a where
    (area='design' and r.kind='delivery' and a->>'part'='content' and a->>'decision' in ('changes','comment')) or
    (area='marketing' and (r.kind='script' or a->>'part'='caption' or a->>'decision'='approved'));
   if selected is null then continue; end if;
   event_kind:=case when exists(select 1 from jsonb_array_elements(selected) a where a->>'decision'='changes') then 'client_changes'
     when exists(select 1 from jsonb_array_elements(selected) a where a->>'decision'='comment') then 'client_comment' else 'client_approved' end;
   select string_agg(case a->>'part' when 'caption' then 'Caption' else case r.kind when 'script' then 'Guion' else 'Entrega' end end||': '||
     case a->>'decision' when 'approved' then 'Aprobado' when 'changes' then 'Cambios pedidos · '||(a->>'comment') else 'Comentario · '||(a->>'comment') end,E'\n') into reason from jsonb_array_elements(selected) a;
   -- Negative sequence namespace does not invalidate normal production/review transitions.
   select least(coalesce(min(sequence),0),0)-1 into seq from app_private.notification_events where piece_id=r.piece_id;
   insert into app_private.notification_events(workspace_id,piece_id,sequence,audience,kind,reason,client_request_id,client_response_key,source)
     values(r.workspace_id,r.piece_id,seq,area,event_kind,left(reason,2000),r.id,response_key,'client') returning id into event_id;
   insert into app_private.notification_queue(member_id,event_id)
    select pref.member_id,event_id from app_private.notification_preferences pref join public.members m on m.id=pref.member_id
    where pref.workspace_id=r.workspace_id and pref.enabled and pref.audience=area and m.active and m.role='staff';
 end loop;
end $$;
revoke all on function app_private.client_review_notify(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.notification_event_current(e app_private.notification_events) returns boolean
language sql stable set search_path='' as $$
 select case when e.client_request_id is null then exists(select 1 from app_private.notification_piece_state s
   where s.piece_id=e.piece_id and s.sequence=e.sequence and s.target=e.audience and app_private.notification_target(e.piece_id)=e.audience)
 else exists(select 1 from app_private.client_pilot_requests r join public.pieces p on p.id=r.piece_id
   join app_private.client_pilot_calendar cal on cal.piece_id=p.id
   join public.clients c on c.id=p.client_id and c.archived_at is null
   where r.id=e.client_request_id and r.status<>'superseded' and not p.archived
    and not exists(select 1 from app_private.piece_clients where piece_id=p.id)
    and e.client_response_key=case e.audience when 'design' then r.design_response_key else r.marketing_response_key end
    and ((r.kind='script' and p.status in ('planned','production')) or (r.kind='delivery' and exists(select 1 from app_private.deliveries d
      where d.id=r.delivery_id and d.invalidated_at is null and d.version=(select max(version) from app_private.deliveries where piece_id=p.id))))) end;
$$;
revoke all on function app_private.notification_event_current(app_private.notification_events) from public,anon,authenticated,service_role;

do $migration$
declare body text; needle text; replacement text;
begin
 body:=pg_get_functiondef('public.aramis_notification_dispatch(uuid,text,jsonb,timestamptz)'::regprocedure);
 needle:='s.sequence<>e.sequence or s.target is distinct from e.audience or not n.enabled or n.audience<>e.audience or not m.active or m.role<>''staff'' or app_private.notification_target(e.piece_id) is distinct from e.audience';
 replacement:='not app_private.notification_event_current(e) or not n.enabled or n.audience<>e.audience or not m.active or m.role<>''staff''';
 if position(needle in body)=0 then raise exception 'Notification claim changed'; end if;
 body:=replace(body,needle,replacement);
 needle:='s.sequence<>e.sequence or s.target is distinct from e.audience or app_private.notification_target(e.piece_id) is distinct from e.audience';
 if position(needle in body)=0 then raise exception 'Notification revalidation changed'; end if;
 body:=replace(body,needle,'not app_private.notification_event_current(e)');
 body:=replace(body,'''kind'',e.kind,''reason'',e.reason','''kind'',e.kind,''reason'',e.reason,''source'',e.source');
 execute body;
 body:=pg_get_functiondef('app_private.capture_notification_transition()'::regprocedure);
 needle:='if t is null then return null; end if;';
 if position(needle in body)=0 then raise exception 'Transition capture changed'; end if;
 replacement:=needle||$code$
 -- Client events already provide one area-specific update. Still advance the state above.
 if exists(select 1 from app_private.client_pilot_requests r join app_private.deliveries d on d.id=r.delivery_id
   where r.piece_id=target_piece and r.batch_review and r.status='changes' and r.content_status='changes'
    and r.design_response_key is not null and d.source='client' and d.status='changes' and d.invalidated_at is null
    and d.version=(select max(version) from app_private.deliveries where piece_id=target_piece)) then return null; end if;
$code$;
 execute replace(body,needle,replacement);
end $migration$;
commit;
