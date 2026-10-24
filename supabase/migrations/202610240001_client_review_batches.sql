-- Atomic client responses. Existing individual-response clients retain their semantics.
begin;
alter table app_private.client_pilot_requests
 add column batch_review boolean not null default false,
 add column content_comment text not null default '',
 add column caption_comment text not null default '',
 add column marketing_response_key uuid,
 add column design_response_key uuid;
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.aramis_client_pilot(uuid,uuid,text,text,jsonb)'::regprocedure);
 execute replace(body,'public.aramis_client_pilot(', 'app_private.client_pilot_legacy(');
end $migration$;
revoke all on function app_private.client_pilot_legacy(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create or replace function app_private.client_pilot_current(r app_private.client_pilot_requests) returns boolean
language sql stable set search_path='' as $$
 select (r.status='pending' or (r.batch_review and r.status='changes' and (r.content_status='pending' or r.caption_status='pending'))) and exists(select 1 from public.pieces p where p.id=r.piece_id and not p.archived
   and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)
   and (case when r.kind='script' then (p.status='planned' or (r.separate_parts and p.status='production')) else (p.status='review' or (r.batch_review and p.status='production')) and exists(
     select 1 from app_private.deliveries d where d.id=r.delivery_id and d.piece_id=p.id and (d.status='pending' or (r.batch_review and d.status='changes'))
       and d.invalidated_at is null and d.version=(select max(version) from app_private.deliveries where piece_id=p.id)) end));
$$;
create or replace function app_private.client_pilot_view(w uuid,c uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
 'client',(select jsonb_build_object('id',id,'name',name,'initials',initials,'color',color) from public.clients where id=c and workspace_id=w and archived_at is null),
 'pieces',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'format',p.format,'plannedDate',p.planned_date,'status',p.status) order by p.planned_date nulls last,p.id)
   from public.pieces p join app_private.client_pilot_calendar cal on cal.piece_id=p.id
   where p.workspace_id=w and p.client_id=c and not p.archived
     and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)),'[]'),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'pieceId',r.piece_id,'kind',r.kind,'version',r.version,'text',r.text,'caption',r.caption,'separateParts',r.separate_parts,'contentStatus',r.content_status,'captionStatus',r.caption_status,
   'assets',case when r.kind='delivery' then coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name','mimeType',a->>'mimeType','size',a->'size'))
     from app_private.deliveries d cross join lateral jsonb_array_elements(d.assets) a where d.id=r.delivery_id),'[]') else '[]' end,
   'status',case when r.status='pending' and not app_private.client_pilot_current(r) then 'superseded' else r.status end,
   'canRespond',app_private.client_pilot_current(r),'comment',r.comment,'createdAt',r.created_at,
   'comments',coalesce((select jsonb_agg(jsonb_build_object('text',x.body->>'comment','author',x.body->>'author','createdAt',x.created_at) order by x.created_at)
      from app_private.client_pilot_responses original cross join lateral (select original.body where not (original.body ? 'answers') union all select a || jsonb_build_object('author',original.body->>'author') from jsonb_array_elements(coalesce(original.body->'answers','[]')) a) as entry(body) cross join lateral (select entry.body,original.created_at) x where original.request_id=r.id and x.body->>'decision'='comment'),'[]')) order by r.created_at desc)
   from app_private.client_pilot_requests r join public.pieces p on p.id=r.piece_id
   join app_private.client_pilot_calendar cal on cal.piece_id=p.id
   where r.workspace_id=w and r.client_id=c and p.client_id=c and not p.archived and r.status<>'superseded'
     and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)
     and r.version=(select max(version) from app_private.client_pilot_requests where piece_id=r.piece_id and kind=r.kind)),'[]'));
$$;

