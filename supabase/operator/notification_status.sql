-- Read-only operational check. No credentials, internal notes, tokens or email body.
select u.email,n.audience,n.cadence,n.daily_time,n.enabled,n.revision
 from app_private.notification_preferences n join public.members m on m.id=n.member_id
 join auth.users u on u.id=m.user_id
 where n.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and m.active and m.role='staff'
 order by u.email;

select c.name,c.archived_at is not null as client_archived,
 count(p.id) filter(where not p.archived) as active_test_pieces,
 count(p.id) filter(where p.archived) as archived_test_pieces
 from public.clients c left join public.pieces p on p.client_id=c.id
 where c.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3'
 and c.name='Prueba controlada de avisos 2026-10-01'
 group by c.id,c.name,c.archived_at;

select state,count(*) as batch_count,max(sent_at) as latest_sent_at
 from app_private.notification_batches
 where workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3'
 group by state order by state;
