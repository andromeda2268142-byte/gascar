import { getSupabaseClient } from '@/lib/supabase';

export type ProviderBusinessType = 'mechanic' | 'towing' | 'parts';
export type ProviderBusinessStatus = 'pending' | 'active' | 'suspended';

export type ProviderBusiness = {
  id: string;
  owner_id: string;
  business_type: ProviderBusinessType;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  service_zips: string[] | null;
  status: ProviderBusinessStatus;
  is_verified: boolean;
};

export async function loadOwnedProviderBusiness(userId: string): Promise<ProviderBusiness | null> {
  const { data, error } = await getSupabaseClient()
    .from('gascars_businesses')
    .select('id,owner_id,business_type,name,phone,email,address,city,state,zip,service_zips,status,is_verified')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ProviderBusiness | null;
}

export function providerTypeLabel(type: ProviderBusinessType) {
  if (type === 'mechanic') return 'Mechanic';
  if (type === 'towing') return 'Towing';
  return 'Auto Parts';
}

export function providerCategory(type: ProviderBusinessType): 'repair' | 'towing' | null {
  if (type === 'mechanic') return 'repair';
  if (type === 'towing') return 'towing';
  return null;
}

export function serviceModeLabel(value: 'shop' | 'mobile' | 'both' | 'either') {
  if (value === 'shop') return 'Shop';
  if (value === 'mobile') return 'Mobile';
  if (value === 'both') return 'Shop + Mobile';
  return 'Either';
}
