-- Read-only evidence for the isolated live probe; no credentials or private notes.
select b.id,b.state,b.recipient,jsonb_array_length(b.items) as piece_count,b.attempts,b.provider_id,b.sent_at,b.error_code
 from app_private.notification_batches b
 where b.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and b.recipient='miguel_carretero@outlook.com'
 and exists(select 1 from jsonb_array_elements(b.items) item where item->>'client'='Prueba controlada de avisos 2026-10-01')
 order by b.created_at desc;
