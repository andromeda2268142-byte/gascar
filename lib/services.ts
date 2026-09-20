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
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previousPrevious = Array.from({ length: b.length + 1 }, (_, index) => index);
  let previous = [...previousPrevious];

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      let best = Math.min(substitution, insertion, deletion);

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        best = Math.min(best, previousPrevious[j - 2] + 1);
      }

      current[j] = best;
    }

    previousPrevious = previous;
    previous = current;
  }

  return previous[b.length];
}

function tokenScore(queryToken: string, candidate: string) {
  if (!queryToken || !candidate) return 0;
  if (candidate === queryToken) return 12;
  if (candidate.startsWith(queryToken) || queryToken.startsWith(candidate)) return 9;
  if (queryToken.length >= 3 && candidate.includes(queryToken)) return 7;

  const allowedDistance =
    queryToken.length >= 5 ? 2 :
    queryToken.length >= 4 ? 1 :
    0;

  if (!allowedDistance || Math.abs(candidate.length - queryToken.length) > allowedDistance) {
    return 0;
  }

  const distance = editDistance(queryToken, candidate);
  if (distance <= allowedDistance) return distance === 1 ? 8 : 5;

  return 0;
}

export function filterServices(items: ServiceCatalogItem[], query: string) {
  const needle = normalize(query);

  // Blank search intentionally shows no catalog. Results appear as the customer types.
  if (needle.length < 2) return [];

  const tokens = needle.split(/\s+/).filter(Boolean);

  return items
    .map((item) => {
      const name = normalize(item.name);
      const group = normalize(item.group_name ?? '');
      const description = normalize(item.description ?? '');
      const keywords = (item.keywords ?? []).map(normalize);

      const candidateTokens = Array.from(
        new Set(
          [
            ...name.split(/\s+/),
            ...group.split(/\s+/),
            ...description.split(/\s+/),
            ...keywords.flatMap((keyword) => keyword.split(/\s+/)),
          ].filter(Boolean),
        ),
      );

      let score = 0;
      let matchedTokens = 0;

      for (const token of tokens) {
        let best = 0;
        for (const candidate of candidateTokens) {
          best = Math.max(best, tokenScore(token, candidate));
        }

        if (best > 0) {
          matchedTokens += 1;
          score += best;
        }
      }

      if (name === needle) score += 30;
      else if (name.startsWith(needle)) score += 18;
      else if (name.includes(needle)) score += 12;

      if (keywords.some((keyword) => keyword === needle)) score += 18;
      if (matchedTokens === tokens.length) score += 8;

      return { item, score, matchedTokens };
    })
    .filter((entry) => entry.matchedTokens === tokens.length && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.sort_order - b.item.sort_order)
    .map((entry) => entry.item);
}
