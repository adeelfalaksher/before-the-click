drop policy if exists "btc_storage_member_delete" on storage.objects;
create policy "btc_storage_member_delete" on storage.objects for delete to authenticated
 using(bucket_id='btc-workspace-files' and
  public.btc_is_member(((storage.foldername(name))[1])::uuid) and (
   (storage.foldername(name))[2]=auth.uid()::text or
   public.btc_is_admin(((storage.foldername(name))[1])::uuid)
  ));
