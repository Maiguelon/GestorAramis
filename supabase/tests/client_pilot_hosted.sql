-- Synthetic application records only. No Drive writes, messages or persistent shares.
-- Run after 202610190001_client_pilot.sql; ALWAYS retain BEGIN and ROLLBACK.
begin;
-- The SQL editor's owner role prepares the fixtures. RPC membership/capability checks
-- still execute normally; explicit role/grant denial is covered in the isolated suite.
do $probe$
declare w uuid; u uuid; m uuid; c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 x jsonb; r uuid; k uuid:=gen_random_uuid(); cipher jsonb:=jsonb_build_object('iv',to_jsonb(array_fill(1,array[12])),'ciphertext',to_jsonb(array_fill(2,array[40])));
begin
 select workspace_id,user_id,id into w,u,m from public.members where role='staff' and active order by created_at,id limit 1;
 if w is null then raise exception 'No active staff for probe'; end if;
 insert into public.clients(id,workspace_id,name) values(c,w,'__synthetic_client_pilot_rollback__');
 insert into public.pieces(id,workspace_id,client_id,title,owner_member_id) values(p,w,c,'__synthetic_review_rollback__',m);
 insert into public.piece_production(piece_id,workspace_id,plan_month) values(p,w,'2026-10');
 perform public.aramis_client_pilot(w,u,null,'link-ensure',jsonb_build_object('clientId',c,'key',gen_random_uuid(),'tokenHash',repeat('a',64),'encryptedToken',cipher));
 x:=public.aramis_client_pilot(w,null,repeat('a',64),'view','{}');
 if jsonb_array_length(x->'pieces')<>0 or x ? 'encryptedToken' then raise exception 'Implicit publication or credential leak'; end if;
 x:=public.aramis_client_pilot(w,u,null,'publish',jsonb_build_object('clientId',c,'key',gen_random_uuid(),'pieceId',p,'expectedRevision',1,'kind','script','text','Public synthetic script'));
 r:=(x->'requests'->0->>'id')::uuid;
 x:=jsonb_build_object('requestId',r,'key',k,'decision','approved','comment','','author','Synthetic client');
 perform public.aramis_client_pilot(w,null,repeat('a',64),'respond',x);
 perform public.aramis_client_pilot(w,null,repeat('a',64),'respond',x);
 if (select status from public.pieces where id=p)<>'planned' or (select count(*) from app_private.client_pilot_responses where request_id=r)<>1 then raise exception 'Script approval changed workflow or duplicated'; end if;
 update public.pieces set status='review' where id=p;
 insert into app_private.deliveries(id,workspace_id,piece_id,version,caption,assets,status,created_by) values(d,w,p,1,'Synthetic final','[]','pending','Synthetic Design');
 x:=public.aramis_client_pilot(w,u,null,'publish',jsonb_build_object('clientId',c,'key',gen_random_uuid(),'pieceId',p,'expectedRevision',1,'kind','delivery','deliveryId',d));
 select (item->>'id')::uuid into r from jsonb_array_elements(x->'requests') item where item->>'kind'='delivery';
 perform public.aramis_client_pilot(w,null,repeat('a',64),'respond',jsonb_build_object('requestId',r,'key',gen_random_uuid(),'decision','changes','comment','Synthetic correction','author','Synthetic client'));
 if (select status from public.pieces where id=p)<>'production' or (select work_area from public.piece_production where piece_id=p)<>'design'
   or (select source from app_private.deliveries where id=d)<>'client' then raise exception 'Client correction did not reach Design'; end if;
 perform public.aramis_client_pilot(w,u,null,'link-revoke',jsonb_build_object('clientId',c,'key',gen_random_uuid()));
 begin
   perform public.aramis_client_pilot(w,null,repeat('a',64),'view','{}');
   raise exception 'Revoked link still works';
 exception when raise_exception then if sqlerrm<>'INVALID_ACCESS' then raise; end if; end;
 if has_function_privilege('anon','public.aramis_client_pilot(uuid,uuid,text,text,jsonb)','execute')
    or has_function_privilege('authenticated','public.aramis_client_pilot(uuid,uuid,text,text,jsonb)','execute') then raise exception 'Service bridge exposed'; end if;
end $probe$;
rollback;
select 'client pilot probe passed; all synthetic changes rolled back' as result,
 (select count(*) from public.pieces) as pieces,
 (select count(*) from public.clients) as clients,
 (select count(*) from app_private.client_pilot_links) as pilot_links,
 (select count(*) from app_private.client_pilot_requests) as pilot_requests;
