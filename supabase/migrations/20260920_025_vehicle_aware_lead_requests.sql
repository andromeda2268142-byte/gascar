create or replace function public.gascars_create_lead_v4(
  p_category text,
  p_service_id uuid,
  p_service_location text,
  p_issue_description text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_preferred_contact_methods text[] default array['app'::text],
  p_vehicle_id uuid default null::uuid,
  p_preferred_time text default null::text,
  p_zip text default null::text,
  p_pickup_address text default null::text,
  p_destination_address text default null::text,
  p_latitude double precision default null::double precision,
  p_longitude double precision default null::double precision
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  new_lead_id uuid;
  current_user_id uuid := auth.uid();
  selected_service_name text;
  selected_service_category text;
  selected_vehicle_label text := '';
  contact_methods text[];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_category not in ('repair','towing') then raise exception 'Invalid lead category'; end if;
  if p_service_location not in ('shop','mobile','either') then raise exception 'Invalid service location preference'; end if;

  contact_methods := (
    select array_agg(distinct method order by method)
    from unnest(coalesce(p_preferred_contact_methods,array[]::text[])) method
  );

  if contact_methods is null or cardinality(contact_methods)=0 then
    raise exception 'Select at least one contact method';
  end if;

  if not (contact_methods <@ array['app','phone','email']::text[]) then
    raise exception 'Invalid preferred contact method';
  end if;

  select s.name,s.category
  into selected_service_name,selected_service_category
  from public.gascars_services s
  where s.id=p_service_id and s.active=true;

  if selected_service_name is null then raise exception 'Please select a valid service'; end if;
  if selected_service_category<>p_category then raise exception 'Selected service does not match request category'; end if;
  if p_category='towing' and p_service_location<>'mobile' then
    raise exception 'Roadside and towing services must be performed at the vehicle location';
  end if;
  if length(trim(coalesce(p_issue_description,'')))<5 then
    raise exception 'Issue description is required';
  end if;
  if 'phone'=any(contact_methods) and nullif(trim(coalesce(p_contact_phone,'')),'') is null then
    raise exception 'Phone number is required when Phone is selected';
  end if;
  if 'email'=any(contact_methods) and nullif(trim(coalesce(p_contact_email,'')),'') is null then
    raise exception 'Email is required when Email is selected';
  end if;

  if p_vehicle_id is not null then
    select trim(concat_ws(
      ' ',
      v.year::text,
      nullif(trim(v.make),''),
      nullif(trim(v.model),''),
      nullif(trim(coalesce(v.trim,'')),'')
    ))
    into selected_vehicle_label
    from public.gascars_vehicles v
    where v.id=p_vehicle_id
      and v.user_id=current_user_id;

    if not found then
      raise exception 'Selected vehicle does not belong to this account';
    end if;
  end if;

  insert into public.gascars_leads(
    customer_id,vehicle_id,vehicle_label,category,service,service_id,service_location,
    issue_description,preferred_time,zip,pickup_address,destination_address,
    latitude,longitude
  )
  values(
    current_user_id,p_vehicle_id,coalesce(selected_vehicle_label,''),p_category,selected_service_name,p_service_id,p_service_location,
    trim(p_issue_description),nullif(trim(p_preferred_time),''),
    nullif(trim(p_zip),''),nullif(trim(p_pickup_address),''),
    nullif(trim(p_destination_address),''),p_latitude,p_longitude
  )
  returning id into new_lead_id;

  insert into public.gascars_lead_contacts(
    lead_id,contact_name,contact_phone,contact_email,
    pickup_address,destination_address,latitude,longitude,
    preferred_contact_method,preferred_contact_methods
  )
  values(
    new_lead_id,nullif(trim(p_contact_name),''),nullif(trim(p_contact_phone),''),
    nullif(trim(p_contact_email),''),nullif(trim(p_pickup_address),''),
    nullif(trim(p_destination_address),''),p_latitude,p_longitude,
    contact_methods[1],contact_methods
  );

  return new_lead_id;
end;
$function$;
