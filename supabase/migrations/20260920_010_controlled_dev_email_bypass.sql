-- Development-only email verification bypass.
-- IMPORTANT: auto_confirm_new_users defaults to false and should remain false in production.

create schema if not exists gascars_private;

create table if not exists gascars_private.dev_settings (
  singleton boolean primary key default true check (singleton),
  auto_confirm_new_users boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into gascars_private.dev_settings (singleton, auto_confirm_new_users)
values (true, false)
on conflict (singleton) do nothing;

revoke all on table gascars_private.dev_settings from public, anon, authenticated;

create or replace function gascars_private.gascars_dev_auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auto_confirm boolean := false;
begin
  select d.auto_confirm_new_users
  into auto_confirm
  from gascars_private.dev_settings d
  where d.singleton = true;

  if coalesce(auto_confirm, false) then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    new.raw_user_meta_data :=
      jsonb_set(
        coalesce(new.raw_user_meta_data, '{}'::jsonb),
        '{email_verified}',
        'true'::jsonb,
        true
      );
  end if;

  return new;
end;
$$;

revoke execute on function gascars_private.gascars_dev_auto_confirm_user() from public, anon, authenticated;

drop trigger if exists gascars_dev_auto_confirm_auth_user on auth.users;
create trigger gascars_dev_auto_confirm_auth_user
before insert on auth.users
for each row
execute function gascars_private.gascars_dev_auto_confirm_user();

create or replace function public.gascars_admin_dev_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  enabled boolean;
begin
  if not public.gascars_is_admin() then
    raise exception 'Admin access required';
  end if;

  select d.auto_confirm_new_users
  into enabled
  from gascars_private.dev_settings d
  where d.singleton = true;

  return jsonb_build_object('auto_confirm_new_users', coalesce(enabled, false));
end;
$$;

create or replace function public.gascars_admin_set_dev_auto_confirm(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.gascars_is_admin() then
    raise exception 'Admin access required';
  end if;

  update gascars_private.dev_settings
  set auto_confirm_new_users = p_enabled,
      updated_at = now()
  where singleton = true;

  insert into public.gascars_audit(actor_id, action, detail)
  values (
    auth.uid(),
    'admin.dev_auto_confirm',
    jsonb_build_object('enabled', p_enabled)
  );

  return p_enabled;
end;
$$;

create or replace function public.gascars_admin_confirm_test_user(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  dev_enabled boolean := false;
  target_id uuid;
begin
  if not public.gascars_is_admin() then
    raise exception 'Admin access required';
  end if;

  select d.auto_confirm_new_users
  into dev_enabled
  from gascars_private.dev_settings d
  where d.singleton = true;

  if not coalesce(dev_enabled, false) then
    raise exception 'Development auto-confirm is disabled';
  end if;

  select u.id
  into target_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if target_id is null then
    raise exception 'User not found';
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{email_verified}',
        'true'::jsonb,
        true
      ),
      updated_at = now()
  where id = target_id;

  insert into public.gascars_audit(actor_id, action, detail)
  values (
    auth.uid(),
    'admin.confirm_test_user',
    jsonb_build_object('user_id', target_id)
  );

  return true;
end;
$$;

revoke execute on function public.gascars_admin_dev_status() from public, anon;
revoke execute on function public.gascars_admin_set_dev_auto_confirm(boolean) from public, anon;
revoke execute on function public.gascars_admin_confirm_test_user(text) from public, anon;

grant execute on function public.gascars_admin_dev_status() to authenticated;
grant execute on function public.gascars_admin_set_dev_auto_confirm(boolean) to authenticated;
grant execute on function public.gascars_admin_confirm_test_user(text) to authenticated;
