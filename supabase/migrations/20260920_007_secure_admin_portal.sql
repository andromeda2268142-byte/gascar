create or replace function public.gascars_is_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.gascars_profiles p
    where p.id=auth.uid() and p.role='admin'
  );
$$;

revoke execute on function public.gascars_is_admin() from public,anon;
grant execute on function public.gascars_is_admin() to authenticated;

drop policy if exists "gascars admin profiles select" on public.gascars_profiles;
create policy "gascars admin profiles select" on public.gascars_profiles
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin businesses select" on public.gascars_businesses;
create policy "gascars admin businesses select" on public.gascars_businesses
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin leads select" on public.gascars_leads;
create policy "gascars admin leads select" on public.gascars_leads
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin lead contacts select" on public.gascars_lead_contacts;
create policy "gascars admin lead contacts select" on public.gascars_lead_contacts
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin services select" on public.gascars_services;
create policy "gascars admin services select" on public.gascars_services
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin business services select" on public.gascars_business_services;
create policy "gascars admin business services select" on public.gascars_business_services
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin unlocks select" on public.gascars_lead_unlocks;
create policy "gascars admin unlocks select" on public.gascars_lead_unlocks
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin quotes select" on public.gascars_quotes;
create policy "gascars admin quotes select" on public.gascars_quotes
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin wallets select" on public.gascars_wallets;
create policy "gascars admin wallets select" on public.gascars_wallets
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin wallet ledger select" on public.gascars_wallet_ledger;
create policy "gascars admin wallet ledger select" on public.gascars_wallet_ledger
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin recipients select" on public.gascars_lead_recipients;
create policy "gascars admin recipients select" on public.gascars_lead_recipients
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin support tickets select" on public.gascars_support_tickets;
create policy "gascars admin support tickets select" on public.gascars_support_tickets
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin support messages select" on public.gascars_support_messages;
create policy "gascars admin support messages select" on public.gascars_support_messages
for select to authenticated using (public.gascars_is_admin());

drop policy if exists "gascars admin audit select" on public.gascars_audit;
create policy "gascars admin audit select" on public.gascars_audit
for select to authenticated using (public.gascars_is_admin());

grant select on public.gascars_profiles,gascars_businesses,gascars_leads,gascars_lead_contacts,
  public.gascars_services,public.gascars_business_services,public.gascars_lead_unlocks,
  public.gascars_quotes,public.gascars_wallets,public.gascars_wallet_ledger,
  public.gascars_lead_recipients,public.gascars_support_tickets,
  public.gascars_support_messages,public.gascars_audit to authenticated;

create or replace function public.gascars_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'users',(select count(*) from public.gascars_profiles),
    'businesses',(select count(*) from public.gascars_businesses),
    'pending_businesses',(select count(*) from public.gascars_businesses where status='pending'),
    'active_businesses',(select count(*) from public.gascars_businesses where status='active'),
    'open_leads',(select count(*) from public.gascars_leads where status='open'),
    'completed_leads',(select count(*) from public.gascars_leads where status='completed'),
    'services',(select count(*) from public.gascars_services where active),
    'open_support_tickets',(select count(*) from public.gascars_support_tickets where status='open'),
    'unlocks',(select count(*) from public.gascars_lead_unlocks where status='unlocked'),
    'credits_outstanding',(select coalesce(sum(balance),0) from public.gascars_wallets)
  );
end;
$$;

create or replace function public.gascars_admin_list_users()
returns table(id uuid,email text,display_name text,role text,created_at timestamptz,last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  return query
  select u.id,u.email::text,p.display_name,p.role,p.created_at,u.last_sign_in_at
  from auth.users u
  left join public.gascars_profiles p on p.id=u.id
  order by p.created_at desc nulls last,u.created_at desc;
end;
$$;

create or replace function public.gascars_admin_set_business_status(p_business_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('pending','active','suspended') then raise exception 'Invalid business status'; end if;
  update public.gascars_businesses
  set status=p_status,is_verified=(p_status='active'),updated_at=now()
  where id=p_business_id;
  if not found then raise exception 'Business not found'; end if;
  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.business_status',jsonb_build_object('business_id',p_business_id,'status',p_status));
end;
$$;

create or replace function public.gascars_admin_set_service_active(p_service_id uuid,p_active boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  update public.gascars_services set active=p_active where id=p_service_id;
  if not found then raise exception 'Service not found'; end if;
  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.service_active',jsonb_build_object('service_id',p_service_id,'active',p_active));
end;
$$;

create or replace function public.gascars_admin_set_user_role(p_user_id uuid,p_role text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  if p_role not in ('driver','business','admin') then raise exception 'Invalid role'; end if;
  if p_user_id=auth.uid() and p_role<>'admin' then raise exception 'You cannot remove your own admin role'; end if;
  update public.gascars_profiles set role=p_role,updated_at=now() where id=p_user_id;
  if not found then raise exception 'User profile not found'; end if;
  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.user_role',jsonb_build_object('user_id',p_user_id,'role',p_role));
end;
$$;

create or replace function public.gascars_admin_set_lead_status(p_lead_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','accepted','in_progress','completed','closed','cancelled','expired') then raise exception 'Invalid lead status'; end if;
  update public.gascars_leads set status=p_status,updated_at=now() where id=p_lead_id;
  if not found then raise exception 'Lead not found'; end if;
  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.lead_status',jsonb_build_object('lead_id',p_lead_id,'status',p_status));
end;
$$;

create or replace function public.gascars_admin_set_ticket_status(p_ticket_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.gascars_is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','resolved') then raise exception 'Invalid ticket status'; end if;
  update public.gascars_support_tickets set status=p_status where id=p_ticket_id;
  if not found then raise exception 'Support ticket not found'; end if;
  insert into public.gascars_audit(actor_id,action,detail)
  values(auth.uid(),'admin.ticket_status',jsonb_build_object('ticket_id',p_ticket_id,'status',p_status));
end;
$$;

revoke execute on function public.gascars_admin_dashboard() from public,anon;
revoke execute on function public.gascars_admin_list_users() from public,anon;
revoke execute on function public.gascars_admin_set_business_status(uuid,text) from public,anon;
revoke execute on function public.gascars_admin_set_service_active(uuid,boolean) from public,anon;
revoke execute on function public.gascars_admin_set_user_role(uuid,text) from public,anon;
revoke execute on function public.gascars_admin_set_lead_status(uuid,text) from public,anon;
revoke execute on function public.gascars_admin_set_ticket_status(uuid,text) from public,anon;

grant execute on function public.gascars_admin_dashboard() to authenticated;
grant execute on function public.gascars_admin_list_users() to authenticated;
grant execute on function public.gascars_admin_set_business_status(uuid,text) to authenticated;
grant execute on function public.gascars_admin_set_service_active(uuid,boolean) to authenticated;
grant execute on function public.gascars_admin_set_user_role(uuid,text) to authenticated;
grant execute on function public.gascars_admin_set_lead_status(uuid,text) to authenticated;
grant execute on function public.gascars_admin_set_ticket_status(uuid,text) to authenticated;
