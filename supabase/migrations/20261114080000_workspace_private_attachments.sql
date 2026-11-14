-- Private file storage for real workspaces.
create table if not exists public.attachments (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 uploader_id uuid not null references auth.users(id) on delete cascade,
 object_path text not null unique,
 filename text not null check(char_length(filename) between 1 and 180),
 mime_type text not null,
 byte_size bigint not null check(byte_size between 1 and 10485760),
 created_at timestamptz not null default now()
);
create index if not exists attachments_workspace_created_idx on public.attachments(workspace_id,created_at desc);
alter table public.attachments enable row level security;
create policy "btc_attachments_read" on public.attachments
 for select to authenticated using(public.btc_is_member(workspace_id));
create policy "btc_attachments_insert" on public.attachments
 for insert to authenticated with check(
 uploader_id=auth.uid() and public.btc_is_member(workspace_id)
 and object_path like (workspace_id::text || '/' || auth.uid()::text || '/%')
);
create policy "btc_attachments_delete" on public.attachments
 for delete to authenticated using(uploader_id=auth.uid() or public.btc_is_admin(workspace_id));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('btc-workspace-files','btc-workspace-files',false,10485760,
 array['application/pdf','image/jpeg','image/png','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy "btc_storage_member_read" on storage.objects for select to authenticated
 using(bucket_id='btc-workspace-files' and public.btc_is_member(((storage.foldername(name))[1])::uuid));
create policy "btc_storage_member_upload" on storage.objects for insert to authenticated
 with check(bucket_id='btc-workspace-files' and
  (storage.foldername(name))[2]=auth.uid()::text and
  public.btc_is_member(((storage.foldername(name))[1])::uuid));
create policy "btc_storage_member_delete" on storage.objects for delete to authenticated
 using(bucket_id='btc-workspace-files' and
  (storage.foldername(name))[2]=auth.uid()::text and
  public.btc_is_member(((storage.foldername(name))[1])::uuid));
