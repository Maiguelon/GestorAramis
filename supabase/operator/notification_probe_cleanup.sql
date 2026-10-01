-- Archive ONLY the two synthetic posts/client after confirming provider delivery.
-- Preserve the audit; do not delete records or touch Drive. Restore Miguel's daily Marketing preference.
begin;
do $$ begin
 if (select count(*) from app_private.notification_batches b where b.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and b.state='sent'
  and exists(select 1 from jsonb_array_elements(b.items) item where item->>'client'='Prueba controlada de avisos 2026-10-01'))<>1 then
  raise exception 'Verify the probe result before cleanup';
 end if;
 perform set_config('request.jwt.claim.sub',(select id::text from auth.users where email='miguel_carretero@outlook.com'),true);
end $$;
set local role authenticated;
do $cleanup$
declare w uuid:='cc7761e3-36af-4558-9aa9-116a165be3e3'; r jsonb; p record;
begin
 for p in select x.id,x.revision from public.pieces x join public.clients c on c.id=x.client_id
  where x.workspace_id=w and c.name='Prueba controlada de avisos 2026-10-01' and not x.archived loop
  perform public.aramis_command(w,jsonb_build_object('type','update-piece','pieceId',p.id,'expectedRevision',p.revision,'patch',jsonb_build_object('archived',true)),gen_random_uuid());
 end loop;
 r:=public.aramis_notification_preferences(w);
 if r->'preferences'->>'audience'<>'design' or r->'preferences'->>'cadence'<>'immediate' then raise exception 'Preferences changed during the probe; preserve and reconcile them'; end if;
 perform public.aramis_notification_preferences(w,jsonb_build_object('audience','marketing','cadence','daily','enabled',true,'dailyTime','09:00','expectedRevision',r->'preferences'->'revision'),gen_random_uuid());
end $cleanup$;
reset role;
update public.clients set archived_at=now()
 where workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and name='Prueba controlada de avisos 2026-10-01' and archived_at is null;
commit;
select true as synthetic_probe_archived_and_miguel_restored;