create or replace function public.aramis_client_pilot(p_workspace_id uuid,p_user_id uuid,p_token_hash text,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id; c uuid; r app_private.client_pilot_requests; p public.pieces; d app_private.deliveries;
 prior jsonb; answer jsonb; part text; decision text; note text; author text; response_key uuid;
 seen text[]:='{}'; reason text; summary text; marketing boolean:=false; design boolean:=false;
begin
 if p_action<>'respond-batch' then return app_private.client_pilot_legacy(w,p_user_id,p_token_hash,p_action,p_payload); end if;
 perform 1 from public.workspaces where id=w for update;
 if not found or p_user_id is not null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_ACCESS'; end if;
 select l.client_id into c from app_private.client_pilot_links l join public.clients cl on cl.id=l.client_id and cl.workspace_id=w and cl.archived_at is null
   where l.workspace_id=w and l.token_hash=p_token_hash and l.revoked_at is null;
 if c is null then raise exception 'INVALID_ACCESS'; end if;
 perform app_private.check_object(p_payload,array['requestId','version','key','author','answers']);
 select * into r from app_private.client_pilot_requests where id=(p_payload->>'requestId')::uuid and workspace_id=w and client_id=c for update;
 if r.id is null or not exists(select 1 from app_private.client_pilot_calendar where piece_id=r.piece_id) then raise exception 'INVALID_ACCESS'; end if;
 select * into p from public.pieces where id=r.piece_id and client_id=c and workspace_id=w and not archived for update;
 if p.id is null or exists(select 1 from app_private.piece_clients where piece_id=p.id) then raise exception 'INVALID_ACCESS'; end if;
 response_key:=(p_payload->>'key')::uuid;
 if response_key is null then raise exception 'VALIDATION'; end if;
 select body into prior from app_private.client_pilot_responses where request_id=r.id and idempotency_key=response_key;
 if prior is not null then
   if prior is distinct from p_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return app_private.client_pilot_view(w,c);
 end if;
 if (p_payload->>'version')::numeric is distinct from r.version::numeric or not app_private.client_pilot_current(r) then raise exception 'CONFLICT'; end if;
 author:=btrim(p_payload->>'author');
 if author is null or length(author) not between 1 and 120 or jsonb_typeof(p_payload->'answers') is distinct from 'array' then raise exception 'VALIDATION'; end if;
 if jsonb_array_length(p_payload->'answers') not between 1 and 2 then raise exception 'VALIDATION'; end if;
 -- Validate all answers before changing any section, receipt or event.
 for answer in select * from jsonb_array_elements(p_payload->'answers') loop
   perform app_private.check_object(answer,array['part','decision','comment']);
   part:=answer->>'part'; decision:=answer->>'decision'; note:=btrim(answer->>'comment');
   if part is null or part not in ('content','caption') or part=any(seen) or decision is null or decision not in ('approved','changes','comment')
     or note is null or length(note)>10000 or (decision<>'approved' and length(note)=0) then raise exception 'VALIDATION'; end if;
   if r.separate_parts then
     if (case part when 'content' then r.content_status else r.caption_status end) is distinct from 'pending' then raise exception 'CONFLICT'; end if;
   elsif part<>'content' or r.status<>'pending' then raise exception 'CONFLICT'; end if;
   seen:=array_append(seen,part);
 end loop;
 if not r.separate_parts then r.content_status:='pending'; end if;
 for answer in select * from jsonb_array_elements(p_payload->'answers') loop
   part:=answer->>'part'; decision:=answer->>'decision'; note:=btrim(answer->>'comment');
   if decision<>'comment' then
     if part='content' then r.content_status:=decision; r.content_comment:=note; else r.caption_status:=decision; r.caption_comment:=note; end if;
   end if;
   marketing:=marketing or r.kind='script' or part='caption' or decision='approved';
   design:=design or (r.kind='delivery' and part='content' and decision in ('changes','comment'));
 end loop;
 r.status:=case when r.content_status='changes' or r.caption_status='changes' then 'changes'
   when coalesce(r.content_status,'approved')='approved' and coalesce(r.caption_status,'approved')='approved' then 'approved' else 'pending' end;
 reason:=concat_ws(E'\n',case when r.content_status='changes' then case r.kind when 'delivery' then 'Entrega: ' else 'Guion: ' end||r.content_comment end,
   case when r.caption_status='changes' then 'Caption: '||r.caption_comment end);
 if r.kind='delivery' then
   select * into d from app_private.deliveries where id=r.delivery_id;
   if r.status='approved' then
     perform app_private.delivery_command(w,jsonb_build_object('type','review-delivery','pieceId',p.id,'expectedRevision',p.revision,'deliveryId',d.id,'decision','approved','comment','','source','client'),'Cliente: '||author);
   elsif r.status='changes' then
     update app_private.deliveries set status='changes',comment=reason,source='client',decided_by='Cliente: '||author,decided_at=now() where id=d.id;
     update public.pieces set status='production',revision=revision+1,updated_at=statement_timestamp() where id=p.id;
     update public.piece_production set work_area=case when r.content_status='changes' then 'design' else 'marketing' end,production_stage='ready' where piece_id=p.id;
   end if;
 elsif r.status='changes' then
   update public.pieces set status='planned',revision=revision+1,updated_at=statement_timestamp() where id=p.id;
   update public.piece_production set work_area='marketing',production_stage='ready' where piece_id=p.id;
 end if;
 update app_private.client_pilot_requests set batch_review=true,status=r.status,content_status=r.content_status,caption_status=r.caption_status,
   content_comment=r.content_comment,caption_comment=r.caption_comment,comment=reason,
   marketing_response_key=case when marketing then response_key else marketing_response_key end,
   design_response_key=case when design then response_key else design_response_key end where id=r.id;
 insert into app_private.client_pilot_responses values(r.id,response_key,p_payload,now());
 select string_agg(case a->>'part' when 'caption' then 'Caption' else case r.kind when 'script' then 'Guion' else 'Entrega' end end||' · '||case a->>'decision' when 'approved' then 'Aprobado' when 'changes' then 'Cambios pedidos' else 'Comentario' end||case when a->>'comment'<>'' then ': '||(a->>'comment') else '' end,E'\n') into summary from jsonb_array_elements(p_payload->'answers') a;
 insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility) values(w,c,p.id,'Respuesta del cliente · v'||r.version||E'\n'||summary,'Cliente: '||author,'internal');
 perform app_private.client_review_notify(r.id,response_key,p_payload->'answers');
 return app_private.client_pilot_view(w,c);
