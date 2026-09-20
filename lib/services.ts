import { getSupabaseClient } from '@/lib/supabase';

export type ServiceCategory = 'repair' | 'towing';
export type ServiceLocation = 'shop' | 'mobile' | 'either';
export type BusinessServiceMode = 'shop' | 'mobile' | 'both';

export type ServiceCatalogItem = {
  id: string;
  slug: string;
  name: string;
  category: ServiceCategory;
  group_name: string | null;
  description: string | null;
  keywords: string[];
  sort_order: number;
};

export async function loadServiceCatalog(category?: ServiceCategory): Promise<ServiceCatalogItem[]> {
  let query = getSupabaseClient()
    .from('gascars_services')
    .select('id, slug, name, category, group_name, description, keywords, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ServiceCatalogItem[];
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function filterServices(items: ServiceCatalogItem[], query: string) {
  const needle = normalize(query);
  if (!needle) return items;

  const tokens = needle.split(/\s+/).filter(Boolean);

  return items
    .map((item) => {
      const haystack = [
        item.name,
        item.group_name ?? '',
        item.description ?? '',
        ...(item.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();

      const allTokensMatch = tokens.every((token) => haystack.includes(token));
      const nameStarts = item.name.toLowerCase().startsWith(needle);
      const nameIncludes = item.name.toLowerCase().includes(needle);
      const keywordStarts = (item.keywords ?? []).some((keyword) =>
        keyword.toLowerCase().startsWith(needle),
      );

      let score = 0;
      if (nameStarts) score += 10;
      if (nameIncludes) score += 7;
      if (keywordStarts) score += 5;
      if (allTokensMatch) score += 3;

      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.sort_order - b.item.sort_order)
    .map((entry) => entry.item);
}
