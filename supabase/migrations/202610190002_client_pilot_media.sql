-- Qualify the media lookup independently of the PL/pgSQL `p` row variable.
begin;
do $migration$
declare body text; before_text text; after_text text;
begin
 body:=pg_get_functiondef('public.aramis_client_pilot(uuid,uuid,text,text,jsonb)'::regprocedure);
 before_text:=$old$select 1 from public.pieces p join app_private.client_pilot_calendar cal on cal.piece_id=p.id
     where p.id=r.piece_id and not p.archived and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)$old$;
 after_text:=$new$select 1 from public.pieces media_piece join app_private.client_pilot_calendar cal on cal.piece_id=media_piece.id
     where media_piece.id=r.piece_id and not media_piece.archived and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=media_piece.id)$new$;
 if strpos(body,before_text)=0 then raise exception 'Pilot media lookup anchor missing'; end if;
 execute replace(body,before_text,after_text);
end $migration$;
commit;