end $$;
revoke all on function public.aramis_client_pilot(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aramis_client_pilot(uuid,uuid,text,text,jsonb) to service_role;

create function app_private.client_review_summary(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',r.id,'kind',r.kind,'status',r.status,'contentStatus',r.content_status,'captionStatus',r.caption_status,
 'contentComment',r.content_comment,'captionComment',r.caption_comment)
 from app_private.client_pilot_requests r join public.pieces p on p.id=r.piece_id
 join app_private.client_pilot_calendar cal on cal.piece_id=p.id
 where p.id=target and not p.archived and r.status<>'superseded' and not exists(select 1 from app_private.piece_clients where piece_id=p.id)
 and (r.kind='script' and p.status in ('planned','production') or r.kind='delivery' and exists(select 1 from app_private.deliveries d where d.id=r.delivery_id and d.invalidated_at is null and d.version=(select max(version) from app_private.deliveries where piece_id=p.id)))
 order by r.created_at desc,r.version desc limit 1;
$$;
revoke all on function app_private.client_review_summary(uuid) from public,anon,authenticated,service_role;
do $migration$
declare body text; needle text:='''deliveries'',app_private.piece_deliveries(p.id)';
begin
 body:=pg_get_functiondef('public.aramis_workspace(uuid)'::regprocedure);
 if position(needle in body)=0 then raise exception 'Workspace projection changed'; end if;
 execute replace(body,needle,'''clientReview'',app_private.client_review_summary(p.id),'||needle);
end $migration$;
commit;
