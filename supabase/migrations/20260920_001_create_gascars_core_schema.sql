create extension if not exists pgcrypto;

create or replace function public.gascars_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.gascars_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'driver' check (role in ('driver','business','admin')),
  display_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gascars_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer check (year between 1886 and 2100),
  make text not null,
  model text not null,
  trim text,
  vin text,
  mileage integer check (mileage is null or mileage >= 0),
  fuel_type text default 'regular',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gascars_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_type text not null check (business_type in ('mechanic','towing','parts')),
  name text not null,
  slug text unique,
  description text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip text,
  latitude double precision,
  longitude double precision,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gascars_leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.gascars_vehicles(id) on delete set null,
  category text not null check (category in ('repair','towing')),
  service text,
  issue_description text not null,
  preferred_time text,
  zip text,
  pickup_address text,
  destination_address text,
  latitude double precision,
  longitude double precision,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gascars_lead_contacts (
  lead_id uuid primary key references public.gascars_leads(id) on delete cascade,
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.gascars_lead_unlocks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.gascars_leads(id) on delete cascade,
  business_id uuid not null references public.gascars_businesses(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','unlocked','refunded','failed')),
  provider_reference text,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, business_id)
);

create table if not exists public.gascars_quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.gascars_leads(id) on delete cascade,
  business_id uuid not null references public.gascars_businesses(id) on delete cascade,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  message text,
  status text not null default 'sent' check (status in ('sent','accepted','declined','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gascars_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.gascars_businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

create index if not exists gascars_vehicles_user_idx on public.gascars_vehicles(user_id);
create index if not exists gascars_businesses_owner_idx on public.gascars_businesses(owner_id);
create index if not exists gascars_businesses_status_type_idx on public.gascars_businesses(status, business_type);
create index if not exists gascars_leads_customer_idx on public.gascars_leads(customer_id);
create index if not exists gascars_leads_status_category_idx on public.gascars_leads(status, category);
create index if not exists gascars_unlocks_business_idx on public.gascars_lead_unlocks(business_id);
create index if not exists gascars_quotes_lead_idx on public.gascars_quotes(lead_id);
create index if not exists gascars_quotes_business_idx on public.gascars_quotes(business_id);

drop trigger if exists gascars_profiles_updated_at on public.gascars_profiles;
create trigger gascars_profiles_updated_at before update on public.gascars_profiles
for each row execute function public.gascars_set_updated_at();

drop trigger if exists gascars_vehicles_updated_at on public.gascars_vehicles;
create trigger gascars_vehicles_updated_at before update on public.gascars_vehicles
for each row execute function public.gascars_set_updated_at();

drop trigger if exists gascars_businesses_updated_at on public.gascars_businesses;
create trigger gascars_businesses_updated_at before update on public.gascars_businesses
for each row execute function public.gascars_set_updated_at();

drop trigger if exists gascars_leads_updated_at on public.gascars_leads;
create trigger gascars_leads_updated_at before update on public.gascars_leads
for each row execute function public.gascars_set_updated_at();

drop trigger if exists gascars_quotes_updated_at on public.gascars_quotes;
create trigger gascars_quotes_updated_at before update on public.gascars_quotes
for each row execute function public.gascars_set_updated_at();

create or replace function public.handle_gascars_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.gascars_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_gascars on auth.users;
create trigger on_auth_user_created_gascars
after insert on auth.users
for each row execute procedure public.handle_gascars_new_user();

alter table public.gascars_profiles enable row level security;
alter table public.gascars_vehicles enable row level security;
alter table public.gascars_businesses enable row level security;
alter table public.gascars_leads enable row level security;
alter table public.gascars_lead_contacts enable row level security;
alter table public.gascars_lead_unlocks enable row level security;
alter table public.gascars_quotes enable row level security;
alter table public.gascars_favorites enable row level security;

drop policy if exists "gascars profiles own select" on public.gascars_profiles;
create policy "gascars profiles own select" on public.gascars_profiles
for select to authenticated using (auth.uid() = id);

drop policy if exists "gascars profiles own update" on public.gascars_profiles;
create policy "gascars profiles own update" on public.gascars_profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "gascars vehicles own select" on public.gascars_vehicles;
create policy "gascars vehicles own select" on public.gascars_vehicles
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "gascars vehicles own insert" on public.gascars_vehicles;
create policy "gascars vehicles own insert" on public.gascars_vehicles
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "gascars vehicles own update" on public.gascars_vehicles;
create policy "gascars vehicles own update" on public.gascars_vehicles
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "gascars vehicles own delete" on public.gascars_vehicles;
create policy "gascars vehicles own delete" on public.gascars_vehicles
for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "gascars businesses public active select" on public.gascars_businesses;
create policy "gascars businesses public active select" on public.gascars_businesses
for select to anon, authenticated using (status = 'active');

drop policy if exists "gascars businesses owner select" on public.gascars_businesses;
create policy "gascars businesses owner select" on public.gascars_businesses
for select to authenticated using (auth.uid() = owner_id);

drop policy if exists "gascars businesses owner insert" on public.gascars_businesses;
create policy "gascars businesses owner insert" on public.gascars_businesses
for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists "gascars businesses owner update" on public.gascars_businesses;
create policy "gascars businesses owner update" on public.gascars_businesses
for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "gascars leads customer select" on public.gascars_leads;
create policy "gascars leads customer select" on public.gascars_leads
for select to authenticated using (auth.uid() = customer_id);

drop policy if exists "gascars leads business browse open" on public.gascars_leads;
create policy "gascars leads business browse open" on public.gascars_leads
for select to authenticated using (
  status = 'open' and exists (
    select 1 from public.gascars_businesses b
    where b.owner_id = auth.uid() and b.status = 'active'
  )
);

drop policy if exists "gascars leads customer insert" on public.gascars_leads;
create policy "gascars leads customer insert" on public.gascars_leads
for insert to authenticated with check (auth.uid() = customer_id);

drop policy if exists "gascars leads customer update" on public.gascars_leads;
create policy "gascars leads customer update" on public.gascars_leads
for update to authenticated using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

drop policy if exists "gascars contacts customer select" on public.gascars_lead_contacts;
create policy "gascars contacts customer select" on public.gascars_lead_contacts
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = auth.uid()
  )
);

