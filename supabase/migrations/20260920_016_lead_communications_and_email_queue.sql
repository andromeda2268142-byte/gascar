-- Provider/customer communication foundation.

alter table public.gascars_lead_contacts
  add column if not exists preferred_contact_method text not null default 'app';

alter table public.gascars_lead_contacts
  drop constraint if exists gascars_lead_contacts_preferred_contact_method_check;

alter table public.gascars_lead_contacts
  add constraint gascars_lead_contacts_preferred_contact_method_check
  check (preferred_contact_method in ('app','phone','email'));

create table if not exists public.gascars_lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.gascars_leads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists gascars_lead_messages_lead_created_idx
  on public.gascars_lead_messages(lead_id,created_at asc);

alter table public.gascars_lead_messages enable row level security;

drop policy if exists "gascars messages participants select" on public.gascars_lead_messages;
create policy "gascars messages participants select"
on public.gascars_lead_messages
for select to authenticated
using (
  sender_id=(select auth.uid())
  or recipient_id=(select auth.uid())
  or public.gascars_is_admin()
);

revoke insert,update,delete on public.gascars_lead_messages from anon,authenticated;
grant select on public.gascars_lead_messages to authenticated;

create table if not exists public.gascars_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient_email text not null,
  recipient_name text,
  notification_type text not null,
  lead_id uuid references public.gascars_leads(id) on delete cascade,
  message_id uuid references public.gascars_lead_messages(id) on delete cascade,
  subject text not null,
  body_text text not null,
  not_before timestamptz not null default now(),
  condition text not null default 'always' check (condition in ('always','message_unread')),
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gascars_email_outbox_pending_idx
  on public.gascars_email_outbox(status,not_before)
  where status='pending';

alter table public.gascars_email_outbox enable row level security;

drop policy if exists "gascars admin email outbox select" on public.gascars_email_outbox;
create policy "gascars admin email outbox select"
on public.gascars_email_outbox
for select to authenticated
using (public.gascars_is_admin());

revoke insert,update,delete on public.gascars_email_outbox from anon,authenticated;
grant select on public.gascars_email_outbox to authenticated;

create or replace function public.gascars_create_lead_v3(
  p_category text,
  p_service_id uuid,
  p_service_location text,
  p_issue_description text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_preferred_contact_method text default 'app',
  p_vehicle_id uuid default null,
  p_preferred_time text default null,
  p_zip text default null,
  p_pickup_address text default null,
  p_destination_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
set search_path=''
as $$
declare
  new_lead_id uuid;
  current_user_id uuid := auth.uid();
  selected_service_name text;
  selected_service_category text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_category not in ('repair','towing') then raise exception 'Invalid lead category'; end if;
  if p_service_location not in ('shop','mobile','either') then raise exception 'Invalid service location preference'; end if;
  if p_preferred_contact_method not in ('app','phone','email') then raise exception 'Invalid preferred contact method'; end if;

  select s.name,s.category into selected_service_name,selected_service_category
  from public.gascars_services s
  where s.id=p_service_id and s.active=true;

  if selected_service_name is null then raise exception 'Please select a valid service'; end if;
  if selected_service_category<>p_category then raise exception 'Selected service does not match request category'; end if;
  if p_category='towing' and p_service_location<>'mobile' then
    raise exception 'Roadside and towing services must be performed at the vehicle location';
  end if;
  if length(trim(coalesce(p_issue_description,'')))<5 then raise exception 'Issue description is required'; end if;
  if p_preferred_contact_method='phone' and nullif(trim(coalesce(p_contact_phone,'')),'') is null then
    raise exception 'Phone number is required when Phone is the preferred contact method';
  end if;
  if p_preferred_contact_method='email' and nullif(trim(coalesce(p_contact_email,'')),'') is null then
    raise exception 'Email is required when Email is the preferred contact method';
  end if;

  insert into public.gascars_leads(
    customer_id,vehicle_id,category,service,service_id,service_location,
    issue_description,preferred_time,zip,pickup_address,destination_address,
    latitude,longitude
  )
  values(
    current_user_id,p_vehicle_id,p_category,selected_service_name,p_service_id,p_service_location,
    trim(p_issue_description),nullif(trim(p_preferred_time),''),
    nullif(trim(p_zip),''),nullif(trim(p_pickup_address),''),
    nullif(trim(p_destination_address),''),p_latitude,p_longitude
  )
  returning id into new_lead_id;

  insert into public.gascars_lead_contacts(
    lead_id,contact_name,contact_phone,contact_email,pickup_address,
    destination_address,latitude,longitude,preferred_contact_method
  )
  values(
    new_lead_id,nullif(trim(p_contact_name),''),nullif(trim(p_contact_phone),''),
    nullif(trim(p_contact_email),''),nullif(trim(p_pickup_address),''),
    nullif(trim(p_destination_address),''),p_latitude,p_longitude,p_preferred_contact_method
  );

  return new_lead_id;
end;
$$;

grant execute on function public.gascars_create_lead_v3(
  text,uuid,text,text,text,text,text,text,uuid,text,text,text,text,double precision,double precision
) to authenticated;

create or replace function public.gascars_send_lead_message(p_lead_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  l public.gascars_leads%rowtype;
  provider_owner_id uuid;
  recipient uuid;
  new_message_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_body,'')))<1 then raise exception 'Message cannot be empty'; end if;
  if char_length(trim(p_body))>2000 then raise exception 'Message is too long'; end if;

  select * into l from public.gascars_leads where id=p_lead_id;
  if not found then raise exception 'Lead not found'; end if;
  if l.accepted_business_id is null then raise exception 'Messaging starts after a provider accepts the lead'; end if;
  if l.status not in ('accepted','in_progress','completed') then
    raise exception 'This conversation is not available for the current lead status';
  end if;

  select b.owner_id into provider_owner_id
  from public.gascars_businesses b
  where b.id=l.accepted_business_id;

  if uid=l.customer_id then recipient:=provider_owner_id;
  elsif uid=provider_owner_id then recipient:=l.customer_id;
  else raise exception 'You are not a participant in this lead';
  end if;

  insert into public.gascars_lead_messages(lead_id,sender_id,recipient_id,body)
  values(p_lead_id,uid,recipient,trim(p_body))
  returning id into new_message_id;

  return new_message_id;
