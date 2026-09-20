-- Realtime provider operations, credit packs, payment-ready ledger, and health checks.

alter table public.gascars_wallet_ledger
  drop constraint if exists gascars_wallet_ledger_kind_check,
  drop constraint if exists gascars_wallet_ledger_check,
  drop constraint if exists gascars_wallet_ledger_check1;

alter table public.gascars_wallet_ledger
  add constraint gascars_wallet_ledger_kind_check
    check (kind in ('grant','accept','refund','purchase')),
  add constraint gascars_wallet_ledger_semantics_check
    check (
      (kind='accept' and delta<0 and lead_id is not null)
      or (kind='refund' and delta>0 and lead_id is not null)
      or (kind in ('grant','purchase') and delta>0)
    );

create table if not exists public.gascars_credit_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.gascars_credit_packages (slug,name,credits,price_cents,active,sort_order)
values
  ('starter-10','Starter',10,1900,true,10),
  ('growth-30','Growth',30,4900,true,20),
  ('pro-75','Pro',75,9900,true,30)
on conflict (slug) do update
set name=excluded.name,
    credits=excluded.credits,
    price_cents=excluded.price_cents,
    active=excluded.active,
    sort_order=excluded.sort_order;

create table if not exists public.gascars_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gascars_businesses(id) on delete cascade,
  package_id uuid not null references public.gascars_credit_packages(id) on delete restrict,
  provider text not null check (provider in ('dev','stripe')),
  provider_session_id text,
  request_id uuid not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  credits integer not null check (credits > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(provider, provider_session_id)
);

create index if not exists gascars_credit_purchases_business_idx
on public.gascars_credit_purchases(business_id, created_at desc);

alter table public.gascars_credit_packages enable row level security;
alter table public.gascars_credit_purchases enable row level security;

drop policy if exists "gascars credit packages active read" on public.gascars_credit_packages;
create policy "gascars credit packages active read"
on public.gascars_credit_packages
for select to authenticated
using (active=true or public.gascars_is_admin());

drop policy if exists "gascars credit purchases owner read" on public.gascars_credit_purchases;
create policy "gascars credit purchases owner read"
on public.gascars_credit_purchases
for select to authenticated
using (
  public.gascars_is_admin()
  or exists (
    select 1 from public.gascars_businesses b
    where b.id=business_id
      and b.owner_id=(select auth.uid())
  )
);

grant select on public.gascars_credit_packages to authenticated;
grant select on public.gascars_credit_purchases to authenticated;

