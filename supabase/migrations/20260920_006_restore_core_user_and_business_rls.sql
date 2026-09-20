alter table public.gascars_profiles enable row level security;
alter table public.gascars_vehicles enable row level security;
alter table public.gascars_businesses enable row level security;
alter table public.gascars_leads enable row level security;
alter table public.gascars_lead_contacts enable row level security;

drop policy if exists "gascars profiles own select" on public.gascars_profiles;
create policy "gascars profiles own select" on public.gascars_profiles
for select to authenticated using ((select auth.uid())=id);

drop policy if exists "gascars profiles own update" on public.gascars_profiles;
create policy "gascars profiles own update" on public.gascars_profiles
for update to authenticated using ((select auth.uid())=id)
with check ((select auth.uid())=id);

drop policy if exists "gascars vehicles own select" on public.gascars_vehicles;
create policy "gascars vehicles own select" on public.gascars_vehicles
for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists "gascars vehicles own insert" on public.gascars_vehicles;
create policy "gascars vehicles own insert" on public.gascars_vehicles
for insert to authenticated with check ((select auth.uid())=user_id);

drop policy if exists "gascars vehicles own update" on public.gascars_vehicles;
create policy "gascars vehicles own update" on public.gascars_vehicles
for update to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

drop policy if exists "gascars vehicles own delete" on public.gascars_vehicles;
create policy "gascars vehicles own delete" on public.gascars_vehicles
for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists "gascars businesses public active select" on public.gascars_businesses;
create policy "gascars businesses public active select" on public.gascars_businesses
for select to anon,authenticated using (status='active');

drop policy if exists "gascars businesses owner select" on public.gascars_businesses;
create policy "gascars businesses owner select" on public.gascars_businesses
for select to authenticated using ((select auth.uid())=owner_id);

drop policy if exists "gascars businesses owner insert" on public.gascars_businesses;
create policy "gascars businesses owner insert" on public.gascars_businesses
for insert to authenticated with check (
  (select auth.uid())=owner_id and status='pending' and is_verified=false
);

drop policy if exists "gascars businesses owner update" on public.gascars_businesses;
create policy "gascars businesses owner update" on public.gascars_businesses
for update to authenticated using ((select auth.uid())=owner_id)
with check ((select auth.uid())=owner_id);

drop policy if exists "gascars leads customer select" on public.gascars_leads;
create policy "gascars leads customer select" on public.gascars_leads
for select to authenticated using ((select auth.uid())=customer_id);

drop policy if exists "gascars leads customer insert" on public.gascars_leads;
create policy "gascars leads customer insert" on public.gascars_leads
for insert to authenticated with check ((select auth.uid())=customer_id);

drop policy if exists "gascars leads customer update" on public.gascars_leads;
create policy "gascars leads customer update" on public.gascars_leads
for update to authenticated using ((select auth.uid())=customer_id)
with check ((select auth.uid())=customer_id);

drop policy if exists "gascars contacts customer select" on public.gascars_lead_contacts;
create policy "gascars contacts customer select" on public.gascars_lead_contacts
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id=lead_id and l.customer_id=(select auth.uid())
  )
);

drop policy if exists "gascars contacts customer insert" on public.gascars_lead_contacts;
create policy "gascars contacts customer insert" on public.gascars_lead_contacts
for insert to authenticated with check (
  exists (
    select 1 from public.gascars_leads l
    where l.id=lead_id and l.customer_id=(select auth.uid())
  )
);

drop policy if exists "gascars contacts customer update" on public.gascars_lead_contacts;
create policy "gascars contacts customer update" on public.gascars_lead_contacts
for update to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id=lead_id and l.customer_id=(select auth.uid())
  )
) with check (
  exists (
    select 1 from public.gascars_leads l
    where l.id=lead_id and l.customer_id=(select auth.uid())
  )
);

grant select,insert,update on public.gascars_profiles to authenticated;
grant select,insert,update,delete on public.gascars_vehicles to authenticated;
grant select on public.gascars_businesses to anon,authenticated;
grant insert on public.gascars_businesses to authenticated;
grant select,insert,update on public.gascars_leads to authenticated;
grant select,insert,update on public.gascars_lead_contacts to authenticated;
