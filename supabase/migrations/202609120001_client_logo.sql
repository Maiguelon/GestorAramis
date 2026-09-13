-- Extend existing RPC definitions without replacing their security, locks or grants.
begin;
create function app_private.valid_client_logo(value text) returns boolean
language sql immutable set search_path = '' as $$
 select value is null or (length(value)<=48000 and value ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$');
$$;
revoke all on function app_private.valid_client_logo(text) from public, anon, authenticated;
alter table public.clients add column logo text check (app_private.valid_client_logo(logo));
do $migration$
declare body text; item record;
begin
 body := pg_get_functiondef('public.aramis_workspace(uuid)'::regprocedure);
 if strpos(body,'''contactName'',c.contact_name')=0 then raise exception 'Unexpected workspace definition'; end if;
 execute replace(body,'''contactName'',c.contact_name','''logo'',c.logo,''contactName'',c.contact_name');
 body := pg_get_functiondef('public.aramis_command(uuid,jsonb,uuid)'::regprocedure);
 for item in select * from (values
 ($old$perform app_private.check_object(v_data,array['name','contactName','phone','monthlyPlan']);$old$,
 $new$perform app_private.check_object(v_data,array['name','contactName','phone','monthlyPlan','logo']);
    if v_data ? 'logo' and v_data->'logo' <> 'null'::jsonb and (jsonb_typeof(v_data->'logo') <> 'string' or not app_private.valid_client_logo(v_data->>'logo')) then raise exception 'VALIDATION'; end if;$new$),
 ($old$  elsif v_type in ('generate-month','create-piece') then$old$,
 $new$    if v_data ? 'logo' then update public.clients set logo=v_data->>'logo' where id=v_id; end if;
  elsif v_type in ('generate-month','create-piece') then$new$)
 ) as replacements(before_text,after_text) loop
  if strpos(body,item.before_text)=0 then raise exception 'Unexpected command definition'; end if;
  body := replace(body,item.before_text,item.after_text);
 end loop;
 execute body;
end;
$migration$;
commit;
