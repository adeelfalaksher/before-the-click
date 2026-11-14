create function public.btc_export_audit(w uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not public.btc_is_member(w) then
    raise exception 'Workspace access required.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) into result
    from public.audit_events e where e.workspace_id=w;
  return jsonb_build_object('workspace',w,'exported_at',now(),'events',result);
end
$$;
revoke execute on function public.btc_export_audit(uuid) from public, anon;
grant execute on function public.btc_export_audit(uuid) to authenticated;