drop policy if exists "gascars contacts unlocked business select" on public.gascars_lead_contacts;
create policy "gascars contacts unlocked business select" on public.gascars_lead_contacts
for select to authenticated using (
  exists (
    select 1
    from public.gascars_lead_unlocks u
    join public.gascars_businesses b on b.id = u.business_id
    where u.lead_id = lead_id
      and u.status = 'unlocked'
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "gascars contacts customer insert" on public.gascars_lead_contacts;
create policy "gascars contacts customer insert" on public.gascars_lead_contacts
for insert to authenticated with check (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = auth.uid()
  )
);

drop policy if exists "gascars contacts customer update" on public.gascars_lead_contacts;
create policy "gascars contacts customer update" on public.gascars_lead_contacts
for update to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = auth.uid()
  )
);

drop policy if exists "gascars unlocks business select" on public.gascars_lead_unlocks;
create policy "gascars unlocks business select" on public.gascars_lead_unlocks
for select to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
);

drop policy if exists "gascars unlocks customer select" on public.gascars_lead_unlocks;
create policy "gascars unlocks customer select" on public.gascars_lead_unlocks
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = auth.uid()
  )
);

drop policy if exists "gascars quotes customer select" on public.gascars_quotes;
create policy "gascars quotes customer select" on public.gascars_quotes
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = auth.uid()
  )
);

drop policy if exists "gascars quotes business select" on public.gascars_quotes;
create policy "gascars quotes business select" on public.gascars_quotes
for select to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
);

drop policy if exists "gascars quotes business insert" on public.gascars_quotes;
create policy "gascars quotes business insert" on public.gascars_quotes
for insert to authenticated with check (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = auth.uid() and b.status = 'active'
  )
  and exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.status = 'open'
  )
);

drop policy if exists "gascars quotes business update" on public.gascars_quotes;
create policy "gascars quotes business update" on public.gascars_quotes
for update to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
);

drop policy if exists "gascars favorites own select" on public.gascars_favorites;
create policy "gascars favorites own select" on public.gascars_favorites
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "gascars favorites own insert" on public.gascars_favorites;
create policy "gascars favorites own insert" on public.gascars_favorites
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "gascars favorites own delete" on public.gascars_favorites;
create policy "gascars favorites own delete" on public.gascars_favorites
for delete to authenticated using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.gascars_businesses to anon, authenticated;
grant select, insert, update on public.gascars_profiles to authenticated;
grant select, insert, update, delete on public.gascars_vehicles to authenticated;
grant select, insert, update on public.gascars_businesses to authenticated;
grant select, insert, update on public.gascars_leads to authenticated;
grant select, insert, update on public.gascars_lead_contacts to authenticated;
grant select on public.gascars_lead_unlocks to authenticated;
grant select, insert, update on public.gascars_quotes to authenticated;
grant select, insert, delete on public.gascars_favorites to authenticated;
