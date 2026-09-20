create table if not exists public.gascars_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.gascars_leads(id) on delete cascade,
  business_id uuid not null references public.gascars_businesses(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(trim(comment)) <= 1000),
  reviewer_name text not null default 'Gas Car''s customer',
  service_name text,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gascars_reviews_business_created_idx
  on public.gascars_reviews(business_id,created_at desc)
  where is_visible=true;

create index if not exists gascars_reviews_customer_idx
  on public.gascars_reviews(customer_id,created_at desc);

alter table public.gascars_reviews enable row level security;

drop policy if exists "gascars published reviews select" on public.gascars_reviews;
create policy "gascars published reviews select"
on public.gascars_reviews
for select to authenticated
using (
  is_visible=true
  or customer_id=(select auth.uid())
  or public.gascars_is_admin()
);

revoke insert,update,delete on public.gascars_reviews from anon,authenticated;
grant select on public.gascars_reviews to authenticated;

create or replace function public.gascars_create_review(
  p_lead_id uuid,
  p_rating integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  l public.gascars_leads%rowtype;
  review_id uuid;
  reviewer text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;

  select * into l
  from public.gascars_leads
  where id=p_lead_id;

  if not found then raise exception 'Service request not found'; end if;
  if l.customer_id<>uid then raise exception 'This service request does not belong to you'; end if;
  if l.status<>'completed' then raise exception 'You can review a service only after it is completed'; end if;
  if l.accepted_business_id is null then raise exception 'This service has no provider to review'; end if;

  if exists(select 1 from public.gascars_reviews r where r.lead_id=l.id) then
    raise exception 'This service has already been reviewed';
  end if;

  select coalesce(nullif(split_part(trim(c.contact_name),' ',1),''),'Gas Car''s customer')
  into reviewer
  from public.gascars_lead_contacts c
  where c.lead_id=l.id;

  reviewer:=coalesce(reviewer,'Gas Car''s customer');

  insert into public.gascars_reviews(
    lead_id,business_id,customer_id,rating,comment,reviewer_name,service_name
  )
  values(
    l.id,l.accepted_business_id,uid,p_rating,
    nullif(trim(coalesce(p_comment,'')),''),reviewer,l.service
  )
  returning id into review_id;

  insert into public.gascars_audit(actor_id,action,detail)
  values(
    uid,
    'customer.review_created',
    jsonb_build_object(
      'review_id',review_id,
      'lead_id',l.id,
      'business_id',l.accepted_business_id,
      'rating',p_rating
    )
  );

  return review_id;
end;
$$;

revoke execute on function public.gascars_create_review(uuid,integer,text)
  from public,anon;

grant execute on function public.gascars_create_review(uuid,integer,text)
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='gascars_reviews'
  ) then
    alter publication supabase_realtime add table public.gascars_reviews;
  end if;
end $$;
