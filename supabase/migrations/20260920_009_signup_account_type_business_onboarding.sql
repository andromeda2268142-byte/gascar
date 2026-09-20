create or replace function public.handle_gascars_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_type text;
  initial_role text;
begin
  requested_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'driver'));
  initial_role := case when requested_type = 'business' then 'business' else 'driver' end;

  insert into public.gascars_profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    initial_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke update on public.gascars_profiles from authenticated;
grant update (display_name, phone, avatar_url) on public.gascars_profiles to authenticated;

create or replace function public.gascars_create_business_profile(
  p_business_type text,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_business_id uuid;
  current_role text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_business_type not in ('mechanic', 'towing', 'parts') then
    raise exception 'Invalid business type';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Business name is required';
  end if;

  if exists (
    select 1 from public.gascars_businesses
    where owner_id = current_user_id
  ) then
    raise exception 'This account already has a business profile';
  end if;

  insert into public.gascars_businesses (
    owner_id,
    business_type,
    name,
    phone,
    email,
    address,
    city,
    state,
    zip,
    status,
    is_verified
  )
  values (
    current_user_id,
    p_business_type,
    trim(p_name),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    nullif(trim(p_address), ''),
    nullif(trim(p_city), ''),
    nullif(upper(trim(p_state)), ''),
    nullif(trim(p_zip), ''),
    'pending',
    false
  )
  returning id into new_business_id;

  select role into current_role
  from public.gascars_profiles
  where id = current_user_id;

  if current_role <> 'admin' then
    update public.gascars_profiles
    set role = 'business',
        updated_at = now()
    where id = current_user_id;
  end if;

  return new_business_id;
end;
$$;

revoke execute on function public.gascars_create_business_profile(
  text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.gascars_create_business_profile(
  text, text, text, text, text, text, text, text
) to authenticated;

revoke insert on public.gascars_businesses from authenticated;
