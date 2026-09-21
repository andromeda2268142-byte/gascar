create index if not exists gascars_place_events_user_idx
  on public.gascars_place_events(user_id)
  where user_id is not null;

create or replace function public.gascars_place_event_quota_public(
  p_client_id uuid,
  p_event_count integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  client_key text := 'events:' || p_client_id::text;
  safe_count integer := greatest(1, least(coalesce(p_event_count, 1), 25));
begin
  if p_client_id is null then
    raise exception 'Client identifier required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gascars-place-event-quota', 0));

  if coalesce((
    select count from gascars_private.places_usage
    where day=today and account='events-global'
  ),0) + safe_count > 100000 then
    raise exception 'Daily analytics limit reached';
  end if;

  if coalesce((
    select count from gascars_private.places_usage
    where day=today and account=client_key
  ),0) + safe_count > 2000 then
    raise exception 'Daily client analytics limit reached';
  end if;

  insert into gascars_private.places_usage(day,account,count)
  values(today,'events-global',safe_count),(today,client_key,safe_count)
  on conflict(day,account)
  do update set count=gascars_private.places_usage.count + excluded.count;

  delete from gascars_private.places_usage where day<today-7;
end;
$$;

revoke all on function public.gascars_place_event_quota_public(uuid,integer)
from public, anon, authenticated;
grant execute on function public.gascars_place_event_quota_public(uuid,integer)
to service_role;
