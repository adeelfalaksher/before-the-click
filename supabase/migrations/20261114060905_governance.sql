create extension if not exists pgcrypto with schema extensions;
create schema if not exists btc_private;
revoke all on schema btc_private from public, anon, authenticated;
create table btc_private.server_configuration (
  singleton boolean primary key default true check (singleton),
  secret text not null check (length(secret) >= 64)
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null check (role in ('owner','admin','reviewer','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index members_by_user on public.workspace_members(user_id);
create table btc_private.invites (
  digest text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  email text not null,
  role text not null check (role in ('admin','reviewer','member')),
  expires_at timestamptz not null default now() + interval '7 days'
);
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('gmail','calendar','drive')),
  account text not null,
  scopes text[] not null,
  connected_at timestamptz not null default now(),
  unique (workspace_id,owner_id,provider)
);
create table btc_private.integration_credentials (
  integration_id uuid primary key references public.integrations on delete cascade,
  ciphertext text not null
);
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  created_by uuid references auth.users on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  status text not null check (status in ('draft','awaiting_approval','changes_requested','rejected','approved','executing','needs_verification','completed','failed','cancelled')),
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflows_by_workspace on public.workflows(workspace_id,updated_at desc);
create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows on delete cascade,
  version integer not null check (version > 0),
  objective text not null check (char_length(objective) between 1 and 1200),
  created_at timestamptz not null default now(),
  unique (workflow_id,version)
);
create table public.proposed_actions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references public.workflow_versions on delete cascade,
  provider text not null check (provider in ('gmail','calendar','drive')),
  operation text not null check (operation in ('archive','label','draft','send','create_event','update_event','move_file')),
  resource_id text not null,
  document jsonb not null check (jsonb_typeof(document)='object' and octet_length(document::text) <= 42000),
  created_at timestamptz not null default now()
);
create table public.approval_steps (
  version_id uuid not null references public.workflow_versions on delete cascade,
  position integer not null check (position between 1 and 8),
  reviewer_id uuid not null references public.profiles on delete restrict,
  primary key (version_id,position),
  unique (version_id,reviewer_id)
);
create table public.approval_decisions (
  version_id uuid not null,
  position integer not null,
  reviewer_id uuid not null references public.profiles on delete restrict,
  decision text not null check (decision in ('approved','changes_requested','rejected')),
  comment text not null check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  primary key (version_id,position),
  foreign key (version_id,position) references public.approval_steps on delete cascade
);
create table public.policy_rules (
  workspace_id uuid primary key references public.workspaces on delete cascade,
  allow_send boolean not null default false,
  allow_calendar boolean not null default true,
  allow_drive boolean not null default true,
  allow_self_approval boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.execution_runs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references public.workflow_versions on delete cascade,
  started_by uuid references auth.users on delete set null,
  status text not null check (status in ('executing','needs_verification','completed','failed')),
  provider_reference text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.execution_action_logs (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.execution_runs on delete cascade,
  state text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index execution_logs_by_run on public.execution_action_logs(run_id);
create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  workflow_id uuid references public.workflows on delete cascade,
  actor uuid references auth.users on delete set null,
  event text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_by_workspace on public.audit_events(workspace_id,id desc);
create table public.notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  workflow_id uuid not null references public.workflows on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_by_user on public.notifications(user_id,id desc);

create function public.btc_is_member(w uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid())
$$;
create function public.btc_is_admin(w uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('owner','admin'))
$$;
create function public.btc_has_workflow(w uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workflows f where f.id=w and public.btc_is_member(f.workspace_id))
$$;
create function public.btc_has_version(v uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workflow_versions where id=v and public.btc_has_workflow(workflow_id))
$$;
create function btc_private.audit(w uuid, f uuid, e text, d jsonb default '{}') returns void
language sql set search_path='' as $$
  insert into public.audit_events(workspace_id,workflow_id,actor,event,detail) values(w,f,auth.uid(),e,d)
$$;
create function btc_private.notify(w uuid,f uuid,v uuid,n integer) returns void
language sql set search_path='' as $$
  insert into public.notifications(workspace_id,workflow_id,user_id,message)
    select w,f,reviewer_id,'A workflow is ready for your review.' from public.approval_steps
    where version_id=v and position=n and reviewer_id<>auth.uid()
$$;
create function btc_private.check_server(payload text, signature text) returns void
language plpgsql set search_path='' as $$
declare shared text;
begin
  select secret into shared from btc_private.server_configuration where singleton;
  if auth.uid() is null or shared is null or signature is null or
     extensions.digest(signature,'sha256') <> extensions.digest(encode(extensions.hmac(auth.uid()::text || ':' || payload,shared,'sha256'),'hex'),'sha256') then
    raise exception 'Server authorization is required.' using errcode='42501';
  end if;
end
$$;

create function public.btc_workspace(name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.workspaces where owner_id=auth.uid()) >= 10 then raise exception 'Workspace limit reached.'; end if;
  insert into public.profiles values (auth.uid(),coalesce(nullif(left(auth.jwt()->'user_metadata'->>'name',80),''),'Workspace member'),now()) on conflict do nothing;
  insert into public.workspaces(name,owner_id) values(btrim(name),auth.uid()) returning id into w;
  insert into public.workspace_members(workspace_id,user_id,role) values(w,auth.uid(),'owner');
  insert into public.policy_rules(workspace_id) values(w);
  perform btc_private.audit(w,null,'workspace.created');
  return w;
end
$$;
create function public.btc_profile(name text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.profiles(id,display_name) values(auth.uid(),btrim(name))
  on conflict (id) do update set display_name=excluded.display_name;
end
$$;
create function public.btc_invite(w uuid, address text, member_role text, digest text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.btc_is_admin(w) then raise exception 'Workspace administrator required.'; end if;
  if length(address)>254 or digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation.'; end if;
  insert into btc_private.invites(digest,workspace_id,email,role) values(digest,w,lower(address),member_role);
  perform btc_private.audit(w,null,'team.invited',jsonb_build_object('role',member_role));
end
$$;
create function public.btc_join(d text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation btc_private.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into invitation from btc_private.invites
    where digest=d and email=lower(auth.jwt()->>'email') and expires_at>now() for update;
  if not found then raise exception 'This invitation has expired or belongs to a different email address.'; end if;
  insert into public.profiles values (auth.uid(),coalesce(nullif(left(auth.jwt()->'user_metadata'->>'name',80),''),'Workspace member'),now()) on conflict do nothing;
  insert into public.workspace_members(workspace_id,user_id,role)
    values(invitation.workspace_id,auth.uid(),invitation.role) on conflict do nothing;
  delete from btc_private.invites where digest=d;
  perform btc_private.audit(invitation.workspace_id,null,'team.joined');
  return invitation.workspace_id;
end
$$;
create function public.btc_policies(w uuid, sending boolean, calendar boolean, drive boolean, self_approval boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.btc_is_admin(w) then raise exception 'Workspace administrator required.'; end if;
  update public.policy_rules set allow_send=sending,allow_calendar=calendar,allow_drive=drive,
    allow_self_approval=self_approval,updated_at=now() where workspace_id=w;
  perform btc_private.audit(w,null,'policy.updated',jsonb_build_object('allow_send',sending,'allow_calendar',calendar,'allow_drive',drive,'allow_self_approval',self_approval));
end
$$;
create function public.btc_notification(n bigint) returns void
language sql security definer set search_path='' as $$
  update public.notifications set read_at=now() where id=n and user_id=auth.uid()
$$;

create function public.btc_propose(payload text, signature text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p jsonb; w uuid; f uuid; v uuid; previous public.workflows%rowtype; n integer;
  reviewer uuid; position integer := 0; rules public.policy_rules%rowtype;
begin
  perform btc_private.check_server('proposal:' || payload,signature);
  p := payload::jsonb; w := (p->>'workspace')::uuid;
  if not public.btc_is_member(w) then raise exception 'Workspace access required.'; end if;
  select * into rules from public.policy_rules where workspace_id=w for share;
  if jsonb_array_length(p->'reviewers') not between 1 and 8 then raise exception 'Select one to eight reviewers.'; end if;
  if p->>'workflow' is null then
    insert into public.workflows(workspace_id,created_by,title,status)
      values(w,auth.uid(),p->>'title','awaiting_approval') returning id,current_version into f,n;
  else
    select * into previous from public.workflows where id=(p->>'workflow')::uuid and workspace_id=w for update;
    if not found or previous.created_by<>auth.uid() or previous.created_by is null or
       previous.status not in ('awaiting_approval','changes_requested','rejected','approved','failed') then
      raise exception 'This workflow cannot be revised.';
    end if;
    if previous.current_version <> (p->>'expectedVersion')::integer then raise exception 'Reload the latest version before editing.'; end if;
    f := previous.id; n := previous.current_version + 1;
    update public.workflows set title=p->>'title',status='awaiting_approval',current_version=n,updated_at=now() where id=f;
    update public.notifications set read_at=now() where workflow_id=f and read_at is null;
  end if;
  insert into public.workflow_versions(workflow_id,version,objective) values(f,n,p->>'objective') returning id into v;
  insert into public.proposed_actions(version_id,provider,operation,resource_id,document)
    values(v,p->>'provider',p->>'operation',p->>'resource',p->'document');
  for reviewer in select value::uuid from jsonb_array_elements_text(p->'reviewers') loop
    if not exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=reviewer and m.role in ('owner','admin','reviewer')) then
      raise exception 'Each reviewer needs a reviewer or administrator role.';
    end if;
    if not rules.allow_self_approval and reviewer=auth.uid() then raise exception 'Workspace policy requires a different reviewer.'; end if;
    position := position+1;
    insert into public.approval_steps values(v,position,reviewer);
  end loop;
  perform btc_private.notify(w,f,v,1);
  perform btc_private.audit(w,f,'workflow.proposed',jsonb_build_object('version',n,'operation',p->>'operation','risk',p->'document'->>'risk'));
  return f;
end
$$;
create function public.btc_decide(f uuid,v uuid,d text,note text) returns void
language plpgsql security definer set search_path='' as $$
declare wf public.workflows%rowtype; step public.approval_steps%rowtype; rules public.policy_rules%rowtype;
begin
  select * into wf from public.workflows where id=f and public.btc_is_member(workspace_id) for update;
  if not found or wf.status<>'awaiting_approval' or not exists(select 1 from public.workflow_versions where id=v and workflow_id=f and version=wf.current_version) then
    raise exception 'This version is no longer awaiting approval.';
  end if;
  select * into step from public.approval_steps s where s.version_id=v and not exists(
    select 1 from public.approval_decisions a where a.version_id=v and a.position=s.position
  ) order by position limit 1;
  if not found or step.reviewer_id<>auth.uid() then raise exception 'Only the next assigned reviewer can decide.'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=wf.workspace_id and user_id=auth.uid() and role in ('owner','admin','reviewer')) then
    raise exception 'Your role can no longer review this action.';
  end if;
  select * into rules from public.policy_rules where workspace_id=wf.workspace_id for share;
  if not rules.allow_self_approval and wf.created_by=auth.uid() then raise exception 'Self-approval is disabled.'; end if;
  if d not in ('approved','changes_requested','rejected') or (d<>'approved' and btrim(note)='') then
    raise exception 'Add a comment when rejecting or requesting changes.';
  end if;
  insert into public.approval_decisions(version_id,position,reviewer_id,decision,comment) values(v,step.position,auth.uid(),d,btrim(note));
  update public.notifications set read_at=now() where workflow_id=f and user_id=auth.uid() and read_at is null;
  update public.workflows set updated_at=now(),status=case
    when d<>'approved' then d
    when not exists(select 1 from public.approval_steps where version_id=v and position>step.position) then 'approved'
    else 'awaiting_approval' end where id=f;
  if d='approved' then perform btc_private.notify(wf.workspace_id,f,v,step.position+1); end if;
  perform btc_private.audit(wf.workspace_id,f,'approval.'||d,jsonb_build_object('position',step.position,'version',wf.current_version));
end
$$;
create function public.btc_cancel(f uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
  update public.workflows set status='cancelled',updated_at=now()
    where id=f and created_by=auth.uid() and public.btc_is_member(workspace_id)
    and status in ('draft','awaiting_approval','approved','changes_requested','rejected') returning workspace_id into w;
  if w is null then raise exception 'This workflow cannot be cancelled.'; end if;
  update public.notifications set read_at=now() where workflow_id=f and read_at is null;
  perform btc_private.audit(w,f,'workflow.cancelled');
end
$$;

create function public.btc_connection(payload text, signature text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; w uuid; connection public.integrations%rowtype; encrypted text;
begin
  perform btc_private.check_server('connection:'||payload,signature);
  p := payload::jsonb; w := (p->>'workspace')::uuid;
  if not public.btc_is_member(w) then raise exception 'Workspace access required.'; end if;
  select * into connection from public.integrations where workspace_id=w and owner_id=auth.uid() and provider=p->>'provider';
  if p->>'intent'='get' then
    if connection.id is null then return null; end if;
    select ciphertext into encrypted from btc_private.integration_credentials where integration_id=connection.id;
    return to_jsonb(connection)||jsonb_build_object('ciphertext',encrypted);
  elsif p->>'intent'='set' then
    insert into public.integrations(workspace_id,owner_id,provider,account,scopes)
      values(w,auth.uid(),p->>'provider',p->>'account',array(select jsonb_array_elements_text(p->'scopes')))
      on conflict(workspace_id,owner_id,provider) do update
      set account=excluded.account,scopes=excluded.scopes,connected_at=now() returning * into connection;
    insert into btc_private.integration_credentials(integration_id,ciphertext) values(connection.id,p->>'ciphertext')
      on conflict(integration_id) do update set ciphertext=excluded.ciphertext;
    perform btc_private.audit(w,null,'integration.connected',jsonb_build_object('provider',connection.provider));
    return to_jsonb(connection);
  elsif p->>'intent'='delete' then
    if connection.id is null then return null; end if;
    delete from public.integrations where id=connection.id;
    perform btc_private.audit(w,null,'integration.disconnected',jsonb_build_object('provider',connection.provider));
    return null;
  else raise exception 'Invalid connection operation.';
  end if;
end
$$;
create function public.btc_execution(payload text, signature text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; wf public.workflows%rowtype; v public.workflow_versions%rowtype;
  a public.proposed_actions%rowtype; rules public.policy_rules%rowtype; r public.execution_runs%rowtype; state text;
begin
  perform btc_private.check_server('execution:'||payload,signature);
  p := payload::jsonb;
  select * into wf from public.workflows where id=(p->>'workflow')::uuid and created_by=auth.uid()
    and public.btc_is_member(workspace_id) for update;
  if not found then raise exception 'Only the workflow owner can execute.'; end if;
  select * into v from public.workflow_versions where workflow_id=wf.id and version=wf.current_version;
  if v.id is distinct from (p->>'version')::uuid then raise exception 'The approved version changed. Reload first.'; end if;
  select * into a from public.proposed_actions where version_id=v.id;
  select * into r from public.execution_runs where version_id=v.id for update;
  if p->>'intent'='claim' then
    if wf.status<>'approved' or r.id is not null then raise exception 'This version is not approved or has already been submitted.'; end if;
    select * into rules from public.policy_rules where workspace_id=wf.workspace_id for share;
    if a.document->>'sensitive'='true' or (a.operation='send' and not rules.allow_send) or
       (a.provider='calendar' and not rules.allow_calendar) or (a.provider='drive' and not rules.allow_drive) or
       (not rules.allow_self_approval and exists(select 1 from public.approval_decisions where version_id=v.id and reviewer_id=auth.uid())) or
       exists(select 1 from public.approval_steps s
         where s.version_id=v.id and not exists(select 1 from public.workspace_members m
           where m.workspace_id=wf.workspace_id and m.user_id=s.reviewer_id and m.role in ('owner','admin','reviewer'))
       ) then raise exception 'Current workspace policies block this action.'; end if;
    if not exists(select 1 from public.integrations where workspace_id=wf.workspace_id and owner_id=auth.uid()
      and provider=a.provider and account=a.document->>'account') then raise exception 'Reconnect the approved provider account.'; end if;
    insert into public.execution_runs(version_id,started_by,status) values(v.id,auth.uid(),'executing') returning * into r;
    update public.workflows set status='executing',updated_at=now() where id=wf.id;
    insert into public.execution_action_logs(run_id,state) values(r.id,'executing');
    perform btc_private.audit(wf.workspace_id,wf.id,'execution.claimed',jsonb_build_object('run',r.id));
    return to_jsonb(r);
  elsif p->>'intent'='finish' then
    if r.id is distinct from (p->>'run')::uuid or r.status not in ('executing','needs_verification') then raise exception 'This attempt has already settled.'; end if;
    state := p->>'status';
    if state not in ('completed','failed','needs_verification') then raise exception 'Invalid execution result.'; end if;
    update public.execution_runs set status=state,provider_reference=coalesce(p->>'reference',provider_reference),
      result=p->'detail',updated_at=now() where id=r.id returning * into r;
    update public.workflows set status=state,updated_at=now() where id=wf.id;
    insert into public.execution_action_logs(run_id,state,detail) values(r.id,state,coalesce(p->'detail','{}'));
    perform btc_private.audit(wf.workspace_id,wf.id,'execution.'||state,jsonb_build_object('run',r.id,'reference',r.provider_reference));
    return to_jsonb(r);
  end if;
  raise exception 'Invalid execution operation.';
end
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','workspace_members','integrations','workflows','workflow_versions','proposed_actions','approval_steps','approval_decisions','policy_rules','execution_runs','execution_action_logs','audit_events','notifications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using (
  id=auth.uid() or exists(select 1 from public.workspace_members m where m.user_id=profiles.id and public.btc_is_member(m.workspace_id))
);
create policy workspace_read on public.workspaces for select to authenticated using(public.btc_is_member(id));
create policy member_read on public.workspace_members for select to authenticated using(public.btc_is_member(workspace_id));
create policy connection_read on public.integrations for select to authenticated using(owner_id=auth.uid() and public.btc_is_member(workspace_id));
create policy workflow_read on public.workflows for select to authenticated using(public.btc_is_member(workspace_id));
create policy version_read on public.workflow_versions for select to authenticated using(public.btc_has_workflow(workflow_id));
create policy action_read on public.proposed_actions for select to authenticated using(public.btc_has_version(version_id));
create policy steps_read on public.approval_steps for select to authenticated using(public.btc_has_version(version_id));
create policy decisions_read on public.approval_decisions for select to authenticated using(public.btc_has_version(version_id));
create policy policies_read on public.policy_rules for select to authenticated using(public.btc_is_member(workspace_id));
create policy execution_read on public.execution_runs for select to authenticated using(public.btc_has_version(version_id));
create policy execution_log_read on public.execution_action_logs for select to authenticated using(
  exists(select 1 from public.execution_runs where id=run_id and public.btc_has_version(version_id))
);
create policy audit_read on public.audit_events for select to authenticated using(public.btc_is_member(workspace_id));
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid() and public.btc_is_member(workspace_id));

do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'btc\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated',fn);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('btc-workspace','btc-workspace',false,5242880,array['application/pdf','text/plain','image/png','image/jpeg','application/json'])
on conflict(id) do nothing;
create policy btc_storage_read on storage.objects for select to authenticated using (
  bucket_id='btc-workspace' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.btc_is_member(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (storage.foldername(name))[1]::uuid end)
);
create policy btc_storage_upload on storage.objects for insert to authenticated with check (
  bucket_id='btc-workspace' and (storage.foldername(name))[2]=auth.uid()::text
  and public.btc_is_member(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (storage.foldername(name))[1]::uuid end)
);
create policy btc_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='btc-workspace' and (storage.foldername(name))[2]=auth.uid()::text
  and public.btc_is_member(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (storage.foldername(name))[1]::uuid end)
);
