-- Remote default privileges also granted these workers directly to API roles.
-- Revoking PUBLIC alone does not remove those explicit grants.
revoke all on function public.service_begin_collection(text,timestamptz),
  public.service_fail_collection(uuid,integer,text),
  public.service_complete_collection(uuid,jsonb,jsonb,integer,text)
  from public, anon, authenticated;
grant execute on function public.service_begin_collection(text,timestamptz),
  public.service_fail_collection(uuid,integer,text),
  public.service_complete_collection(uuid,jsonb,jsonb,integer,text)
  to service_role;
