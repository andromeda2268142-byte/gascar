drop policy if exists "gascars business services owner select" on public.gascars_business_services;
create policy "gascars business services owner select" on public.gascars_business_services
for select to authenticated using (
  exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id and b.owner_id=(select auth.uid())
  )
);
