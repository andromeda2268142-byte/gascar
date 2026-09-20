alter function public.gascars_set_updated_at() set search_path = '';

revoke execute on function public.handle_gascars_new_user() from public, anon, authenticated;

create index if not exists gascars_favorites_business_idx on public.gascars_favorites(business_id);
create index if not exists gascars_leads_vehicle_idx on public.gascars_leads(vehicle_id);

revoke update on public.gascars_profiles from authenticated;
grant update (display_name, phone, avatar_url) on public.gascars_profiles to authenticated;

revoke update on public.gascars_businesses from authenticated;
grant update (
  business_type, name, slug, description, phone, email,
  address, city, state, zip, latitude, longitude
) on public.gascars_businesses to authenticated;

drop policy if exists "gascars profiles own select" on public.gascars_profiles;
create policy "gascars profiles own select" on public.gascars_profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "gascars profiles own update" on public.gascars_profiles;
create policy "gascars profiles own update" on public.gascars_profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "gascars vehicles own select" on public.gascars_vehicles;
create policy "gascars vehicles own select" on public.gascars_vehicles
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "gascars vehicles own insert" on public.gascars_vehicles;
create policy "gascars vehicles own insert" on public.gascars_vehicles
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "gascars vehicles own update" on public.gascars_vehicles;
create policy "gascars vehicles own update" on public.gascars_vehicles
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "gascars vehicles own delete" on public.gascars_vehicles;
create policy "gascars vehicles own delete" on public.gascars_vehicles
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "gascars businesses owner select" on public.gascars_businesses;
create policy "gascars businesses owner select" on public.gascars_businesses
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "gascars businesses owner insert" on public.gascars_businesses;
create policy "gascars businesses owner insert" on public.gascars_businesses
for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and status = 'pending'
  and is_verified = false
);

drop policy if exists "gascars businesses owner update" on public.gascars_businesses;
create policy "gascars businesses owner update" on public.gascars_businesses
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "gascars leads customer select" on public.gascars_leads;
create policy "gascars leads customer select" on public.gascars_leads
for select to authenticated using ((select auth.uid()) = customer_id);

drop policy if exists "gascars leads business browse open" on public.gascars_leads;
create policy "gascars leads business browse open" on public.gascars_leads
for select to authenticated using (
  status = 'open' and exists (
    select 1 from public.gascars_businesses b
    where b.owner_id = (select auth.uid()) and b.status = 'active'
  )
);

drop policy if exists "gascars leads customer insert" on public.gascars_leads;
create policy "gascars leads customer insert" on public.gascars_leads
for insert to authenticated with check ((select auth.uid()) = customer_id);

drop policy if exists "gascars leads customer update" on public.gascars_leads;
create policy "gascars leads customer update" on public.gascars_leads
for update to authenticated using ((select auth.uid()) = customer_id)
with check ((select auth.uid()) = customer_id);

drop policy if exists "gascars contacts customer select" on public.gascars_lead_contacts;
create policy "gascars contacts customer select" on public.gascars_lead_contacts
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = (select auth.uid())
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
      and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "gascars contacts customer insert" on public.gascars_lead_contacts;
create policy "gascars contacts customer insert" on public.gascars_lead_contacts
for insert to authenticated with check (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = (select auth.uid())
  )
);

drop policy if exists "gascars contacts customer update" on public.gascars_lead_contacts;
create policy "gascars contacts customer update" on public.gascars_lead_contacts
for update to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = (select auth.uid())
  )
);

drop policy if exists "gascars unlocks business select" on public.gascars_lead_unlocks;
create policy "gascars unlocks business select" on public.gascars_lead_unlocks
for select to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "gascars unlocks customer select" on public.gascars_lead_unlocks;
create policy "gascars unlocks customer select" on public.gascars_lead_unlocks
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = (select auth.uid())
  )
);

drop policy if exists "gascars quotes customer select" on public.gascars_quotes;
create policy "gascars quotes customer select" on public.gascars_quotes
for select to authenticated using (
  exists (
    select 1 from public.gascars_leads l
    where l.id = lead_id and l.customer_id = (select auth.uid())
  )
);

drop policy if exists "gascars quotes business select" on public.gascars_quotes;
create policy "gascars quotes business select" on public.gascars_quotes
for select to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "gascars quotes business insert" on public.gascars_quotes;
create policy "gascars quotes business insert" on public.gascars_quotes
for insert to authenticated with check (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id
      and b.owner_id = (select auth.uid())
      and b.status = 'active'
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
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.gascars_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "gascars favorites own select" on public.gascars_favorites;
create policy "gascars favorites own select" on public.gascars_favorites
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "gascars favorites own insert" on public.gascars_favorites;
create policy "gascars favorites own insert" on public.gascars_favorites
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "gascars favorites own delete" on public.gascars_favorites;
create policy "gascars favorites own delete" on public.gascars_favorites
for delete to authenticated using ((select auth.uid()) = user_id);
