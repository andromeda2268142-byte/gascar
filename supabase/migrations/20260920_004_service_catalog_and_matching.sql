create table if not exists public.gascars_services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null check (category in ('repair','towing')),
  group_name text,
  description text,
  keywords text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.gascars_services (slug, name, category, group_name, description, keywords, sort_order)
values
  ('brake-inspection-repair','Brake inspection & repair','repair','Brakes','Inspection and repair for squeaking, grinding or weak brakes.',array['brake','brakes','brak','pads','rotor','rotors','squeak','squeaking','grinding','stopping'],10),
  ('brake-pad-replacement','Brake pad replacement','repair','Brakes','Replace worn front or rear brake pads.',array['brake','brakes','brak','pads','pad','replacement'],11),
  ('brake-rotor-replacement','Brake rotor replacement','repair','Brakes','Replace damaged or worn brake rotors.',array['brake','brakes','brak','rotor','rotors','disc'],12),
  ('oil-change','Oil & filter change','repair','Maintenance','Engine oil and oil filter service.',array['oil','filter','maintenance','lube'],20),
  ('battery-service','Battery test / replacement','repair','Electrical','Battery testing, charging and replacement.',array['battery','dead battery','charging','electrical'],30),
  ('alternator-repair','Alternator repair','repair','Electrical','Diagnosis and repair of charging-system problems.',array['alternator','battery light','charging','electrical'],31),
  ('starter-repair','Starter repair','repair','Electrical','Diagnosis and repair when the engine will not crank.',array['starter','crank','no start','starting'],32),
  ('ac-service','A/C diagnosis & repair','repair','Climate','Air-conditioning diagnosis, recharge and repair.',array['ac','a/c','air conditioning','cold air','recharge'],40),
  ('check-engine-diagnostics','Check engine diagnostics','repair','Diagnostics','Scan and diagnose warning lights and drivability issues.',array['check engine','diagnostic','diagnostics','scan','warning light','engine light'],50),
  ('engine-repair','Engine repair','repair','Engine','Mechanical engine diagnosis and repair.',array['engine','motor','misfire','overheating','leak'],51),
  ('transmission-service','Transmission service & repair','repair','Transmission','Transmission diagnosis, service and repair.',array['transmission','gear','shifting','fluid'],52),
  ('tire-service','Tire repair / replacement','repair','Tires','Flat repair, tire replacement and related service.',array['tire','tires','flat','puncture','replacement'],60),
  ('wheel-alignment','Wheel alignment','repair','Tires','Alignment service for pulling or uneven tire wear.',array['alignment','wheel','pulling','tire wear'],61),
  ('suspension-steering','Suspension & steering','repair','Suspension','Diagnosis and repair for ride, steering and suspension issues.',array['suspension','steering','shock','shocks','strut','struts'],70),
  ('general-maintenance','General maintenance','repair','Maintenance','Routine inspection and maintenance service.',array['maintenance','service','tune up','inspection'],80),
  ('vehicle-tow','Vehicle towing','towing','Roadside','Tow a disabled vehicle to a destination.',array['tow','towing','wrecker','disabled'],110),
  ('jump-start','Jump start','towing','Roadside','Battery jump start at the vehicle location.',array['jump','jump start','battery','dead battery'],111),
  ('roadside-flat-tire','Roadside flat tire help','towing','Roadside','Help with a flat tire or spare tire installation.',array['flat','tire','spare','roadside'],112),
  ('vehicle-lockout','Vehicle lockout','towing','Roadside','Help getting back into a locked vehicle.',array['lockout','locked out','keys','unlock'],113),
  ('roadside-fuel-delivery','Emergency fuel delivery','towing','Roadside','Small emergency fuel delivery to get moving again.',array['fuel','gas','out of gas','delivery','roadside'],114)
on conflict (slug) do update
set name=excluded.name, category=excluded.category, group_name=excluded.group_name,
    description=excluded.description, keywords=excluded.keywords,
    sort_order=excluded.sort_order, active=true;

create table if not exists public.gascars_business_services (
  business_id uuid not null references public.gascars_businesses(id) on delete cascade,
  service_id uuid not null references public.gascars_services(id) on delete cascade,
  service_mode text not null default 'shop' check (service_mode in ('shop','mobile','both')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, service_id)
);

create index if not exists gascars_business_services_service_idx
on public.gascars_business_services(service_id, business_id)
where active=true;

drop trigger if exists gascars_business_services_updated_at on public.gascars_business_services;
create trigger gascars_business_services_updated_at
before update on public.gascars_business_services
for each row execute function public.gascars_set_updated_at();