end;
$$;

revoke execute on function public.gascars_send_lead_message(uuid,text) from public,anon;
grant execute on function public.gascars_send_lead_message(uuid,text) to authenticated;

create or replace function public.gascars_mark_lead_messages_seen(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  updated_count integer:=0;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  update public.gascars_lead_messages
  set seen_at=now()
  where lead_id=p_lead_id and recipient_id=uid and seen_at is null;

  get diagnostics updated_count=row_count;

  update public.gascars_email_outbox o
  set status='cancelled',last_error='Message was read in app before reminder email was due'
  where o.message_id in (
    select m.id from public.gascars_lead_messages m
    where m.lead_id=p_lead_id and m.recipient_id=uid and m.seen_at is not null
  )
  and o.status='pending' and o.condition='message_unread';

  return updated_count;
end;
$$;

revoke execute on function public.gascars_mark_lead_messages_seen(uuid) from public,anon;
grant execute on function public.gascars_mark_lead_messages_seen(uuid) to authenticated;

create or replace function gascars_private.queue_new_lead_provider_emails()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  recipient record;
begin
  for recipient in
    select b.id business_id,b.name business_name,coalesce(nullif(trim(b.email),''),u.email) email
    from public.gascars_businesses b
    join auth.users u on u.id=b.owner_id
    join public.gascars_business_services bs
      on bs.business_id=b.id and bs.service_id=new.service_id and bs.active=true
    where b.status='active' and b.is_verified=true
      and coalesce(nullif(trim(coalesce(b.email,'')),''),u.email) is not null
      and ((new.category='repair' and b.business_type='mechanic') or (new.category='towing' and b.business_type='towing'))
      and (new.zip=b.zip or new.zip=any(coalesce(b.service_zips,array[]::text[])))
      and (new.service_location='either' or bs.service_mode='both' or bs.service_mode=new.service_location)
  loop
    insert into public.gascars_email_outbox(
      event_key,recipient_email,recipient_name,notification_type,lead_id,subject,body_text
    )
    values(
      'lead:'||new.id::text||':business:'||recipient.business_id::text,
      recipient.email,recipient.business_name,'new_matched_lead',new.id,
      'New matched lead: '||coalesce(new.service,'Service request'),
      'A new Gas Car''s lead matches your services. Service: '||coalesce(new.service,'Service request')||
      '. ZIP: '||coalesce(new.zip,'not provided')||'. Work mode: '||coalesce(new.service_location,'either')||
      '. Open your Provider Portal to review it.'
    )
    on conflict(event_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists gascars_queue_new_lead_provider_emails on public.gascars_leads;
create trigger gascars_queue_new_lead_provider_emails
after insert on public.gascars_leads
for each row execute function gascars_private.queue_new_lead_provider_emails();

create or replace function gascars_private.queue_lead_accepted_email()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  email_to text;
  customer_name text;
  business_name text;
begin
  if new.accepted_business_id is null
     or new.status not in ('accepted','in_progress','completed')
     or (old.accepted_business_id is not null and old.accepted_business_id=new.accepted_business_id) then
    return new;
  end if;

  select coalesce(nullif(trim(c.contact_email),''),u.email),coalesce(nullif(trim(c.contact_name),''),'Customer')
  into email_to,customer_name
  from auth.users u
  left join public.gascars_lead_contacts c on c.lead_id=new.id
  where u.id=new.customer_id
  limit 1;

  select b.name into business_name from public.gascars_businesses b where b.id=new.accepted_business_id;

  if email_to is not null then
    insert into public.gascars_email_outbox(
      event_key,recipient_email,recipient_name,notification_type,lead_id,subject,body_text
    )
    values(
      'accepted:'||new.id::text,email_to,customer_name,'lead_accepted',new.id,
      'Your Gas Car''s request was accepted',
      coalesce(business_name,'A provider')||' accepted your request for '||coalesce(new.service,'service')||
      '. Open Gas Car''s to see the job status and message the provider.'
    )
    on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists gascars_queue_lead_accepted_email on public.gascars_leads;
create trigger gascars_queue_lead_accepted_email
after update of accepted_business_id,status on public.gascars_leads
for each row execute function gascars_private.queue_lead_accepted_email();

create or replace function gascars_private.queue_message_email()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  l public.gascars_leads%rowtype;
  email_to text;
  recipient_name text;
  sender_name text;
  is_first boolean;
  reminder_already_queued boolean:=false;
  due_at timestamptz;
  last_seen_at timestamptz;
begin
  select * into l from public.gascars_leads where id=new.lead_id;

  select not exists(
    select 1 from public.gascars_lead_messages m
    where m.lead_id=new.lead_id and m.recipient_id=new.recipient_id and m.id<>new.id
  ) into is_first;

  select max(m.seen_at) into last_seen_at
  from public.gascars_lead_messages m
  where m.lead_id=new.lead_id and m.recipient_id=new.recipient_id and m.seen_at is not null;

  if not is_first then
    select exists(
      select 1
      from public.gascars_email_outbox o
      join public.gascars_lead_messages m on m.id=o.message_id
      where o.lead_id=new.lead_id
        and o.notification_type='unread_message_reminder'
        and o.status in ('pending','sent')
        and m.recipient_id=new.recipient_id
        and (last_seen_at is null or m.created_at>last_seen_at)
    ) into reminder_already_queued;
    if reminder_already_queued then return new; end if;
  end if;

  if new.recipient_id=l.customer_id then
    select coalesce(nullif(trim(c.contact_email),''),u.email),coalesce(nullif(trim(c.contact_name),''),'Customer')
    into email_to,recipient_name
    from auth.users u
    left join public.gascars_lead_contacts c on c.lead_id=l.id
    where u.id=l.customer_id
    limit 1;

    select coalesce(b.name,'Provider') into sender_name
    from public.gascars_businesses b where b.id=l.accepted_business_id;
  else
    select coalesce(nullif(trim(b.email),''),u.email),b.name
    into email_to,recipient_name
    from public.gascars_businesses b
    join auth.users u on u.id=b.owner_id
    where b.id=l.accepted_business_id and b.owner_id=new.recipient_id;

    select coalesce(nullif(trim(c.contact_name),''),'Customer') into sender_name
    from public.gascars_lead_contacts c where c.lead_id=l.id;
  end if;

  if email_to is null then return new; end if;

  due_at:=case when is_first then now() else now()+interval '2 hours' end;

  insert into public.gascars_email_outbox(
    event_key,recipient_email,recipient_name,notification_type,lead_id,message_id,
    subject,body_text,not_before,condition
  )
  values(
    case when is_first
      then 'message:first:'||new.id::text
      else 'message:unread:'||new.lead_id::text||':'||new.recipient_id::text||':'||new.id::text
    end,
    email_to,recipient_name,
    case when is_first then 'first_message' else 'unread_message_reminder' end,
    new.lead_id,new.id,
    case when is_first then 'New message in Gas Car''s' else 'Unread message in Gas Car''s' end,
    coalesce(sender_name,'Someone')||' sent you a message about '||coalesce(l.service,'your service request')||
      '. Open Gas Car''s to read and reply.',
    due_at,'message_unread'
  )
  on conflict(event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists gascars_queue_message_email on public.gascars_lead_messages;
create trigger gascars_queue_message_email
after insert on public.gascars_lead_messages
for each row execute function gascars_private.queue_message_email();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='gascars_lead_messages'
  ) then
    alter publication supabase_realtime add table public.gascars_lead_messages;
  end if;
end $$;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists(select 1 from cron.job where jobname='gascars-email-worker-every-5-min') then
    perform cron.unschedule('gascars-email-worker-every-5-min');
  end if;

  perform cron.schedule(
    'gascars-email-worker-every-5-min',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://wrnlhjujsbigculndivs.supabase.co/functions/v1/gascars-email-worker',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$
  );
end $$;
