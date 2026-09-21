import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Category = 'gas' | 'mechanic' | 'towing' | 'parts';
type EventType = 'impression' | 'view' | 'directions' | 'call' | 'website' | 'service_request';

const categories: Category[] = ['gas', 'mechanic', 'towing', 'parts'];
const eventTypes: EventType[] = ['impression', 'view', 'directions', 'call', 'website', 'service_request'];
const allowedRadii = [3000, 8000, 15000, 25000];

function serviceKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}') as Record<string, string>;
    return keys.default || '';
  } catch { return ''; }
}

function publicKey() {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}') as Record<string, string>;
    return keys.default || '';
  } catch { return ''; }
}

async function optionalUserId(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const key = publicKey();
  if (!url || !key) return null;

  try {
    const client = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser();
    if (!data.user || data.user.is_anonymous) return null;
    return data.user.id;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);

  try {
    const rawBody = await req.text();
    if (rawBody.length > 8000) return reply({ error: 'Request too large.' }, 413);

    const body = JSON.parse(rawBody || '{}') as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'search';

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const secret = serviceKey();
    if (!supabaseUrl || !secret) return reply({ error: 'Server configuration is incomplete.' }, 503);

    const admin = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === 'track') {
      const clientId = typeof body.clientId === 'string' ? body.clientId : '';
      const category = body.category as Category;
      const eventType = body.eventType as EventType;
      const placeIds = Array.isArray(body.placeIds)
        ? body.placeIds.filter((value): value is string => typeof value === 'string').slice(0, 25)
        : [];

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)
        || !categories.includes(category) || !eventTypes.includes(eventType) || !placeIds.length) {
        return reply({ error: 'Invalid analytics event.' }, 400);
      }

      const analyticsQuota = await admin.rpc('gascars_place_event_quota_public', {
        p_client_id: clientId,
        p_event_count: placeIds.length,
      });
      if (analyticsQuota.error) {
        const message = analyticsQuota.error.message || '';
        return reply(
          { error: message.toLowerCase().includes('limit') ? 'Analytics limit reached.' : 'Could not authorize analytics event.' },
          message.toLowerCase().includes('limit') ? 429 : 500,
        );
      }

      const userId = await optionalUserId(req);
      const { data, error } = await admin.rpc('gascars_track_place_events', {
        p_user_id: userId,
        p_session_id: clientId,
        p_place_ids: placeIds,
        p_category: category,
        p_event_type: eventType,
      });

      if (error) return reply({ error: 'Could not record analytics event.' }, 500);
      return reply({ tracked: data ?? 0 });
    }

    const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!googleKey) {
      return reply({
        error: 'Google Places is ready in the app but the production API key has not been connected yet.',
        code: 'GOOGLE_NOT_CONFIGURED',
      }, 503);
    }

    if (action === 'autocomplete') {
      const input = typeof body.input === 'string' ? body.input.trim() : '';
      const clientId = typeof body.clientId === 'string' ? body.clientId : '';
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);

      if (
        input.length < 3
        || input.length > 180
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)
      ) {
        return reply({ error: 'Invalid address search.' }, 400);
      }

      const quota = await admin.rpc('gascars_places_quota_public', { p_client_id: clientId });
      if (quota.error) {
        const message = quota.error.message || '';
        return reply({
          error: message.toLowerCase().includes('limit')
            ? 'Address search limit reached for today.'
            : 'Could not authorize this address search.',
        }, message.toLowerCase().includes('limit') ? 429 : 500);
      }

      const googleBody: Record<string, unknown> = {
        input,
        includedRegionCodes: ['us'],
      };

      if (
        Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90
        && Math.abs(longitude) <= 180
      ) {
        googleBody.locationBias = {
          circle: {
            center: { latitude, longitude },
            radius: 50000,
          },
        };
      }

      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': [
            'suggestions.placePrediction.placeId',
            'suggestions.placePrediction.text.text',
            'suggestions.placePrediction.structuredFormat.mainText.text',
            'suggestions.placePrediction.structuredFormat.secondaryText.text',
          ].join(','),
        },
        body: JSON.stringify(googleBody),
      });

      if (!response.ok) {
        const diagnostic = await response.text();
        console.error('Google autocomplete error', response.status, diagnostic.slice(0, 500));
        return reply({ error: 'Google address search is unavailable right now.' }, 502);
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

      const suggestions = (payload.suggestions || [])
        .map((suggestion) => suggestion.placePrediction)
        .filter((prediction) => Boolean(prediction?.placeId))
        .slice(0, 5)
        .map((prediction) => ({
          placeId: prediction?.placeId || '',
          text: prediction?.text?.text || '',
          mainText: prediction?.structuredFormat?.mainText?.text || prediction?.text?.text || '',
          secondaryText: prediction?.structuredFormat?.secondaryText?.text || '',
        }));

      return reply({ suggestions });
    }

    if (action === 'address_details') {
      const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
      const clientId = typeof body.clientId === 'string' ? body.clientId : '';

      if (
        placeId.length < 3
        || placeId.length > 255
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)
      ) {
        return reply({ error: 'Invalid address selection.' }, 400);
      }

      const quota = await admin.rpc('gascars_places_quota_public', { p_client_id: clientId });
      if (quota.error) {
        const message = quota.error.message || '';
        return reply({
          error: message.toLowerCase().includes('limit')
            ? 'Address search limit reached for today.'
            : 'Could not authorize this address selection.',
        }, message.toLowerCase().includes('limit') ? 429 : 500);
      }

      const response = await fetch(
        'https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId),
        {
          signal: AbortSignal.timeout(10000),
          headers: {
            'X-Goog-Api-Key': googleKey,
            'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
          },
        },
      );

      if (!response.ok) {
        const diagnostic = await response.text();
        console.error('Google place details error', response.status, diagnostic.slice(0, 500));
        return reply({ error: 'Could not load this address.' }, 502);
      }

      const place = await response.json();
      return reply({ place });
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const category = body.category as Category;
    const radius = Number(body.radius ?? 8000);
    const clientId = typeof body.clientId === 'string' ? body.clientId : '';

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
      || !categories.includes(category) || !allowedRadii.includes(radius)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
      return reply({ error: 'Invalid search area or category.' }, 400);
    }

    const quota = await admin.rpc('gascars_places_quota_public', { p_client_id: clientId });
    if (quota.error) {
      const message = quota.error.message || '';
      return reply({
        error: message.toLowerCase().includes('limit')
          ? 'Search limit reached for today. Try again later.'
          : 'Could not authorize this map search.',
      }, message.toLowerCase().includes('limit') ? 429 : 500);
    }

    const fields = [
      'places.id','places.displayName','places.location','places.formattedAddress',
      'places.googleMapsUri','places.primaryType','places.nationalPhoneNumber',
      'places.currentOpeningHours','places.rating','places.userRatingCount','places.websiteUri',
      ...(category === 'gas' ? ['places.fuelOptions'] : []),
    ];

    let endpoint = 'https://places.googleapis.com/v1/places:searchNearby';
    let googleBody: Record<string, unknown>;

    if (category === 'towing') {
      endpoint = 'https://places.googleapis.com/v1/places:searchText';
      googleBody = {
        textQuery: 'towing service',
        pageSize: 20,
        rankPreference: 'DISTANCE',
        languageCode: 'en',
        regionCode: 'US',
        locationBias: { circle: { center: { latitude, longitude }, radius } },
      };
    } else {
      const includedTypes = category === 'gas'
        ? ['gas_station']
        : category === 'mechanic'
          ? ['car_repair']
          : ['auto_parts_store', 'tire_shop'];

      googleBody = {
        includedTypes,
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        languageCode: 'en',
        regionCode: 'US',
        locationRestriction: { circle: { center: { latitude, longitude }, radius } },
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(12000),
      headers: {
        'Content-Type':'application/json',
        'X-Goog-Api-Key':googleKey,
        'X-Goog-FieldMask':fields.join(','),
      },
      body: JSON.stringify(googleBody),
    });

    if (!response.ok) {
      const diagnostic = await response.text();
      console.error('Google Places error', response.status, diagnostic.slice(0, 500));
      return reply({ error:'Google could not load nearby automotive businesses right now.' }, 502);
    }

    const result = await response.json() as { places?: Array<Record<string, any>> };
    const places = (result.places || [])
      .filter((place) => place?.id && place?.location)
      .slice(0, 20)
      .map((place) => ({
        id:String(place.id),
        name:place.displayName?.text || 'Automotive business',
        category,
        latitude:place.location.latitude,
        longitude:place.location.longitude,
        address:place.formattedAddress || '',
        googleMapsUri:place.googleMapsUri || null,
        primaryType:place.primaryType || null,
        phone:place.nationalPhoneNumber || null,
        openNow:typeof place.currentOpeningHours?.openNow === 'boolean' ? place.currentOpeningHours.openNow : null,
        rating:typeof place.rating === 'number' ? place.rating : null,
        userRatingCount:typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
        websiteUri:place.websiteUri || null,
        fuelPrices:(place.fuelOptions?.fuelPrices || []).map((fuel: Record<string, any>) => ({
          type:fuel.type || 'FUEL_TYPE_UNSPECIFIED',
          currencyCode:fuel.price?.currencyCode || null,
          units:fuel.price?.units || '0',
          nanos:Number(fuel.price?.nanos || 0),
          updateTime:fuel.updateTime || null,
        })),
      }));

    return reply({ places, configured:true });
  } catch (error) {
    console.error('gascars-places failed', error);
    return reply({ error:'Could not complete the nearby search. Check your connection and try again.' }, 500);
  }
});
