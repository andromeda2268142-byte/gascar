-- Dedicated provider workspace: business accounts, ZIP/service matching,
-- provider wallets, lead acceptance, and provider contact access.

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
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select role into current_role
  from public.gascars_profiles
  where id = current_user_id;

  if current_role <> 'business' then
    raise exception 'Use a dedicated Business account to register a provider';
  end if;

  if p_business_type not in ('mechanic', 'towing', 'parts') then
    raise exception 'Invalid business type';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Business name is required';
  end if;

  if coalesce(trim(p_zip),'') !~ '^[0-9]{5}$' then
    raise exception 'A valid 5-digit ZIP code is required';
  end if;

  if exists (select 1 from public.gascars_businesses where owner_id = current_user_id) then
    raise exception 'This business account already has a provider profile';
  end if;

  insert into public.gascars_businesses (
    owner_id,business_type,name,phone,email,address,city,state,zip,service_zips,status,is_verified
  )
  values (
    current_user_id,p_business_type,trim(p_name),nullif(trim(p_phone),''),
    nullif(trim(p_email),''),nullif(trim(p_address),''),nullif(trim(p_city),''),
    nullif(upper(trim(p_state)),''),trim(p_zip),array[trim(p_zip)],'pending',false
  )
  returning id into new_business_id;

  insert into public.gascars_wallets (business_id,balance)
  values (new_business_id,0)
  on conflict (business_id) do nothing;

  return new_business_id;
end;
$$;

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
      and b.is_verified=true
      and (
        gascars_leads.zip=b.zip
        or gascars_leads.zip=any(coalesce(b.service_zips,array[]::text[]))
      )
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

drop policy if exists "gascars leads accepted provider select" on public.gascars_leads;
create policy "gascars leads accepted provider select" on public.gascars_leads
for select to authenticated using (
  accepted_business_id is not null
  and exists (
    select 1 from public.gascars_businesses b
    where b.id=gascars_leads.accepted_business_id
      and b.owner_id=(select auth.uid())
  )
);

