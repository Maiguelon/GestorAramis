-- Explicit team setup authorized for internal notifications. No credentials or sending here.
-- Run once AFTER notifications_hosted.sql passes. Only initializes unassigned preferences;
-- keeps every user's existing frequency/paused setting and does not queue historical work.
begin;
update app_private.notification_preferences n
 set audience=team.audience,revision=n.revision+1
 from public.members m join auth.users u on u.id=m.user_id
 join (values ('miguel_carretero@outlook.com','marketing'),
              ('eric.esquivel180@gmail.com','marketing'),
              ('eliana.victoriacarretero@gmail.com','design')) team(email,audience)
 on lower(u.email)=team.email
 where n.member_id=m.id and n.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3'
  and m.active and m.role='staff' and u.email_confirmed_at is not null and n.audience='unassigned';
commit;
select u.email,n.audience,n.cadence,n.daily_time,n.enabled
 from app_private.notification_preferences n join public.members m on m.id=n.member_id
 join auth.users u on u.id=m.user_id
 where n.workspace_id='cc7761e3-36af-4558-9aa9-116a165be3e3' and m.active and m.role='staff'
 order by u.email;
