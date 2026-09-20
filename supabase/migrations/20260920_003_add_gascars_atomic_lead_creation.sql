create or replace function public.gascars_create_lead(
  p_category text,
  p_service text,
  p_issue_description text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_vehicle_id uuid default null,
  p_preferred_time text default null,
  p_zip text default null,
  p_pickup_address text default null,
  p_destination_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_lead_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_category not in ('repair', 'towing') then
    raise exception 'Invalid lead category';
  end if;

  if length(trim(coalesce(p_issue_description, ''))) < 5 then
    raise exception 'Issue description is required';
  end if;

  insert into public.gascars_leads (
    customer_id,
    vehicle_id,
    category,
    service,
    issue_description,
    preferred_time,
    zip,
    pickup_address,
    destination_address,
    latitude,
    longitude
  )
  values (
    current_user_id,
    p_vehicle_id,
    p_category,
    nullif(trim(p_service), ''),
    trim(p_issue_description),
    nullif(trim(p_preferred_time), ''),
    nullif(trim(p_zip), ''),
    nullif(trim(p_pickup_address), ''),
    nullif(trim(p_destination_address), ''),
    p_latitude,
    p_longitude
  )
  returning id into new_lead_id;

  insert into public.gascars_lead_contacts (
    lead_id,
    contact_name,
    contact_phone,
    contact_email
  )
  values (
    new_lead_id,
    nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_contact_email), '')
  );

  return new_lead_id;
end;
$$;

revoke execute on function public.gascars_create_lead(
  text, text, text, text, text, text, uuid, text, text, text, text, double precision, double precision
) from public, anon;

grant execute on function public.gascars_create_lead(
  text, text, text, text, text, text, uuid, text, text, text, text, double precision, double precision
) to authenticated;
