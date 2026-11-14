create table btc_private.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  password_hash text not null,
  recovery_hash text not null,
  created_at timestamptz not null default now()
);
create table btc_private.account_sessions (
  digest text primary key,
  account_id uuid not null references btc_private.accounts(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);
create index btc_account_session_owner on btc_private.account_sessions(account_id);
create index btc_account_session_expiry on btc_private.account_sessions(expires_at);

-- Retain existing identifiers as foreign-key targets. New accounts never use GoTrue.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.workspaces drop constraint workspaces_owner_id_fkey;
alter table public.workspaces add foreign key (owner_id) references public.profiles(id) on delete set null;
alter table public.integrations drop constraint integrations_owner_id_fkey;
alter table public.integrations add foreign key (owner_id) references public.profiles(id) on delete cascade;
alter table public.workflows drop constraint workflows_created_by_fkey;
alter table public.workflows add foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.execution_runs drop constraint execution_runs_started_by_fkey;
alter table public.execution_runs add foreign key (started_by) references public.profiles(id) on delete set null;
alter table public.audit_events drop constraint audit_events_actor_fkey;
alter table public.audit_events add foreign key (actor) references public.profiles(id) on delete set null;
alter table public.attachments drop constraint attachments_uploader_id_fkey;
alter table public.attachments add foreign key (uploader_id) references public.profiles(id) on delete cascade;

alter table btc_private.invites add column recipient_id uuid references btc_private.accounts(id) on delete cascade;

create or replace function public.btc_invite(w uuid, address text, member_role text, digest text) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if not public.btc_is_admin(w) then raise exception 'Workspace administrator required.'; end if;
  select id into recipient from btc_private.accounts where username=lower(address);
  if not found then raise exception 'Ask this person to create an account first and share their username.'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=w and user_id=recipient) then
    raise exception 'This person is already a workspace member.';
  end if;
  if digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation.'; end if;
  insert into btc_private.invites(digest,workspace_id,email,role,recipient_id) values(digest,w,'',member_role,recipient);
  perform btc_private.audit(w,null,'team.invited',jsonb_build_object('role',member_role));
end
$$;

create or replace function public.btc_join(d text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation btc_private.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into invitation from btc_private.invites
    where digest=d and recipient_id=auth.uid() and expires_at>now() for update;
  if not found then raise exception 'This invitation has expired or belongs to a different account.'; end if;
  insert into public.workspace_members(workspace_id,user_id,role)
    values(invitation.workspace_id,auth.uid(),invitation.role) on conflict do nothing;
  delete from btc_private.invites where digest=d;
  perform btc_private.audit(invitation.workspace_id,null,'team.joined');
  return invitation.workspace_id;
end
$$;
