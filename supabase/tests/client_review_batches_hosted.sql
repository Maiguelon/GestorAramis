-- Synthetic records only. Keep BEGIN / ROLLBACK. No Drive calls or actual emails.
begin;
do $probe$
declare w uuid; u uuid; m uuid; c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 x jsonb; r uuid; k uuid:=gen_random_uuid(); cipher jsonb:=jsonb_build_object('iv',to_jsonb(array_fill(1,array[12])),'ciphertext',to_jsonb(array_fill(2,array[40])));
begin
 select workspace_id,user_id,id into w,u,m from public.members where role='staff' and active order by created_at,id limit 1;
 if w is null then raise exception 'No active staff'; end if;
 insert into public.clients(id,workspace_id,name) values(c,w,'__synthetic_batch_rollback__');
 insert into public.pieces(id,workspace_id,client_id,title,owner_member_id,status) values(p,w,c,'__synthetic_batch_rollback__',m,'review');
 insert into public.piece_production(piece_id,workspace_id,plan_month) values(p,w,'2026-10');
 insert into public.piece_drafts(workspace_id,piece_id,caption) values(w,p,'Synthetic final');
 insert into app_private.deliveries(id,workspace_id,piece_id,version,caption,assets,status,created_by)
 values(d,w,p,1,'Synthetic final','[{"id":"50000000-0000-4000-8000-000000000009","name":"synthetic.mp4","mimeType":"video/mp4","size":6}]','pending','Synthetic Design');
 perform public.aramis_client_pilot(w,u,null,'link-ensure',jsonb_build_object('clientId',c,'key',gen_random_uuid(),'tokenHash',repeat('e',64),'encryptedToken',cipher));
 x:=public.aramis_client_pilot(w,u,null,'publish',jsonb_build_object('clientId',c,'key',gen_random_uuid(),'pieceId',p,'expectedRevision',1,'kind','delivery','deliveryId',d,'separateParts',true));
 r:=(x->'requests'->0->>'id')::uuid;
 begin
   perform public.aramis_client_pilot(w,null,repeat('e',64),'respond-batch',jsonb_build_object('requestId',r,'version',1,'key',gen_random_uuid(),'author','Synthetic client','answers','[{"part":"content","decision":"approved","comment":""},{"part":"caption","decision":"changes","comment":""}]'::jsonb));
   raise exception 'Invalid batch accepted';
 exception when raise_exception then if sqlerrm<>'VALIDATION' then raise; end if; end;
 if (select content_status from app_private.client_pilot_requests where id=r)<>'pending' then raise exception 'Partial atomic write'; end if;
 x:=jsonb_build_object('requestId',r,'version',1,'key',k,'author','Synthetic client','answers','[{"part":"caption","decision":"changes","comment":"Synthetic text correction"}]'::jsonb);
 perform public.aramis_client_pilot(w,null,repeat('e',64),'respond-batch',x);
 perform public.aramis_client_pilot(w,null,repeat('e',64),'respond-batch',x);
 if (select work_area from public.piece_production where piece_id=p)<>'marketing' or not (select app_private.client_pilot_current(cr) from app_private.client_pilot_requests cr where id=r)
   or (select count(*) from app_private.client_pilot_responses where request_id=r)<>1 then raise exception 'Partial text routing or replay failed'; end if;
 perform public.aramis_client_pilot(w,null,repeat('e',64),'respond-batch',jsonb_build_object('requestId',r,'version',1,'key',gen_random_uuid(),'author','Synthetic client','answers','[{"part":"content","decision":"changes","comment":"Synthetic video correction"}]'::jsonb));
 if (select work_area from public.piece_production where piece_id=p)<>'design' or (select source from app_private.deliveries where id=d)<>'client'
   or (select app_private.client_review_summary(p)->>'status')<>'changes' then raise exception 'Material routing/summary failed'; end if;
 if (select count(*) from app_private.notification_events where client_request_id=r and source='client')<>2 then raise exception 'Missing audience events'; end if;
 if exists(select 1 from app_private.notification_events where client_request_id=r and audience='design' and reason like '%text correction%') then raise exception 'Design received caption noise'; end if;
 set constraints all immediate;
 perform public.aramis_client_pilot(w,u,null,'withdraw',jsonb_build_object('clientId',c,'requestId',r,'key',gen_random_uuid()));
 if exists(select 1 from app_private.notification_events e where e.client_request_id=r and app_private.notification_event_current(e)) then raise exception 'Stale event actionable'; end if;
 update public.pieces set status='review' where id=p;
 update public.pieces set status='production' where id=p;
 if not exists(select 1 from app_private.notification_events where piece_id=p and kind='returned' and source='client') then raise exception 'Manual client return lost its source'; end if;
 if has_function_privilege('anon','public.aramis_client_pilot(uuid,uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','public.aramis_client_pilot(uuid,uuid,text,text,jsonb)','execute') then raise exception 'Public grant widened'; end if;
end $probe$;
rollback;
select 'client review batch probe passed; all synthetic changes rolled back' as result,
 (select count(*) from public.pieces where title='__synthetic_batch_rollback__') as synthetic_pieces,
 (select count(*) from public.clients where name='__synthetic_batch_rollback__') as synthetic_clients;
