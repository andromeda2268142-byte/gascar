export type MapCategory = 'gas' | 'mechanic' | 'towing' | 'parts';

export type MapPlace = {
  id: string;
  name: string;
  category: MapCategory;
  latitude: number;
  longitude: number;
  distance: string;
  updated?: string;
  regular?: number;
  midgrade?: number;
  premium?: number;
  diesel?: number;
  rating?: number;
  eta?: string;
  address: string;
};

export const mapPlaces: MapPlace[] = [
  {
    id: 'qt-uptown',
    name: 'QuikTrip',
    category: 'gas',
    latitude: 32.8006,
    longitude: -96.8024,
    distance: '0.7 mi',
    updated: '8 min',
    regular: 2.74,
    midgrade: 3.06,
    premium: 3.34,
    diesel: 3.49,
    address: 'Dallas, TX 75204',
  },
  {
    id: 'shell-downtown',
    name: 'Shell',
    category: 'gas',
    latitude: 32.7877,
    longitude: -96.7984,
    distance: '1.2 mi',
    updated: '14 min',
    regular: 2.79,
    midgrade: 3.11,
    premium: 3.39,
    diesel: 3.55,
    address: 'Dallas, TX 75201',
  },
  {
    id: 'racetrac-oaklawn',
    name: 'RaceTrac',
    category: 'gas',
    latitude: 32.8121,
    longitude: -96.8159,
    distance: '1.8 mi',
    updated: '6 min',
    regular: 2.69,
    midgrade: 2.99,
    premium: 3.29,
    diesel: 3.45,
    address: 'Dallas, TX 75219',
  },
  {
    id: 'rapid-auto',
    name: 'Rapid Auto Care',
    category: 'mechanic',
    latitude: 32.7954,
    longitude: -96.8208,
    distance: '1.4 mi',
    rating: 4.8,
    address: 'Dallas, TX 75207',
  },
  {
    id: 'metro-tow',
    name: 'Metro Tow 24/7',
    category: 'towing',
    latitude: 32.7783,
    longitude: -96.8104,
    distance: '1.9 mi',
    rating: 4.9,
    eta: '8 min',
    address: 'Dallas, TX 75202',
  },
  {
    id: 'oreilly',
    name: "O'Reilly Auto Parts",
    category: 'parts',
    latitude: 32.8062,
    longitude: -96.7798,
    distance: '2.2 mi',
    rating: 4.6,
    address: 'Dallas, TX 75214',
  },
];
