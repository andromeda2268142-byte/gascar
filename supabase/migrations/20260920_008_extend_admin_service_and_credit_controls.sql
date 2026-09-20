create or replace function public.gascars_admin_create_service(
  p_name text,
  p_category text,
  p_group_name text default null,
  p_description text default null,
  p_keywords text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  new_id uuid := gen_random_uuid();
  new_slug text;
  next_sort integer;
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  if p_category not in ('repair','towing') then raise exception 'Invalid service category'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Service name is required'; end if;

  new_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if new_slug = '' then new_slug := 'service'; end if;
  if exists(select 1 from public.gascars_services where slug=new_slug) then
    new_slug := new_slug || '-' || substr(replace(new_id::text,'-',''),1,6);
  end if;

  select coalesce(max(sort_order),0)+10 into next_sort from public.gascars_services;

  insert into public.gascars_services(
    id,slug,name,category,group_name,description,keywords,active,sort_order
  )
  values(
    new_id,new_slug,trim(p_name),p_category,nullif(trim(p_group_name),''),
    nullif(trim(p_description),''),coalesce(p_keywords,'{}'),true,next_sort
  );

  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.service_create',jsonb_build_object('service_id',new_id,'name',trim(p_name),'category',p_category));

  return new_id;
end;
$$;

create or replace function public.gascars_admin_grant_credits(
  p_business_id uuid,
  p_credits integer,
  p_reason text default 'Admin credit grant'
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  new_balance integer;
  request_uuid uuid := gen_random_uuid();
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  if p_credits is null or p_credits <= 0 or p_credits > 10000 then
    raise exception 'Credits must be between 1 and 10000';
  end if;
  if not exists(select 1 from public.gascars_businesses where id=p_business_id) then
    raise exception 'Business not found';
  end if;

  insert into public.gascars_wallets(business_id,balance,updated_at)
  values(p_business_id,0,now())
  on conflict (business_id) do nothing;

  update public.gascars_wallets
  set balance=balance+p_credits,updated_at=now()
  where business_id=p_business_id
  returning balance into new_balance;

  insert into public.gascars_wallet_ledger(
    business_id,delta,balance_after,kind,reason,actor_id,request_id
  )
  values(
    p_business_id,p_credits,new_balance,'grant',
    coalesce(nullif(trim(p_reason),''),'Admin credit grant'),
    auth.uid(),request_uuid
  );

  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.credit_grant',jsonb_build_object('business_id',p_business_id,'credits',p_credits,'balance_after',new_balance));

  return new_balance;
end;
$$;

revoke execute on function public.gascars_admin_create_service(text,text,text,text,text[]) from public,anon;
revoke execute on function public.gascars_admin_grant_credits(uuid,integer,text) from public,anon;
grant execute on function public.gascars_admin_create_service(text,text,text,text,text[]) to authenticated;
grant execute on function public.gascars_admin_grant_credits(uuid,integer,text) to authenticated;
