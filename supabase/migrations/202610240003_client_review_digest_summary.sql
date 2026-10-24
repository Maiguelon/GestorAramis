-- Coalescing must retain earlier corrections if another section is answered before the digest.
begin;
create or replace function app_private.client_review_notify(target uuid,response_key uuid,answers jsonb) returns void
language plpgsql set search_path='' as $$
declare r app_private.client_pilot_requests; area text; selected jsonb; event_id uuid; seq bigint; event_kind text; reason text;
begin
 select * into r from app_private.client_pilot_requests where id=target;
 for area in select unnest(array['marketing','design']) loop
   if not exists(select 1 from jsonb_array_elements(answers) a where
    (area='design' and r.kind='delivery' and a->>'part'='content' and a->>'decision' in ('changes','comment')) or
    (area='marketing' and (r.kind='script' or a->>'part'='caption' or a->>'decision'='approved'))) then continue; end if;
   select jsonb_agg(a) into selected from (
    select jsonb_build_object('part','content','decision',r.content_status,'comment',r.content_comment) a
     where r.content_status in ('approved','changes') and
      (area='marketing' and (r.kind='script' or r.content_status='approved') or area='design' and r.kind='delivery' and r.content_status='changes')
    union all select jsonb_build_object('part','caption','decision',r.caption_status,'comment',r.caption_comment)
     where area='marketing' and r.caption_status in ('approved','changes')
    union all select a from jsonb_array_elements(answers) a where a->>'decision'='comment' and
      (area='marketing' and (r.kind='script' or a->>'part'='caption') or area='design' and r.kind='delivery' and a->>'part'='content')
   ) sections;
   event_kind:=case when exists(select 1 from jsonb_array_elements(selected) a where a->>'decision'='changes') then 'client_changes'
     when exists(select 1 from jsonb_array_elements(selected) a where a->>'decision'='comment') then 'client_comment' else 'client_approved' end;
   select string_agg(case a->>'part' when 'caption' then 'Caption' else case r.kind when 'script' then 'Guion' else 'Entrega' end end||': '||
     case a->>'decision' when 'approved' then 'Aprobado' when 'changes' then 'Cambios pedidos · '||(a->>'comment') else 'Comentario · '||(a->>'comment') end,E'\n') into reason from jsonb_array_elements(selected) a;
   select least(coalesce(min(sequence),0),0)-1 into seq from app_private.notification_events where piece_id=r.piece_id;
   insert into app_private.notification_events(workspace_id,piece_id,sequence,audience,kind,reason,client_request_id,client_response_key,source)
     values(r.workspace_id,r.piece_id,seq,area,event_kind,left(reason,2000),r.id,response_key,'client') returning id into event_id;
   insert into app_private.notification_queue(member_id,event_id)
    select pref.member_id,event_id from app_private.notification_preferences pref join public.members m on m.id=pref.member_id
    where pref.workspace_id=r.workspace_id and pref.enabled and pref.audience=area and m.active and m.role='staff';
 end loop;
end $$;
commit;
