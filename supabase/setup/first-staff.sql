-- Run from the SQL Editor as project owner, AFTER both migrations and Auth user creation.
-- Replace both UUIDs. This creates only an empty workspace and one authorized staff member.
-- Never run supabase/tests/bootstrap.sql or fixtures.sql on the hosted project.
begin;
do $$
declare
  v_workspace uuid := '00000000-0000-0000-0000-000000000000'; -- generate a workspace UUID
  v_user uuid := '00000000-0000-0000-0000-000000000000'; -- copy the agreed person's Auth UID
  v_name text := 'Miguel';
begin
  if v_workspace = '00000000-0000-0000-0000-000000000000' or not exists(select 1 from auth.users where id=v_user) then
    raise exception 'Replace the workspace and Auth user UUIDs before running';
  end if;
  insert into public.workspaces(id,name) values(v_workspace,'Aramis') on conflict(id) do nothing;
  insert into public.profiles(user_id,display_name) values(v_user,v_name) on conflict(user_id) do nothing;
  insert into public.members(workspace_id,user_id,role) values(v_workspace,v_user,'staff') on conflict(workspace_id,user_id) do nothing;
end;
$$;
commit;