alter table public.gascars_leads
  add column if not exists service_id uuid references public.gascars_services(id) on delete restrict,
  add column if not exists service_location text not null default 'either'
    check (service_location in ('shop','mobile','either'));

create index if not exists gascars_leads_service_idx
on public.gascars_leads(service_id,status,service_location);

alter table public.gascars_services enable row level security;
alter table public.gascars_business_services enable row level security;

drop policy if exists "gascars services public read" on public.gascars_services;
create policy "gascars services public read" on public.gascars_services
for select to anon, authenticated using (active=true);

drop policy if exists "gascars business services public read" on public.gascars_business_services;
create policy "gascars business services public read" on public.gascars_business_services
for select to anon, authenticated using (
  active=true and exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id and b.status='active'
  )
);

drop policy if exists "gascars business services owner insert" on public.gascars_business_services;
create policy "gascars business services owner insert" on public.gascars_business_services
for insert to authenticated with check (
  exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id and b.owner_id=(select auth.uid())
  )
);

drop policy if exists "gascars business services owner update" on public.gascars_business_services;
create policy "gascars business services owner update" on public.gascars_business_services
for update to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id and b.owner_id=(select auth.uid())
  )
) with check (
  exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id and b.owner_id=(select auth.uid())
  )
);

drop policy if exists "gascars business services owner delete" on public.gascars_business_services;
create policy "gascars business services owner delete" on public.gascars_business_services
for delete to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id and b.owner_id=(select auth.uid())
  )
);

grant select on public.gascars_services to anon, authenticated;
grant select,insert,update,delete on public.gascars_business_services to authenticated;

drop policy if exists "gascars leads business browse open" on public.gascars_leads;
create policy "gascars leads business browse open" on public.gascars_leads
for select to authenticated using (
  status='open'
  and service_id is not null
  and exists (
    select 1
    from public.gascars_businesses b
    join public.gascars_business_services bs
      on bs.business_id=b.id
     and bs.service_id=gascars_leads.service_id
     and bs.active=true
    where b.owner_id=(select auth.uid())
      and b.status='active'
      and (
        (gascars_leads.category='repair' and b.business_type='mechanic')
        or (gascars_leads.category='towing' and b.business_type='towing')
      )
      and (
        gascars_leads.service_location='either'
        or bs.service_mode='both'
        or bs.service_mode=gascars_leads.service_location
      )
  )
);

create or replace function public.gascars_create_lead_v2(
  p_category text,
  p_service_id uuid,
  p_service_location text,
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
set search_path=''
as $$
declare
  new_lead_id uuid;
  current_user_id uuid;
  selected_service_name text;
  selected_service_category text;
begin
  current_user_id:=auth.uid();
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_category not in ('repair','towing') then raise exception 'Invalid lead category'; end if;
  if p_service_location not in ('shop','mobile','either') then raise exception 'Invalid service location preference'; end if;

  select s.name,s.category
  into selected_service_name,selected_service_category
  from public.gascars_services s
  where s.id=p_service_id and s.active=true;

  if selected_service_name is null then raise exception 'Please select a valid service'; end if;
  if selected_service_category<>p_category then raise exception 'Selected service does not match request category'; end if;
  if p_category='towing' and p_service_location<>'mobile' then
    raise exception 'Roadside and towing services must be performed at the vehicle location';
  end if;
  if length(trim(coalesce(p_issue_description,'')))<5 then raise exception 'Issue description is required'; end if;

  insert into public.gascars_leads (
    customer_id,vehicle_id,category,service,service_id,service_location,
    issue_description,preferred_time,zip,pickup_address,destination_address,
    latitude,longitude
  )
  values (
    current_user_id,p_vehicle_id,p_category,selected_service_name,p_service_id,p_service_location,
    trim(p_issue_description),nullif(trim(p_preferred_time),''),
    nullif(trim(p_zip),''),nullif(trim(p_pickup_address),''),
    nullif(trim(p_destination_address),''),p_latitude,p_longitude
  )
  returning id into new_lead_id;

  insert into public.gascars_lead_contacts (lead_id,contact_name,contact_phone,contact_email)
  values (
    new_lead_id,nullif(trim(p_contact_name),''),
    nullif(trim(p_contact_phone),''),nullif(trim(p_contact_email),'')
  );

  return new_lead_id;
end;
$$;

revoke execute on function public.gascars_create_lead_v2(
  text,uuid,text,text,text,text,text,uuid,text,text,text,text,double precision,double precision
) from public,anon;

grant execute on function public.gascars_create_lead_v2(
  text,uuid,text,text,text,text,text,uuid,text,text,text,text,double precision,double precision
) to authenticated;
