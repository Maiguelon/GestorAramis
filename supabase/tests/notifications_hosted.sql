-- Operator verification for the known Aramis workspace; all changes roll back.
-- Never sends email or calls an external provider. Run after the notifications migration.
begin;
do $$ begin
 perform set_config('request.jwt.claim.sub',(select id::text from auth.users where email='miguel_carretero@outlook.com'),true);
end $$;
set local role authenticated;
do $verify$
declare w uuid:='cc7761e3-36af-4558-9aa9-116a165be3e3'; r jsonb; saved jsonb; replay jsonb;
 c uuid; p uuid; rev bigint; key uuid:=gen_random_uuid(); payload jsonb;
begin
 r:=public.aramis_notification_preferences(w);
 payload:=jsonb_build_object('audience','design','cadence','immediate','enabled',true,'dailyTime','09:00','expectedRevision',r->'preferences'->'revision');
 saved:=public.aramis_notification_preferences(w,payload,key);
 replay:=public.aramis_notification_preferences(w,payload,key);
 if replay is distinct from saved then raise exception 'Preference receipt mismatch'; end if;
 r:=public.aramis_command(w,jsonb_build_object('type','create-client','input',jsonb_build_object('name','Prueba temporal de avisos','contactName','','phone','','monthlyPlan',jsonb_build_object('posts',0,'reels',0))),gen_random_uuid());
 c:=(r->>'entityId')::uuid;
 r:=public.aramis_command(w,jsonb_build_object('type','create-piece','input',jsonb_build_object('clientId',c,'title','Aviso sintético temporal','format','post','planMonth','2026-10')),gen_random_uuid());
 p:=(r->>'entityId')::uuid;
 select (value->>'revision')::bigint into rev from jsonb_array_elements(r->'state'->'pieces') where value->>'id'=p::text;
 perform public.aramis_command(w,jsonb_build_object('type','update-piece','pieceId',p,'expectedRevision',rev,'patch',jsonb_build_object('status','production','workArea','design','productionStage','ready')),gen_random_uuid());
 perform set_config('aramis.notification_probe_piece',p::text,true);
end $verify$;
-- Exercise deferred triggers, without committing the disposable data.
set constraints all immediate;
reset role;
set local role service_role;
do $verify$
declare w uuid:='cc7761e3-36af-4558-9aa9-116a165be3e3'; b jsonb; retry jsonb; result jsonb; body jsonb;
begin
 b:=public.aramis_notification_dispatch(w,'claim');
 if b is null or jsonb_array_length(b->'items')<>1 or b->'items'->0->>'pieceId'<>current_setting('aramis.notification_probe_piece') or b->>'recipient'<>'miguel_carretero@outlook.com' then raise exception 'Synthetic queue mismatch'; end if;
 body:=jsonb_build_object('from','gestor@avisos.aramis.agency','to',jsonb_build_array(b->>'recipient'),'subject','Synthetic SQL verification','html','<p>Test</p>','text','Test');
 result:=public.aramis_notification_dispatch(w,'begin-send',jsonb_build_object('id',b->>'id','lease',b->>'lease','email',body));
 if not (result->>'send')::boolean or result->'email' is distinct from body then raise exception 'Frozen body mismatch'; end if;
 perform public.aramis_notification_dispatch(w,'failed',jsonb_build_object('id',b->>'id','lease',b->>'lease','code','unknown_result'));
 retry:=public.aramis_notification_dispatch(w,'claim','{}',now()+interval '2 minutes');
 if retry->>'id'<>b->>'id' or retry->'payload' is distinct from body or retry->>'lease'=b->>'lease' then raise exception 'Retry mismatch'; end if;
end $verify$;
rollback;
select true as hosted_notifications_verified_with_rollback;
