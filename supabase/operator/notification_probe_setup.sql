-- Authorized real-email probe: two synthetic posts, only Miguel receives the digest.
-- Run once with routine sending still disabled and all team audiences unassigned.
begin;
do $$ begin
 if exists(select 1 from app_private.notification_preferences where workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and audience<>'unassigned')
  or exists(select 1 from public.clients where workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and name='Prueba controlada de avisos 2026-10-01') then
  raise exception 'Probe precondition failed; do not rerun blindly';
 end if;
 perform set_config('request.jwt.claim.sub',(select id::text from auth.users where email='miguel_carretero@outlook.com'),true);
end $$;
set local role authenticated;
do $probe$
declare w uuid:='cc7761e3-36af-4558-9aa9-116a165be3e3'; r jsonb; c uuid; p uuid; rev bigint; i integer;
begin
 r:=public.aramis_notification_preferences(w);
 perform public.aramis_notification_preferences(w,jsonb_build_object('audience','design','cadence','immediate','enabled',true,'dailyTime','09:00','expectedRevision',r->'preferences'->'revision'),gen_random_uuid());
 r:=public.aramis_command(w,jsonb_build_object('type','create-client','input',jsonb_build_object('name','Prueba controlada de avisos 2026-10-01','contactName','','phone','','monthlyPlan',jsonb_build_object('posts',0,'reels',0))),gen_random_uuid());
 c:=(r->>'entityId')::uuid;
 for i in 1..2 loop
  r:=public.aramis_command(w,jsonb_build_object('type','create-piece','input',jsonb_build_object('clientId',c,'title','Prueba de correo · pieza '||i,'format','post','planMonth','2026-10')),gen_random_uuid());
  p:=(r->>'entityId')::uuid;
  select (value->>'revision')::bigint into rev from jsonb_array_elements(r->'state'->'pieces') where value->>'id'=p::text;
  perform public.aramis_command(w,jsonb_build_object('type','update-piece','pieceId',p,'expectedRevision',rev,'patch',jsonb_build_object('status','production','workArea','design','productionStage','ready')),gen_random_uuid());
 end loop;
end $probe$;
reset role;
commit;
select u.email,n.audience,n.cadence,count(q.id) as queued_test_pieces
 from app_private.notification_preferences n join public.members m on m.id=n.member_id join auth.users u on u.id=m.user_id
 left join app_private.notification_queue q on q.member_id=n.member_id and q.state='pending'
 where n.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and u.email='miguel_carretero@outlook.com'
 group by u.email,n.audience,n.cadence;
