-- Explicit client publication. Legacy calendar/request capabilities retain their scopes.
begin;
create table app_private.client_pilot_links (
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid primary key references public.clients(id),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  encrypted_token jsonb not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
create table app_private.client_pilot_calendar (
  piece_id uuid primary key references public.pieces(id),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id)
);
create table app_private.client_pilot_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id),
  piece_id uuid not null references public.pieces(id),
  kind text not null check(kind in ('script','delivery')),
  version integer not null,
  text text not null,
  delivery_id uuid references app_private.deliveries(id),
  status text not null default 'pending' check(status in ('pending','approved','changes','superseded')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique(piece_id,kind,version)
);
create table app_private.client_pilot_responses (
  request_id uuid not null references app_private.client_pilot_requests(id),
  idempotency_key uuid not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  primary key(request_id,idempotency_key)
);
create table app_private.client_pilot_receipts (
  workspace_id uuid not null, user_id uuid not null, request_id uuid not null,
  body jsonb not null, primary key(workspace_id,user_id,request_id)
);
alter table app_private.client_pilot_links enable row level security;
alter table app_private.client_pilot_calendar enable row level security;
alter table app_private.client_pilot_requests enable row level security;
alter table app_private.client_pilot_responses enable row level security;
alter table app_private.client_pilot_receipts enable row level security;
revoke all on app_private.client_pilot_links, app_private.client_pilot_calendar,
  app_private.client_pilot_requests, app_private.client_pilot_responses, app_private.client_pilot_receipts from public,anon,authenticated;

create function app_private.client_pilot_current(r app_private.client_pilot_requests) returns boolean
language sql stable set search_path='' as $$
 select r.status='pending' and exists(select 1 from public.pieces p where p.id=r.piece_id and not p.archived
   and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)
   and (case when r.kind='script' then p.status='planned' else p.status='review' and exists(
     select 1 from app_private.deliveries d where d.id=r.delivery_id and d.piece_id=p.id and d.status='pending'
       and d.invalidated_at is null and d.version=(select max(version) from app_private.deliveries where piece_id=p.id)) end));
$$;
create function app_private.client_pilot_view(w uuid,c uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
 'client',(select jsonb_build_object('id',id,'name',name,'initials',initials,'color',color) from public.clients where id=c and workspace_id=w and archived_at is null),
 'pieces',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'format',p.format,'plannedDate',p.planned_date,'status',p.status) order by p.planned_date nulls last,p.id)
   from public.pieces p join app_private.client_pilot_calendar cal on cal.piece_id=p.id
   where p.workspace_id=w and p.client_id=c and not p.archived
     and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)),'[]'),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'pieceId',r.piece_id,'kind',r.kind,'version',r.version,'text',r.text,
   'assets',case when r.kind='delivery' then coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name','mimeType',a->>'mimeType','size',a->'size'))
     from app_private.deliveries d cross join lateral jsonb_array_elements(d.assets) a where d.id=r.delivery_id),'[]') else '[]' end,
   'status',case when r.status='pending' and not app_private.client_pilot_current(r) then 'superseded' else r.status end,
   'canRespond',app_private.client_pilot_current(r),'comment',r.comment,'createdAt',r.created_at,
   'comments',coalesce((select jsonb_agg(jsonb_build_object('text',x.body->>'comment','author',x.body->>'author','createdAt',x.created_at) order by x.created_at)
      from app_private.client_pilot_responses x where x.request_id=r.id and x.body->>'decision'='comment'),'[]')) order by r.created_at desc)
   from app_private.client_pilot_requests r join public.pieces p on p.id=r.piece_id
   join app_private.client_pilot_calendar cal on cal.piece_id=p.id
   where r.workspace_id=w and r.client_id=c and p.client_id=c and not p.archived and r.status<>'superseded'
     and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)
     and r.version=(select max(version) from app_private.client_pilot_requests where piece_id=r.piece_id and kind=r.kind)),'[]'));
$$;

