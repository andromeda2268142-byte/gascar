import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export type AutomotiveCategory = 'gas' | 'mechanic' | 'towing' | 'parts';
export type PlaceEventType = 'impression' | 'view' | 'directions' | 'call' | 'website' | 'service_request';

export type FuelPrice = {
  type: string;
  currencyCode: string | null;
  units: string;
  nanos: number;
  updateTime: string | null;
};

export type AutomotivePlace = {
  id: string;
  name: string;
  category: AutomotiveCategory;
  latitude: number;
  longitude: number;
  address: string;
  googleMapsUri: string | null;
  primaryType: string | null;
  phone: string | null;
  openNow: boolean | null;
  rating: number | null;
  userRatingCount: number | null;
  websiteUri: string | null;
  fuelPrices: FuelPrice[];
  distanceMiles: number;
};

type PlacesResponse = {
  places?: Array<Omit<AutomotivePlace, 'distanceMiles'>>;
  configured?: boolean;
  error?: string;
  code?: string;
};

function makeSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

const sessionId = makeSessionId();

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthMiles = 3958.7613;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function searchAutomotivePlaces(options: {
  latitude: number;
  longitude: number;
  category: AutomotiveCategory;
  radius?: 3000 | 8000 | 15000 | 25000;
}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await getSupabaseClient().functions.invoke<PlacesResponse>('gascars-places', {
    body: {
      action: 'search',
      clientId: sessionId,
      latitude: options.latitude,
      longitude: options.longitude,
      category: options.category,
      radius: options.radius ?? 8000,
    },
  });

  if (error) throw new Error(error.message || 'Nearby search failed.');
  if (data?.error) throw new Error(data.error);

  return (data?.places ?? []).map((place) => ({
    ...place,
    distanceMiles: distanceMiles(
      options.latitude,
      options.longitude,
      place.latitude,
      place.longitude,
    ),
  })) as AutomotivePlace[];
}

export function trackPlaceEvents(
  category: AutomotiveCategory,
  eventType: PlaceEventType,
  placeIds: string[],
) {
  if (!isSupabaseConfigured || !placeIds.length) return;

  void getSupabaseClient().functions.invoke('gascars-places', {
    body: {
      action: 'track',
      clientId: sessionId,
      category,
      eventType,
      placeIds: placeIds.slice(0, 25),
    },
  }).catch(() => undefined);
}

export function fuelPrice(place: AutomotivePlace, type: string) {
  const item = place.fuelPrices.find((price) => price.type === type);
  if (!item) return null;
  return Number(item.units || 0) + Number(item.nanos || 0) / 1_000_000_000;
}

export function latestFuelUpdate(place: AutomotivePlace) {
  const timestamps = place.fuelPrices
    .map((price) => price.updateTime ? Date.parse(price.updateTime) : NaN)
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

export function formatDistance(miles: number) {
  if (!Number.isFinite(miles)) return '';
  return miles < 0.1 ? '<0.1 mi' : miles.toFixed(miles < 10 ? 1 : 0) + ' mi';
}

export function formatPrice(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? '$' + value.toFixed(2) : '—';
}

export function formatUpdated(date: Date | null) {
  if (!date) return null;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + ' hr ago';
  return Math.round(hours / 24) + ' d ago';
}
