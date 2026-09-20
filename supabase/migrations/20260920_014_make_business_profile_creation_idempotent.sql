create or replace function public.gascars_create_business_profile_v2(
  p_business_type text,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  existing_business_id uuid;
  new_business_id uuid;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;

  select p.role into current_role
  from public.gascars_profiles p
  where p.id = current_user_id;

  if current_role is distinct from 'business' then
    return jsonb_build_object(
      'ok', false,
      'error', 'This account is not a Business account. Sign out and create a Business account.'
    );
  end if;

  if p_business_type not in ('mechanic', 'towing', 'parts') then
    return jsonb_build_object('ok', false, 'error', 'Invalid business type');
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Business name is required');
  end if;

  if coalesce(trim(p_zip), '') !~ '^[0-9]{5}$' then
    return jsonb_build_object('ok', false, 'error', 'A valid 5-digit ZIP code is required');
  end if;

  select b.id into existing_business_id
  from public.gascars_businesses b
  where b.owner_id = current_user_id
  order by b.created_at asc
  limit 1;

  if existing_business_id is not null then
    insert into public.gascars_wallets (business_id, balance)
    values (existing_business_id, 0)
    on conflict (business_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'existing', true,
      'business_id', existing_business_id
    );
  end if;

  insert into public.gascars_businesses (
    owner_id,business_type,name,phone,email,address,city,state,zip,
    service_zips,status,is_verified
  )
  values (
    current_user_id,p_business_type,trim(p_name),nullif(trim(p_phone),''),
    nullif(trim(p_email),''),nullif(trim(p_address),''),nullif(trim(p_city),''),
    nullif(upper(trim(p_state)),''),trim(p_zip),array[trim(p_zip)],'pending',false
  )
  returning id into new_business_id;

  insert into public.gascars_wallets (business_id, balance)
  values (new_business_id, 0)
  on conflict (business_id) do nothing;

  insert into public.gascars_audit(actor_id, action, detail)
  values (
    current_user_id,
    'provider.profile_created',
    jsonb_build_object('business_id', new_business_id, 'business_type', p_business_type)
  );

  return jsonb_build_object(
    'ok', true,
    'existing', false,
    'business_id', new_business_id
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', SQLERRM,
      'code', SQLSTATE
    );
end;
$$;

revoke execute on function public.gascars_create_business_profile_v2(
  text,text,text,text,text,text,text,text
) from public, anon;

grant execute on function public.gascars_create_business_profile_v2(
  text,text,text,text,text,text,text,text
) to authenticated;
