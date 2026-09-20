create or replace function public.gascars_provider_public_stats(p_business_id uuid)
returns table (
  completed_jobs bigint,
  review_count bigint,
  average_rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.gascars_leads l
      where l.accepted_business_id = p_business_id
        and l.status = 'completed')::bigint as completed_jobs,
    (select count(*) from public.gascars_reviews r
      where r.business_id = p_business_id
        and r.is_visible = true)::bigint as review_count,
    (select round(avg(r.rating)::numeric, 1) from public.gascars_reviews r
      where r.business_id = p_business_id
        and r.is_visible = true) as average_rating;
$$;

revoke all on function public.gascars_provider_public_stats(uuid) from public;
grant execute on function public.gascars_provider_public_stats(uuid) to authenticated;