-- Server-only bridge. A verified staff ID or a hashed pilot capability is mandatory.
create function public.aramis_client_pilot(p_workspace_id uuid,p_user_id uuid,p_token_hash text,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id; c uuid; actor text; link app_private.client_pilot_links;
 p public.pieces; r app_private.client_pilot_requests; d app_private.deliveries;
 prior jsonb; n integer; target uuid; note text; decision text; author text; item jsonb; result jsonb;
begin
 perform 1 from public.workspaces where id=w for update;
 if p_user_id is not null then
   select pr.display_name into actor from public.members m join public.profiles pr on pr.user_id=m.user_id
     where m.workspace_id=w and m.user_id=p_user_id and m.active and m.role='staff' for share of m;
   if actor is null then raise exception 'forbidden' using errcode='42501'; end if;
   c:=(p_payload->>'clientId')::uuid;
   if not exists(select 1 from public.clients where id=c and workspace_id=w and archived_at is null) then raise exception 'NOT_FOUND'; end if;
 else
   if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_ACCESS'; end if;
   select * into link from app_private.client_pilot_links where workspace_id=w and token_hash=p_token_hash and revoked_at is null;
   c:=link.client_id;
   if c is null or not exists(select 1 from public.clients where id=c and workspace_id=w and archived_at is null) then raise exception 'INVALID_ACCESS'; end if;
   if p_action not in ('view','respond','asset','connection-get','connection-save') then raise exception 'INVALID_ACCESS'; end if;
 end if;
 perform app_private.check_object(p_payload,array['clientId','pieceId','expectedRevision','kind','text','deliveryId','requestId','key','decision','comment','author','tokenHash','encryptedToken','assetId','connection']);
 if p_action in ('view','staff-view') then
   if p_action='staff-view' and p_user_id is null then raise exception 'INVALID_ACCESS'; end if;
 elsif p_action in ('link-ensure','link-rotate','link-revoke','calendar-show','calendar-hide','publish','withdraw') then
   if p_user_id is null then raise exception 'INVALID_ACCESS'; end if;
   target:=(p_payload->>'key')::uuid;
   if target is null then raise exception 'VALIDATION'; end if;
   select body into prior from app_private.client_pilot_receipts where workspace_id=w and user_id=p_user_id and request_id=target;
   if prior is not null then
     -- Generated token envelopes have random IVs; compare the operator's semantic action.
     if prior is distinct from jsonb_build_object('action',p_action,'data',p_payload-'tokenHash'-'encryptedToken') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   else
     if p_action in ('link-ensure','link-rotate') then
       perform app_private.check_drive_cipher(p_payload->'encryptedToken');
       if p_payload->>'tokenHash' is null or p_payload->>'tokenHash' !~ '^[a-f0-9]{64}$' then raise exception 'VALIDATION'; end if;
       if p_action='link-rotate' or not exists(select 1 from app_private.client_pilot_links where client_id=c and revoked_at is null) then
         insert into app_private.client_pilot_links(workspace_id,client_id,token_hash,encrypted_token) values(w,c,p_payload->>'tokenHash',p_payload->'encryptedToken')
         on conflict(client_id) do update set token_hash=excluded.token_hash,encrypted_token=excluded.encrypted_token,revoked_at=null,updated_at=now();
       end if;
     elsif p_action='link-revoke' then
       update app_private.client_pilot_links set revoked_at=now() where client_id=c;
     else
       if p_action='withdraw' then
         select * into r from app_private.client_pilot_requests where id=(p_payload->>'requestId')::uuid and workspace_id=w and client_id=c;
         if r.id is null then raise exception 'NOT_FOUND'; end if;
         update app_private.client_pilot_requests set status='superseded' where id=r.id;
         p.id:=r.piece_id;
       else
         select * into p from public.pieces where id=(p_payload->>'pieceId')::uuid and workspace_id=w and client_id=c and not archived;
         if p.id is null then raise exception 'NOT_FOUND'; end if;
         if exists(select 1 from app_private.piece_clients where piece_id=p.id) then raise exception 'VALIDATION'; end if;
         if (p_payload->>'expectedRevision')::integer is distinct from p.revision then raise exception 'CONFLICT'; end if;
         if p_action='calendar-hide' then
           delete from app_private.client_pilot_calendar where piece_id=p.id;
           update app_private.client_pilot_requests set status='superseded' where piece_id=p.id and status='pending';
         else
           insert into app_private.client_pilot_calendar values(p.id,w,c) on conflict do nothing;
           if p_action='publish' then
             if p_payload->>'kind'='script' then
               if p.status<>'planned' then raise exception 'INVALID_TRANSITION'; end if;
               note:=btrim(p_payload->>'text');
               if note is null or length(note) not between 1 and 100000 then raise exception 'VALIDATION'; end if;
             elsif p_payload->>'kind'='delivery' then
               select * into d from app_private.deliveries where piece_id=p.id order by version desc limit 1;
               if p.status<>'review' or d.status<>'pending' or d.invalidated_at is not null or d.id is distinct from (p_payload->>'deliveryId')::uuid then raise exception 'CONFLICT'; end if;
               note:=d.caption;
             else raise exception 'VALIDATION'; end if;
             select coalesce(max(version),0)+1 into n from app_private.client_pilot_requests where piece_id=p.id and kind=p_payload->>'kind';
             update app_private.client_pilot_requests set status='superseded' where piece_id=p.id and kind=p_payload->>'kind';
             insert into app_private.client_pilot_requests(workspace_id,client_id,piece_id,kind,version,text,delivery_id)
               values(w,c,p.id,p_payload->>'kind',n,note,case when p_payload->>'kind'='delivery' then d.id else null end);
           end if;
         end if;
       end if;
       insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
         values(w,c,p.id,case p_action when 'publish' then 'Revisión publicada para el cliente ('||(p_payload->>'kind')||').' when 'withdraw' then 'Revisión de cliente retirada.' when 'calendar-show' then 'Pieza visible en el calendario del cliente.' else 'Pieza retirada del calendario del cliente.' end,actor,'internal');
     end if;
     insert into app_private.client_pilot_receipts values(w,p_user_id,target,jsonb_build_object('action',p_action,'data',p_payload-'tokenHash'-'encryptedToken'));
   end if;
 elsif p_action='respond' then
   select * into r from app_private.client_pilot_requests where id=(p_payload->>'requestId')::uuid and workspace_id=w and client_id=c;
   if r.id is null or not exists(select 1 from app_private.client_pilot_calendar where piece_id=r.piece_id) then raise exception 'INVALID_ACCESS'; end if;
   select * into p from public.pieces where id=r.piece_id;
   if p.archived or exists(select 1 from app_private.piece_clients where piece_id=p.id) then raise exception 'INVALID_ACCESS'; end if;
   target:=(p_payload->>'key')::uuid;
   if target is null then raise exception 'VALIDATION'; end if;
   select body into prior from app_private.client_pilot_responses where request_id=r.id and idempotency_key=target;
   if prior is not null then
     if prior is distinct from p_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   else
     if not app_private.client_pilot_current(r) then raise exception 'CONFLICT'; end if;
     decision:=p_payload->>'decision'; note:=btrim(p_payload->>'comment'); author:=btrim(p_payload->>'author');
     if decision is null or decision not in ('approved','changes','comment') or note is null or length(note)>10000
       or author is null or length(author) not between 1 and 120 or (decision in ('changes','comment') and length(note)=0) then raise exception 'VALIDATION'; end if;
     insert into app_private.client_pilot_responses values(r.id,target,p_payload,now());
     if decision<>'comment' then
       if r.kind='delivery' then
         perform app_private.delivery_command(w,jsonb_build_object('type','review-delivery','pieceId',p.id,'expectedRevision',p.revision,'deliveryId',r.delivery_id,'decision',decision,'comment',note,'source','client'),'Cliente: '||author);
       end if;
       update app_private.client_pilot_requests set status=decision,comment=note where id=r.id;
     end if;
     insert into public.activity(workspace_id,client_id,piece_id,text,actor,visibility)
       values(w,c,p.id,'Respuesta del cliente · '||case r.kind when 'script' then 'Guion' else 'Entrega' end||' v'||r.version||' · '||decision||case when note<>'' then ': '||note else '' end,'Cliente: '||author,'internal');
   end if;
 elsif p_action in ('asset','connection-get','connection-save') then
   -- Media authorization is rechecked for every range read, not just cookie issuance.
   select * into r from app_private.client_pilot_requests where id=(p_payload->>'requestId')::uuid and workspace_id=w and client_id=c and kind='delivery' and status<>'superseded';
   if r.id is null or not exists(select 1 from public.pieces p join app_private.client_pilot_calendar cal on cal.piece_id=p.id
     where p.id=r.piece_id and not p.archived and not exists(select 1 from app_private.piece_clients pc where pc.piece_id=p.id)) then raise exception 'INVALID_ACCESS'; end if;
   select * into d from app_private.deliveries where id=r.delivery_id;
   if d.invalidated_at is not null or d.version<>(select max(version) from app_private.deliveries where piece_id=r.piece_id) then raise exception 'CONFLICT'; end if;
   if p_action='asset' then
     select jsonb_build_object('id',a.id,'workspaceId',w,'clientId',c,'pieceId',r.piece_id,'name',u.name,'mimeType',u.mime_type,'size',u.byte_size,
       'driveFileId',u.drive_file_id,'checksum',a.checksum,'driveRevisionId',a.drive_revision_id,'folderId',u.folder_id,'generation',u.generation)
       into result from app_private.drive_team_assets a join app_private.drive_uploads u on u.upload_id=a.id
       join app_private.drive_connections co on co.workspace_id=w and co.generation=u.generation
       where a.id=(p_payload->>'assetId')::uuid and a.workspace_id=w and a.available and u.status='complete'
       and exists(select 1 from jsonb_array_elements(d.assets) x where x->>'id'=a.id::text);
     if result is null then raise exception 'NOT_FOUND'; end if;
     return result;
   elsif p_action='connection-get' then
     return (select jsonb_build_object('generation',generation,'encryptedTokens',encrypted_tokens,'accountEmail',account_email,'accountPermissionId',account_permission_id,'rootFolderId',root_folder_id) from app_private.drive_connections where workspace_id=w);
   else
     item:=p_payload->'connection'; perform app_private.check_drive_cipher(item->'encryptedTokens');
     update app_private.drive_connections set encrypted_tokens=item->'encryptedTokens',updated_at=now() where workspace_id=w and generation=(item->>'expectedGeneration')::uuid;
     if not found then raise exception 'CONFLICT'; end if;
     return 'null';
   end if;
 else raise exception 'VALIDATION'; end if;
 result:=app_private.client_pilot_view(w,c);
 if p_user_id is not null then
   select * into link from app_private.client_pilot_links where client_id=c;
   result:=result||jsonb_build_object('linkActive',link.client_id is not null and link.revoked_at is null,
     'encryptedToken',case when link.revoked_at is null then link.encrypted_token else null end);
 end if;
 return result;
end $$;
revoke all on function app_private.client_pilot_current(app_private.client_pilot_requests),app_private.client_pilot_view(uuid,uuid) from public,anon,authenticated;
revoke all on function public.aramis_client_pilot(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aramis_client_pilot(uuid,uuid,text,text,jsonb) to service_role;
create function app_private.client_pilot_archive() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.archived and not old.archived then
   delete from app_private.client_pilot_calendar where piece_id=new.id;
   update app_private.client_pilot_requests set status='superseded' where piece_id=new.id and status='pending';
 end if;
 return new;
end $$;
revoke all on function app_private.client_pilot_archive() from public,anon,authenticated;
create trigger client_pilot_archive after update of archived on public.pieces for each row execute function app_private.client_pilot_archive();
-- The same helper now also receives responses directly from a client capability.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('app_private.delivery_command(uuid,jsonb,text)'::regprocedure);
 if strpos(body,' (cliente, registrado por el equipo)')=0 then raise exception 'Client attribution anchor missing'; end if;
 execute replace(body,' (cliente, registrado por el equipo)',' (cliente)');
end $migration$;
commit;