drop policy if exists "gascars provider wallet select" on public.gascars_wallets;
create policy "gascars provider wallet select" on public.gascars_wallets
for select to authenticated using (
  exists (select 1 from public.gascars_businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
);

drop policy if exists "gascars provider wallet ledger select" on public.gascars_wallet_ledger;
create policy "gascars provider wallet ledger select" on public.gascars_wallet_ledger
for select to authenticated using (
  exists (select 1 from public.gascars_businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
);

drop policy if exists "gascars provider unlocks select" on public.gascars_lead_unlocks;
create policy "gascars provider unlocks select" on public.gascars_lead_unlocks
for select to authenticated using (
  exists (select 1 from public.gascars_businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
);

drop policy if exists "gascars provider quotes select" on public.gascars_quotes;
create policy "gascars provider quotes select" on public.gascars_quotes
for select to authenticated using (
  exists (select 1 from public.gascars_businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
);

drop policy if exists "gascars provider recipients select" on public.gascars_lead_recipients;
create policy "gascars provider recipients select" on public.gascars_lead_recipients
for select to authenticated using (
  exists (select 1 from public.gascars_businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
);

drop policy if exists "gascars provider accepted contact select" on public.gascars_lead_contacts;
create policy "gascars provider accepted contact select" on public.gascars_lead_contacts
for select to authenticated using (
  exists (
    select 1
    from public.gascars_leads l
    join public.gascars_businesses b on b.id=l.accepted_business_id
    where l.id=lead_id
      and b.owner_id=(select auth.uid())
      and l.status in ('accepted','in_progress','completed')
  )
);

grant select on public.gascars_wallets,public.gascars_wallet_ledger,
  public.gascars_lead_unlocks,public.gascars_quotes,
  public.gascars_lead_recipients,public.gascars_lead_contacts to authenticated;

create or replace function public.gascars_provider_accept_lead(
  p_lead_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.gascars_businesses%rowtype;
  l public.gascars_leads%rowtype;
  w public.gascars_wallets%rowtype;
  current_balance integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;

  select * into b
  from public.gascars_businesses
  where owner_id=uid
  order by created_at asc
  limit 1
  for update;

  if not found or b.status<>'active' or not b.is_verified then
    raise exception 'Your business must be approved before accepting leads';
  end if;

  select * into l
  from public.gascars_leads
  where id=p_lead_id
  for update;

  if not found then raise exception 'Lead not found'; end if;

  if l.accepted_business_id=b.id and l.status in ('accepted','in_progress','completed') then
    select balance into current_balance from public.gascars_wallets where business_id=b.id;
    return jsonb_build_object('lead_id',l.id,'already_accepted',true,'balance',coalesce(current_balance,0));
  end if;

  if l.status<>'open' or l.expires_at<=now() then raise exception 'This lead is no longer available'; end if;
  if l.service_id is null then raise exception 'This lead cannot be matched by service'; end if;

  if not (
    (l.category='repair' and b.business_type='mechanic')
    or (l.category='towing' and b.business_type='towing')
  ) then raise exception 'Lead type does not match this business'; end if;

  if not (l.zip=b.zip or l.zip=any(coalesce(b.service_zips,array[]::text[]))) then
    raise exception 'Lead is outside your service area';
  end if;

  if not exists (
    select 1 from public.gascars_business_services bs
    where bs.business_id=b.id
      and bs.service_id=l.service_id
      and bs.active=true
      and (
        l.service_location='either'
        or bs.service_mode='both'
        or bs.service_mode=l.service_location
      )
  ) then raise exception 'Lead does not match your services or service mode'; end if;

  if exists (select 1 from public.gascars_wallet_ledger where request_id=p_request_id) then
    raise exception 'This acceptance request was already used';
  end if;

  insert into public.gascars_wallets (business_id,balance)
  values (b.id,0)
  on conflict (business_id) do nothing;

  select * into w
  from public.gascars_wallets
  where business_id=b.id
  for update;

  if w.balance<l.credit_cost then raise exception 'Not enough credits to accept this lead'; end if;

  update public.gascars_wallets
  set balance=balance-l.credit_cost,updated_at=now()
  where business_id=b.id
  returning balance into current_balance;

  update public.gascars_leads
  set status='accepted',accepted_business_id=b.id,updated_at=now()
  where id=l.id;

  insert into public.gascars_wallet_ledger (
    business_id,delta,balance_after,kind,reason,lead_id,actor_id,request_id
  )
  values (
    b.id,-l.credit_cost,current_balance,'accept','Lead accepted',l.id,uid,p_request_id
  );

  insert into public.gascars_audit(actor_id,action,detail)
  values (
    uid,'provider.accept_lead',
    jsonb_build_object('lead_id',l.id,'business_id',b.id,'credits',l.credit_cost,'request_id',p_request_id)
  );

  return jsonb_build_object('lead_id',l.id,'balance',current_balance,'credits_spent',l.credit_cost);
end;
$$;

create or replace function public.gascars_provider_set_lead_status(
  p_lead_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l public.gascars_leads%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_status not in ('in_progress','completed') then raise exception 'Invalid provider status'; end if;

  select * into l from public.gascars_leads where id=p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;

  if not exists (
    select 1 from public.gascars_businesses b
    where b.id=l.accepted_business_id and b.owner_id=uid and b.status='active'
  ) then raise exception 'This lead is not assigned to your business'; end if;

  if p_status='in_progress' and l.status<>'accepted' then
    raise exception 'Only accepted leads can be started';
  end if;

  if p_status='completed' and l.status not in ('accepted','in_progress') then
    raise exception 'This lead cannot be completed from its current status';
  end if;

  update public.gascars_leads
  set status=p_status,updated_at=now()
  where id=l.id;

  insert into public.gascars_audit(actor_id,action,detail)
  values (uid,'provider.lead_status',jsonb_build_object('lead_id',l.id,'status',p_status));
end;
$$;

revoke execute on function public.gascars_provider_accept_lead(uuid,uuid) from public,anon;
revoke execute on function public.gascars_provider_set_lead_status(uuid,text) from public,anon;
grant execute on function public.gascars_provider_accept_lead(uuid,uuid) to authenticated;
grant execute on function public.gascars_provider_set_lead_status(uuid,text) to authenticated;
