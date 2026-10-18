-- Run after 202610180001. Synthetic RPC work is entirely rolled back.
-- Does not call Drive or send mail; the dispatcher cannot see uncommitted events.
begin;
do $$
declare w uuid; u uuid; a uuid; b uuid; pid uuid; request_id uuid:=gen_random_uuid();
  result jsonb; p jsonb; payload jsonb; again jsonb; n integer;
begin
  select m.workspace_id,m.user_id into w,u from public.members m
    where m.active and m.role='staff' order by m.created_at,m.id limit 1;
  if u is null then raise exception 'Probe requires active staff'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  result:=public.aramis_command(w,jsonb_build_object('type','create-client','input',jsonb_build_object(
    'name','[Temporal] Multicliente A','contactName','','phone','','monthlyPlan',jsonb_build_object('posts',1,'reels',0))),gen_random_uuid());
  a:=(result->>'entityId')::uuid;
  result:=public.aramis_command(w,jsonb_build_object('type','create-client','input',jsonb_build_object(
    'name','[Temporal] Multicliente B','contactName','','phone','','monthlyPlan',jsonb_build_object('posts',1,'reels',0))),gen_random_uuid());
  b:=(result->>'entityId')::uuid;
  payload:=jsonb_build_object('type','create-piece','input',jsonb_build_object(
    'clientId',a,'clientIds',jsonb_build_array(a,b),'title','[Temporal] Efeméride compartida','format','post','planMonth','2035-01'));
  result:=public.aramis_command(w,payload,request_id);
  pid:=(result->>'entityId')::uuid;
  select value into p from jsonb_array_elements(result->'state'->'pieces') where value->>'id'=pid::text;
  if p->'clientIds'<>jsonb_build_array(a,b) or p->>'status'<>'planned' then raise exception 'Recipient persistence failed'; end if;
  again:=public.aramis_command(w,payload,request_id);
  if again->>'entityId'<>pid::text then raise exception 'Replay identity failed'; end if;
  select count(*) into n from jsonb_array_elements(again->'state'->'pieces') where value->>'id'=pid::text;
  if n<>1 then raise exception 'Duplicate piece'; end if;
  result:=public.aramis_command(w,jsonb_build_object('type','update-piece','pieceId',pid,
    'expectedRevision',(p->>'revision')::integer,'patch',jsonb_build_object('status','production','caption','Caption compartido')),gen_random_uuid());
  select value into p from jsonb_array_elements(result->'state'->'pieces') where value->>'id'=pid::text;
  if p->'clientIds'<>jsonb_build_array(a,b) or p->>'status'<>'production' or p->>'workArea'<>'design' then raise exception 'Shared workflow failed'; end if;
  begin
    perform public.aramis_command(w,jsonb_build_object('type','create-piece','input',jsonb_build_object('clientId',a,'clientIds',jsonb_build_array(a,a))),gen_random_uuid());
    raise exception 'Duplicate recipients accepted';
  exception when raise_exception then if sqlerrm<>'VALIDATION' then raise; end if; end;
  result:=public.aramis_command(w,jsonb_build_object('type','generate-month','clientId',a,'month','2035-01'),gen_random_uuid());
  select count(*) into n from jsonb_array_elements(result->'state'->'pieces') x
    where x->>'clientId'=a::text and x->>'planMonth'='2035-01' and not x ? 'clientIds';
  if n<>1 then raise exception 'Shared extra reduced monthly plan'; end if;
  execute 'reset role';
  execute 'set constraints all immediate';
  select count(*) into n from app_private.notification_events where piece_id=pid;
  if n<>1 then raise exception 'Expected one workflow event'; end if;
  select count(*) into n from app_private.piece_clients where piece_id=pid;
  if n<>2 then raise exception 'Expected two normalized recipients'; end if;
end $$;
rollback;
select 'PASS: ordered recipients, one task, replay, shared workflow, monthly extra and event; all test data rolled back' as result;
