begin;
create function public.aramis_drive_trash(p_workspace_id uuid,p_user_id uuid,p_asset_id uuid,p_generation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare asset record; actor text; member_id uuid;
begin
  perform 1 from public.workspaces where id=p_workspace_id for update;
  select m.id,pr.display_name into member_id,actor from public.members m join public.profiles pr on pr.user_id=m.user_id
    where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role='staff' and m.active;
  if member_id is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from app_private.drive_connections where workspace_id=p_workspace_id and generation=p_generation)
    then raise exception 'CONFLICT'; end if;
  select a.available,u.piece_id,u.client_id,u.folder_id into asset from app_private.drive_team_assets a
    join app_private.drive_uploads u on u.upload_id=a.id and u.workspace_id=a.workspace_id
    join public.pieces p on p.id=u.piece_id and p.workspace_id=u.workspace_id
    join public.clients c on c.id=u.client_id and c.workspace_id=u.workspace_id
    where a.workspace_id=p_workspace_id and a.id=p_asset_id and u.generation=p_generation
      and not p.archived and c.archived_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not asset.available then return jsonb_build_object('changed',false); end if;
  update app_private.drive_team_assets set available=false where id=p_asset_id and workspace_id=p_workspace_id;
  -- Ignore folder snapshots taken before the completed trash operation.
  update app_private.drive_folders set last_synced_at=now() where workspace_id=p_workspace_id and folder_id=asset.folder_id;
  update public.pieces set revision=revision+1,updated_at=now() where id=asset.piece_id;
  insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
    values(p_workspace_id,asset.client_id,asset.piece_id,'Material enviado a la papelera de Drive.',actor,'internal');
  return jsonb_build_object('changed',true);
end $$;
revoke all on function public.aramis_drive_trash(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.aramis_drive_trash(uuid,uuid,uuid,uuid) to service_role;
commit;
