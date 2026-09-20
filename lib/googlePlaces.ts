import { Platform } from 'react-native';

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

function apiKey() {
  const placesKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
  const webServiceKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;

  if (placesKey || webServiceKey) return placesKey || webServiceKey || '';

  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || '';
  }

  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '';
  }

  return '';
}

export function isGooglePlacesConfigured() {
  return Boolean(apiKey());
}

export async function searchGoogleAddresses(
  input: string,
  options?: {
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<AddressSuggestion[]> {
  const key = apiKey();
  const query = input.trim();

  if (!key || query.length < 3) return [];

  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ['us'],
  };

  if (
    typeof options?.latitude === 'number'
    && typeof options?.longitude === 'number'
  ) {
    body.locationBias = {
      circle: {
        center: {
          latitude: options.latitude,
          longitude: options.longitude,
        },
        radius: 50000,
      },
    };
  }

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': [
        'suggestions.placePrediction.placeId',
        'suggestions.placePrediction.text.text',
        'suggestions.placePrediction.structuredFormat.mainText.text',
        'suggestions.placePrediction.structuredFormat.secondaryText.text',
      ].join(','),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Google address search is unavailable right now.');
  }

  const payload = await response.json() as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  return (payload.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
    .slice(0, 5)
    .map((prediction) => ({
      placeId: prediction.placeId ?? '',
      text: prediction.text?.text ?? '',
      mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export async function loadGoogleAddress(placeId: string): Promise<AddressPlace> {
  const key = apiKey();
  if (!key) throw new Error('Google address search is not configured.');

  const response = await fetch(
    'https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId),
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
      },
    },
  );

  if (!response.ok) {
    throw new Error('Could not load this address.');
  }

  const place = await response.json() as {
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
