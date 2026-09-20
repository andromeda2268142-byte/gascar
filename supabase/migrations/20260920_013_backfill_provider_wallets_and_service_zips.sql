update public.gascars_businesses
set service_zips = array[zip],
    updated_at = now()
where zip is not null
  and trim(zip) <> ''
  and coalesce(cardinality(service_zips),0) = 0;

insert into public.gascars_wallets (business_id,balance)
select b.id,0
from public.gascars_businesses b
left join public.gascars_wallets w on w.business_id=b.id
where w.business_id is null
on conflict (business_id) do nothing;