create or replace function public.gascars_dev_purchase_credit_package(
  p_package_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  dev_enabled boolean := false;
  b public.gascars_businesses%rowtype;
  pkg public.gascars_credit_packages%rowtype;
  new_balance integer;
  purchase_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select d.auto_confirm_new_users into dev_enabled
  from gascars_private.dev_settings d
  where d.singleton=true;

  if not coalesce(dev_enabled,false) then
    raise exception 'Development credit simulator is disabled';
  end if;

  select * into b
  from public.gascars_businesses
  where owner_id=uid
  order by created_at asc
  limit 1;

  if not found then raise exception 'Provider business not found'; end if;

  select * into pkg
  from public.gascars_credit_packages
  where id=p_package_id and active=true;

  if not found then raise exception 'Credit package not found'; end if;

  select p.id into purchase_id
  from public.gascars_credit_purchases p
  where p.request_id=p_request_id;

  if purchase_id is not null then
    select balance into new_balance
    from public.gascars_wallets
    where business_id=b.id;

    return jsonb_build_object(
      'ok',true,'duplicate',true,'purchase_id',purchase_id,'balance',coalesce(new_balance,0)
    );
  end if;

  insert into public.gascars_wallets(business_id,balance)
  values(b.id,0)
  on conflict (business_id) do nothing;

  update public.gascars_wallets
  set balance=balance+pkg.credits,updated_at=now()
  where business_id=b.id
  returning balance into new_balance;

  insert into public.gascars_credit_purchases(
    business_id,package_id,provider,provider_session_id,request_id,
    amount_cents,credits,status,paid_at
  )
  values(
    b.id,pkg.id,'dev','dev_'||p_request_id::text,p_request_id,
    pkg.price_cents,pkg.credits,'paid',now()
  )
  returning id into purchase_id;

  insert into public.gascars_wallet_ledger(
    business_id,delta,balance_after,kind,reason,actor_id,request_id
  )
  values(
    b.id,pkg.credits,new_balance,'purchase',
    'Development credit purchase: '||pkg.name,uid,p_request_id
  );

  return jsonb_build_object(
    'ok',true,'duplicate',false,'purchase_id',purchase_id,
    'credits',pkg.credits,'balance',new_balance
  );
end;
$$;

revoke execute on function public.gascars_dev_purchase_credit_package(uuid,uuid) from public,anon;
grant execute on function public.gascars_dev_purchase_credit_package(uuid,uuid) to authenticated;

create or replace function public.gascars_apply_paid_credit_purchase(
  p_business_id uuid,
  p_package_id uuid,
  p_provider_session_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  pkg public.gascars_credit_packages%rowtype;
  existing_id uuid;
  new_balance integer;
  new_purchase_id uuid;
begin
  select id into existing_id
  from public.gascars_credit_purchases
  where provider='stripe' and provider_session_id=p_provider_session_id;

  if existing_id is not null then
    select balance into new_balance
    from public.gascars_wallets
    where business_id=p_business_id;
    return jsonb_build_object('ok',true,'duplicate',true,'purchase_id',existing_id,'balance',coalesce(new_balance,0));
  end if;

  select * into pkg
  from public.gascars_credit_packages
  where id=p_package_id and active=true;

  if not found then raise exception 'Credit package not found'; end if;
  if not exists(select 1 from public.gascars_businesses where id=p_business_id) then
    raise exception 'Business not found';
  end if;

  insert into public.gascars_wallets(business_id,balance)
  values(p_business_id,0)
  on conflict (business_id) do nothing;

  update public.gascars_wallets
  set balance=balance+pkg.credits,updated_at=now()
  where business_id=p_business_id
  returning balance into new_balance;

  insert into public.gascars_credit_purchases(
    business_id,package_id,provider,provider_session_id,request_id,
    amount_cents,credits,status,paid_at
  )
  values(
    p_business_id,pkg.id,'stripe',p_provider_session_id,p_request_id,
    pkg.price_cents,pkg.credits,'paid',now()
  )
  returning id into new_purchase_id;

  insert into public.gascars_wallet_ledger(
    business_id,delta,balance_after,kind,reason,request_id
  )
  values(
    p_business_id,pkg.credits,new_balance,'purchase',
    'Stripe credit purchase: '||pkg.name,p_request_id
  );

  return jsonb_build_object(
    'ok',true,'duplicate',false,'purchase_id',new_purchase_id,
    'credits',pkg.credits,'balance',new_balance
  );
end;
$$;

revoke execute on function public.gascars_apply_paid_credit_purchase(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.gascars_apply_paid_credit_purchase(uuid,uuid,text,uuid) to service_role;

create or replace function public.gascars_admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  negative_wallets integer;
  missing_wallets integer;
  active_unverified integer;
  open_accepted integer;
  accepted_without_business integer;
  expired_open integer;
  leads_without_service integer;
  ledger_mismatch integer;
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;

  select count(*) into negative_wallets from public.gascars_wallets where balance<0;
  select count(*) into missing_wallets
  from public.gascars_businesses b
  left join public.gascars_wallets w on w.business_id=b.id
  where w.business_id is null;
  select count(*) into active_unverified
  from public.gascars_businesses where status='active' and not is_verified;
  select count(*) into open_accepted
  from public.gascars_leads where status='open' and accepted_business_id is not null;
  select count(*) into accepted_without_business
  from public.gascars_leads
  where status in ('accepted','in_progress','completed') and accepted_business_id is null;
  select count(*) into expired_open
  from public.gascars_leads where status='open' and expires_at<=now();
  select count(*) into leads_without_service
  from public.gascars_leads where service_id is null;

  select count(*) into ledger_mismatch
  from public.gascars_wallets w
  where exists(select 1 from public.gascars_wallet_ledger l where l.business_id=w.business_id)
    and w.balance <> (
      select l.balance_after
      from public.gascars_wallet_ledger l
      where l.business_id=w.business_id
      order by l.created_at desc,l.id desc
      limit 1
    );

  return jsonb_build_object(
    'ok',
      negative_wallets=0 and missing_wallets=0 and active_unverified=0
      and open_accepted=0 and accepted_without_business=0 and expired_open=0
      and leads_without_service=0 and ledger_mismatch=0,
    'negative_wallets',negative_wallets,
    'missing_wallets',missing_wallets,
    'active_unverified',active_unverified,
    'open_accepted',open_accepted,
    'accepted_without_business',accepted_without_business,
    'expired_open',expired_open,
    'leads_without_service',leads_without_service,
    'ledger_mismatch',ledger_mismatch
  );
end;
$$;

revoke execute on function public.gascars_admin_system_health() from public,anon;
grant execute on function public.gascars_admin_system_health() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='gascars_leads'
  ) then alter publication supabase_realtime add table public.gascars_leads; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='gascars_wallets'
  ) then alter publication supabase_realtime add table public.gascars_wallets; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='gascars_wallet_ledger'
  ) then alter publication supabase_realtime add table public.gascars_wallet_ledger; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='gascars_businesses'
  ) then alter publication supabase_realtime add table public.gascars_businesses; end if;
end $$;
