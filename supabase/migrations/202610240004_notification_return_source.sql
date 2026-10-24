-- Manual staff-recorded client returns must keep their source in ordinary stage emails too.
begin;
do $migration$
declare body text; needle text;
begin
 body:=pg_get_functiondef('app_private.capture_notification_transition()'::regprocedure);
 needle:='insert into app_private.notification_events(workspace_id,piece_id,sequence,audience,kind,reason)';
 if position(needle in body)=0 then raise exception 'Notification insert changed'; end if;
 body:=replace(body,needle,'insert into app_private.notification_events(workspace_id,piece_id,sequence,audience,kind,reason,source)');
 needle:='values(w,target_piece,seq,t,kind,coalesce(reason,'''')) returning id into event_id;';
 if position(needle in body)=0 then raise exception 'Notification values changed'; end if;
 body:=replace(body,needle,$code$values(w,target_piece,seq,t,kind,coalesce(reason,''),
  case when kind='returned' then coalesce((select d.source from app_private.deliveries d where d.piece_id=target_piece and d.invalidated_at is null order by d.version desc limit 1),'team') else 'team' end) returning id into event_id;$code$);
 execute body;
end $migration$;
commit;
