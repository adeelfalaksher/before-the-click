alter table public.proposed_actions drop constraint proposed_actions_provider_check;
alter table public.proposed_actions add constraint proposed_actions_provider_check check (provider in ('gmail','calendar','drive','workspace'));
alter table public.proposed_actions drop constraint proposed_actions_operation_check;
alter table public.proposed_actions add constraint proposed_actions_operation_check check (operation in ('archive','label','draft','send','create_event','update_event','move_file','publish_record'));

create table public.workspace_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  version_id uuid not null unique references public.workflow_versions on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index btc_workspace_records_recent on public.workspace_records(workspace_id,created_at desc);
alter table public.workspace_records enable row level security;
revoke all on public.workspace_records from public, anon, authenticated;
grant select on public.workspace_records to authenticated;
create policy btc_records_read on public.workspace_records for select to authenticated using(public.btc_is_member(workspace_id));

create function public.btc_publish_record(payload text,signature text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p jsonb; wf public.workflows%rowtype; v uuid; r uuid; run uuid; rules public.policy_rules%rowtype; d jsonb;
begin
  perform btc_private.check_server('publish:'||payload,signature);
  p := payload::jsonb;
  select * into wf from public.workflows where id=(p->>'workflow')::uuid and created_by=auth.uid() and public.btc_is_member(workspace_id) for update;
  if not found or wf.status not in ('approved','completed') then raise exception 'An approved workflow is required.'; end if;
  select id into v from public.workflow_versions where workflow_id=wf.id and version=wf.current_version;
  if v is distinct from (p->>'version')::uuid then raise exception 'The workflow version changed.'; end if;
  select id into r from public.workspace_records where version_id=v;
  if r is not null then return r; end if;
  if wf.status <> 'approved' then raise exception 'An approved workflow is required.'; end if;
  select document into d from public.proposed_actions where version_id=v and provider='workspace' and operation='publish_record';
  select * into rules from public.policy_rules where workspace_id=wf.workspace_id for share;
  if d is null or d->>'sensitive'='true'
    or (not rules.allow_self_approval and exists(select 1 from public.approval_decisions where version_id=v and reviewer_id=auth.uid()))
    or not exists(select 1 from public.approval_steps where version_id=v)
    or exists(select 1 from public.approval_steps s where s.version_id=v and (
      not exists(select 1 from public.approval_decisions a where a.version_id=s.version_id and a.position=s.position and a.decision='approved')
      or not exists(select 1 from public.workspace_members m where m.workspace_id=wf.workspace_id and m.user_id=s.reviewer_id and m.role in ('owner','admin','reviewer'))
    )) then raise exception 'Workspace policies block this action.'; end if;
  insert into public.workspace_records(workspace_id,version_id,title,body)
    values(wf.workspace_id,v,d->'proposal'->>'subject',d->'proposal'->>'body') returning id into r;
  insert into public.execution_runs(version_id,started_by,status,provider_reference,result)
    values(v,auth.uid(),'completed',r::text,jsonb_build_object('record',r,'status','Saved in workspace','title',d->'proposal'->>'subject')) returning id into run;
  insert into public.execution_action_logs(run_id,state,detail) values(run,'completed',jsonb_build_object('record',r));
  update public.workflows set status='completed',updated_at=now() where id=wf.id;
  perform btc_private.audit(wf.workspace_id,wf.id,'execution.completed',jsonb_build_object('run',run,'reference',r));
  return r;
end
$$;
revoke execute on function public.btc_publish_record(text,text) from public,anon;
grant execute on function public.btc_publish_record(text,text) to authenticated;

create function public.btc_member_role(w uuid,member uuid,new_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role='owner')
    or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=member and role<>'owner') then
    raise exception 'Only the workspace owner can change these roles.';
  end if;
  if new_role not in ('admin','reviewer','member') then raise exception 'Choose a valid role.'; end if;
  update public.workspace_members set role=new_role where workspace_id=w and user_id=member;
  perform btc_private.audit(w,null,'team.role_updated',jsonb_build_object('member',member,'role',new_role));
end
$$;
revoke execute on function public.btc_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.btc_member_role(uuid,uuid,text) to authenticated;
