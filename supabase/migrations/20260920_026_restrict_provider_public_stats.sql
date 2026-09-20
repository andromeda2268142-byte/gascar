revoke execute on function public.gascars_provider_public_stats(uuid) from anon;
revoke execute on function public.gascars_provider_public_stats(uuid) from public;
grant execute on function public.gascars_provider_public_stats(uuid) to authenticated;
