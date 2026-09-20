create or replace function public.gascars_dev_signup_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select d.auto_confirm_new_users
     from gascars_private.dev_settings d
     where d.singleton = true),
    false
  );
$$;

revoke execute on function public.gascars_dev_signup_status() from public;
grant execute on function public.gascars_dev_signup_status() to anon, authenticated;
