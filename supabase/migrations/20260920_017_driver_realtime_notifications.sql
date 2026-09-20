-- Realtime in-app notifications for driver lead status and messages.

alter table public.gascars_notifications
  add column if not exists lead_id uuid references public.gascars_leads(id) on delete cascade,
  add column if not exists message_id uuid references public.gascars_lead_messages(id) on delete cascade,
  add column if not exists type text;

update public.gascars_notifications
set type=coalesce(type,'new_message')
where type is null;

alter table public.gascars_notifications
  alter column type set not null;

alter table public.gascars_notifications
  drop constraint if exists gascars_notifications_type_check;

alter table public.gascars_notifications
  add constraint gascars_notifications_type_check
  check (type in ('lead_accepted','job_started','job_completed','new_message'));

create index if not exists gascars_notifications_user_unread_idx
  on public.gascars_notifications(user_id,read_at,created_at desc);

create unique index if not exists gascars_notifications_message_unique
  on public.gascars_notifications(message_id)
  where message_id is not null;

alter table public.gascars_notifications enable row level security;

drop policy if exists "gascars notifications owner select" on public.gascars_notifications;
create policy "gascars notifications owner select"
on public.gascars_notifications
for select to authenticated
using (user_id=(select auth.uid()) or public.gascars_is_admin());

drop policy if exists "gascars notifications owner update" on public.gascars_notifications;
create policy "gascars notifications owner update"
on public.gascars_notifications
for update to authenticated
using (user_id=(select auth.uid()) or public.gascars_is_admin())
with check (user_id=(select auth.uid()) or public.gascars_is_admin());

revoke insert,delete on public.gascars_notifications from anon,authenticated;
grant select,update on public.gascars_notifications to authenticated;

create or replace function public.gascars_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.gascars_notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id and user_id=auth.uid();
end;
$$;

revoke execute on function public.gascars_mark_notification_read(uuid) from public,anon;
grant execute on function public.gascars_mark_notification_read(uuid) to authenticated;

create or replace function public.gascars_mark_lead_notifications_read(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  updated_count integer:=0;
begin
  update public.gascars_notifications
  set read_at=coalesce(read_at,now())
  where lead_id=p_lead_id and user_id=auth.uid() and read_at is null;

  get diagnostics updated_count=row_count;
  return updated_count;
end;
$$;

revoke execute on function public.gascars_mark_lead_notifications_read(uuid) from public,anon;
grant execute on function public.gascars_mark_lead_notifications_read(uuid) to authenticated;

create or replace function gascars_private.notify_customer_lead_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  business_name text;
  next_type text;
  next_title text;
  next_body text;
begin
  if new.accepted_business_id is not null then
    select b.name into business_name
    from public.gascars_businesses b
    where b.id=new.accepted_business_id;
  end if;

  if old.accepted_business_id is distinct from new.accepted_business_id
     and old.accepted_business_id is null
     and new.accepted_business_id is not null then
    next_type:='lead_accepted';
    next_title:='Your request was accepted';
    next_body:=coalesce(business_name,'A provider')||' accepted your request for '||coalesce(new.service,'service')||'.';
  elsif old.status is distinct from new.status and new.status='in_progress' then
    next_type:='job_started';
    next_title:='Work started';
    next_body:=coalesce(business_name,'Your provider')||' started work on '||coalesce(new.service,'your request')||'.';
  elsif old.status is distinct from new.status and new.status='completed' then
    next_type:='job_completed';
    next_title:='Job completed';
    next_body:=coalesce(business_name,'Your provider')||' marked '||coalesce(new.service,'your request')||' as completed.';
  else
    return new;
  end if;

  if not exists (
    select 1 from public.gascars_notifications n
    where n.user_id=new.customer_id and n.lead_id=new.id and n.type=next_type
  ) then
    insert into public.gascars_notifications(user_id,lead_id,type,title,body)
    values(new.customer_id,new.id,next_type,next_title,next_body);
  end if;

  return new;
end;
$$;

drop trigger if exists gascars_notify_customer_lead_status on public.gascars_leads;
create trigger gascars_notify_customer_lead_status
after update of accepted_business_id,status on public.gascars_leads
for each row execute function gascars_private.notify_customer_lead_status();

create or replace function gascars_private.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  sender_name text;
  l public.gascars_leads%rowtype;
begin
  select * into l from public.gascars_leads where id=new.lead_id;

  if new.sender_id=l.customer_id then
    select coalesce(nullif(trim(c.contact_name),''),'Customer')
    into sender_name
    from public.gascars_lead_contacts c
    where c.lead_id=new.lead_id;
  else
    select coalesce(b.name,'Provider')
    into sender_name
    from public.gascars_businesses b
    where b.id=l.accepted_business_id;
  end if;

  insert into public.gascars_notifications(user_id,lead_id,message_id,type,title,body)
  values(
    new.recipient_id,new.lead_id,new.id,'new_message',
    'New message from '||coalesce(sender_name,'Gas Car''s'),
    left(new.body,180)
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists gascars_notify_message_recipient on public.gascars_lead_messages;
create trigger gascars_notify_message_recipient
after insert on public.gascars_lead_messages
for each row execute function gascars_private.notify_message_recipient();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='gascars_notifications'
  ) then
    alter publication supabase_realtime add table public.gascars_notifications;
  end if;
end $$;
