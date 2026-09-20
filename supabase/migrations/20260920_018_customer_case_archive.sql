alter table public.gascars_leads
  add column if not exists customer_archived_at timestamptz,
  add column if not exists customer_archive_reason text;

create index if not exists gascars_leads_customer_active_idx
  on public.gascars_leads(customer_id,created_at desc)
  where customer_archived_at is null;

create or replace function public.gascars_customer_set_case_archived(
  p_lead_id uuid,
  p_archived boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  l public.gascars_leads%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select * into l
  from public.gascars_leads
  where id=p_lead_id
  for update;

  if not found then
    raise exception 'Service request not found';
  end if;

  if l.customer_id<>uid then
    raise exception 'This service request does not belong to you';
  end if;

  update public.gascars_leads
  set customer_archived_at=case when p_archived then now() else null end,
      customer_archive_reason=case when p_archived then nullif(trim(coalesce(p_reason,'')),'') else null end,
      updated_at=now()
  where id=p_lead_id;

  insert into public.gascars_audit(actor_id,action,detail)
  values(
    uid,
    case when p_archived then 'customer.case_archived' else 'customer.case_restored' end,
    jsonb_build_object(
      'lead_id',p_lead_id,
      'reason',nullif(trim(coalesce(p_reason,'')),''),
      'operational_status',l.status
    )
  );
end;
$$;

revoke execute on function public.gascars_customer_set_case_archived(uuid,boolean,text)
  from public,anon;

grant execute on function public.gascars_customer_set_case_archived(uuid,boolean,text)
  to authenticated;
