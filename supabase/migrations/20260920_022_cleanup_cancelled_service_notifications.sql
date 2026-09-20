create or replace function public.gascars_customer_cancel_lead(
  p_lead_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  l public.gascars_leads%rowtype;
  provider_balance integer;
  refunded integer:=0;
  refund_request_id uuid:=gen_random_uuid();
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select * into l
  from public.gascars_leads
  where id=p_lead_id
  for update;

  if not found then raise exception 'Service request not found'; end if;
  if l.customer_id<>uid then raise exception 'This service request does not belong to you'; end if;

  if l.status='cancelled' then
    return jsonb_build_object('ok',true,'already_cancelled',true,'lead_id',l.id,'refunded_credits',0);
  end if;

  if l.status in ('completed','closed','expired') then
    raise exception 'This service request can no longer be cancelled';
  end if;

  if l.status not in ('open','accepted','in_progress') then
    raise exception 'This service request cannot be cancelled from its current status';
  end if;

  if l.status='accepted' and l.accepted_business_id is not null then
    if not exists (
      select 1
      from public.gascars_wallet_ledger wl
      where wl.lead_id=l.id
        and wl.business_id=l.accepted_business_id
        and wl.kind='refund'
        and wl.reason='Customer cancelled before work started'
    ) then
      insert into public.gascars_wallets(business_id,balance)
      values(l.accepted_business_id,0)
      on conflict (business_id) do nothing;

      update public.gascars_wallets
      set balance=balance+l.credit_cost,
          updated_at=now()
      where business_id=l.accepted_business_id
      returning balance into provider_balance;

      refunded:=l.credit_cost;

      insert into public.gascars_wallet_ledger(
        business_id,delta,balance_after,kind,reason,lead_id,actor_id,request_id
      )
      values(
        l.accepted_business_id,l.credit_cost,provider_balance,'refund',
        'Customer cancelled before work started',l.id,uid,refund_request_id
      );
    end if;
  end if;

  update public.gascars_leads
  set status='cancelled',
      cancelled_at=now(),
      cancelled_by=uid,
      cancellation_reason=nullif(trim(coalesce(p_reason,'')),''),
      customer_archived_at=null,
      customer_archive_reason=null,
      updated_at=now()
  where id=l.id;

  update public.gascars_notifications
  set read_at=coalesce(read_at,now())
  where user_id=uid
    and lead_id=l.id
    and read_at is null;

  update public.gascars_email_outbox
  set status='cancelled',
      last_error='Service request was cancelled'
  where lead_id=l.id
    and status='pending'
    and notification_type in ('first_message','unread_message_reminder');

  insert into public.gascars_audit(actor_id,action,detail)
  values(
    uid,
    'customer.cancel_lead',
    jsonb_build_object(
      'lead_id',l.id,
      'previous_status',l.status,
      'business_id',l.accepted_business_id,
      'refunded_credits',refunded,
      'reason',nullif(trim(coalesce(p_reason,'')),'')
    )
  );

  return jsonb_build_object(
    'ok',true,
    'already_cancelled',false,
    'lead_id',l.id,
    'refunded_credits',refunded
  );
end;
$$;

revoke execute on function public.gascars_customer_cancel_lead(uuid,text)
  from public,anon;

grant execute on function public.gascars_customer_cancel_lead(uuid,text)
  to authenticated;
