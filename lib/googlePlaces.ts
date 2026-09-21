import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

export type AddressPlace = {
  placeId: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  postalCode: string | null;
};

type AutocompleteResponse = {
  suggestions?: AddressSuggestion[];
  error?: string;
};

type AddressDetailsResponse = {
  place?: {
    id?: string;
    formattedAddress?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
    addressComponents?: Array<{
      longText?: string;
      shortText?: string;
      types?: string[];
    }>;
  };
  error?: string;
};

function makeSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

const clientId = makeSessionId();

async function invokePlaces<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>('gascars-places', {
    body: { ...body, clientId },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload?.error) throw new Error(payload.error);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== 'Unexpected end of JSON input') {
          throw contextError;
        }
      }
    }
    throw new Error(error.message || 'Google Places request failed.');
  }

  return data as T;
}

export function isGooglePlacesConfigured() {
  return isSupabaseConfigured;
}

export async function searchGoogleAddresses(
  input: string,
  options?: {
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<AddressSuggestion[]> {
  const query = input.trim();
  if (!isSupabaseConfigured || query.length < 3) return [];

  const payload = await invokePlaces<AutocompleteResponse>({
    action: 'autocomplete',
    input: query,
    latitude: options?.latitude ?? null,
    longitude: options?.longitude ?? null,
  });

  if (payload.error) throw new Error(payload.error);
  return (payload.suggestions ?? []).slice(0, 5);
}

export async function loadGoogleAddress(placeId: string): Promise<AddressPlace> {
  if (!isSupabaseConfigured) throw new Error('Google address search is not configured.');

  const payload = await invokePlaces<AddressDetailsResponse>({
    action: 'address_details',
    placeId,
  });

  if (payload.error) throw new Error(payload.error);
  const place = payload.place;
  if (!place) throw new Error('Could not load this address.');

  const postalCode = place.addressComponents?.find((component) =>
    component.types?.includes('postal_code'),
  )?.longText ?? null;

  return {
    placeId: place.id ?? placeId,
    formattedAddress: place.formattedAddress ?? '',
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    postalCode,
  };
}
