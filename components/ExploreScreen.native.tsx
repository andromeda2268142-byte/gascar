import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import {
  formatDistance,
  formatPrice,
  formatUpdated,
  fuelPrice,
  latestFuelUpdate,
  searchAutomotivePlaces,
  trackPlaceEvents,
  type AutomotiveCategory,
  type AutomotivePlace,
} from '@/lib/automotivePlaces';

const FALLBACK_REGION: Region = {
  latitude: 32.7936,
  longitude: -96.8019,
  latitudeDelta: 0.055,
  longitudeDelta: 0.04,
};

const categories: Array<{ value: AutomotiveCategory; label: string; icon: string }> = [
  { value: 'gas', label: 'Gas', icon: '⛽' },
  { value: 'mechanic', label: 'Mechanics', icon: '🔧' },
  { value: 'towing', label: 'Towing', icon: '🚚' },
  { value: 'parts', label: 'Auto parts', icon: '⚙️' },
];

function markerLabel(place: AutomotivePlace) {
  if (place.category === 'gas') {
    return formatPrice(fuelPrice(place, 'REGULAR_UNLEADED')) === '—'
      ? '⛽'
      : formatPrice(fuelPrice(place, 'REGULAR_UNLEADED'));
  }
  if (place.category === 'mechanic') return '🔧';
  if (place.category === 'towing') return '🚚';
  return '⚙️';
}

function categoryTitle(category: AutomotiveCategory) {
  if (category === 'gas') return 'gas stations';
  if (category === 'mechanic') return 'mechanics';
  if (category === 'towing') return 'towing';
  return 'auto parts';
}

export default function ExploreScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const requestRef = useRef(0);
  const [category, setCategory] = useState<AutomotiveCategory>('gas');
  const [selected, setSelected] = useState<AutomotivePlace | null>(null);
  const [search, setSearch] = useState('');
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [places, setPlaces] = useState<AutomotivePlace[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);

  const visiblePlaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return places;
    return places.filter((place) =>
      (place.name + ' ' + place.address).toLowerCase().includes(query),
    );
  }, [places, search]);

  const loadPlaces = useCallback(async (
    nextCategory: AutomotiveCategory,
    latitude: number,
    longitude: number,
  ) => {
    const requestId = ++requestRef.current;
    setLoadingPlaces(true);
    setPlacesError(null);

    try {
      const nextPlaces = await searchAutomotivePlaces({
        category: nextCategory,
        latitude,
        longitude,
        radius: 8000,
      });

      if (requestId !== requestRef.current) return;
      setPlaces(nextPlaces);
      setSelected(null);
      trackPlaceEvents(nextCategory, 'impression', nextPlaces.map((place) => place.id));
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setPlaces([]);
      setSelected(null);
      setPlacesError(
        error instanceof Error
          ? error.message
          : 'Could not load nearby automotive businesses.',
      );
    } finally {
      if (requestId === requestRef.current) setLoadingPlaces(false);
    }
  }, []);

  const useMyLocation = useCallback(async (
    nextCategory: AutomotiveCategory = category,
    shouldPrompt = true,
  ) => {
    try {
      const permission = shouldPrompt
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setPlacesError('Enable location to see live automotive businesses near you.');
        return;
      }

      setLocationEnabled(true);
      setPlacesError(null);

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextOrigin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setOrigin(nextOrigin);
      mapRef.current?.animateToRegion(
        {
          ...nextOrigin,
          latitudeDelta: 0.055,
          longitudeDelta: 0.04,
        },
        500,
      );
      await loadPlaces(nextCategory, nextOrigin.latitude, nextOrigin.longitude);
    } catch {
      setPlacesError('We could not get your location. Try again from the location button.');
    }
  }, [category, loadPlaces]);

  useEffect(() => {
    void useMyLocation('gas', true);
  }, []);

  function selectCategory(nextCategory: AutomotiveCategory) {
    setCategory(nextCategory);
    setSearch('');
    setSelected(null);

    if (origin) {
      void loadPlaces(nextCategory, origin.latitude, origin.longitude);
    } else {
      void useMyLocation(nextCategory, true);
    }
  }

  function selectPlace(place: AutomotivePlace) {
    setSelected(place);
    trackPlaceEvents(place.category, 'view', [place.id]);
    mapRef.current?.animateCamera(
      {
        center: { latitude: place.latitude, longitude: place.longitude },
        zoom: 14.8,
      },
      { duration: 350 },
    );
  }

  function openDirections(place: AutomotivePlace) {
    trackPlaceEvents(place.category, 'directions', [place.id]);
    const destination = encodeURIComponent(place.latitude + ',' + place.longitude);
    const url =
      'https://www.google.com/maps/dir/?api=1&destination='
      + destination
      + '&destination_place_id='
      + encodeURIComponent(place.id);
    void Linking.openURL(url);
  }

  function callPlace(place: AutomotivePlace) {
    if (!place.phone) return;
    trackPlaceEvents(place.category, 'call', [place.id]);
    void Linking.openURL('tel:' + place.phone.replace(/[^+\d]/g, ''));
  }

  function openWebsite(place: AutomotivePlace) {
    if (!place.websiteUri) return;
    trackPlaceEvents(place.category, 'website', [place.id]);
    void Linking.openURL(place.websiteUri);
  }

  function requestService(place: AutomotivePlace) {
    trackPlaceEvents(place.category, 'service_request', [place.id]);
    router.push({
      pathname: '/(tabs)/request',
      params: { category: place.category === 'towing' ? 'towing' : 'repair' },
    });
  }

  const selectedRegular = selected ? fuelPrice(selected, 'REGULAR_UNLEADED') : null;
  const selectedMidgrade = selected ? fuelPrice(selected, 'MIDGRADE') : null;
  const selectedPremium = selected ? fuelPrice(selected, 'PREMIUM') : null;
  const selectedDiesel = selected ? fuelPrice(selected, 'DIESEL') : null;
  const selectedUpdated = selected ? formatUpdated(latestFuelUpdate(selected)) : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={FALLBACK_REGION}
        showsCompass={false}
        showsPointsOfInterest
        showsUserLocation={locationEnabled}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
      >
        {visiblePlaces.map((place) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.latitude, longitude: place.longitude }}
            onPress={(event) => {
              event.stopPropagation();
              selectPlace(place);
            }}
          >
            <View
              style={[
                styles.marker,
                place.category !== 'gas' && styles.markerRound,
                selected?.id === place.id && styles.markerSelected,
              ]}
            >
              <Text style={[styles.markerText, place.category !== 'gas' && styles.markerIcon]}>
                {markerLabel(place)}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={'Search nearby ' + categoryTitle(category) + '...'}
              placeholderTextColor="#8E9188"
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.profileButton}>
            <Text style={styles.profileText}>GC</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActions}
          keyboardShouldPersistTaps="handled"
        >
          {categories.map((item) => {
            const active = category === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => selectCategory(item.value)}
                style={({ pressed }) => [
                  styles.quickAction,
                  active && styles.quickActionActive,
                  pressed && { opacity: 0.82 },
                ]}
              >
                <Text style={styles.quickActionIcon}>{item.icon}</Text>
                <Text style={[styles.quickActionText, active && styles.quickActionTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loadingPlaces || placesError ? (
          <View style={[styles.statusBanner, placesError && styles.statusBannerError]}>
            {loadingPlaces ? <ActivityIndicator size="small" color={colors.ink} /> : null}
            <Text style={styles.statusBannerText}>
              {loadingPlaces
                ? 'Loading live ' + categoryTitle(category) + '...'
                : placesError}
            </Text>
          </View>
        ) : null}
      </SafeAreaView>

      <Pressable
        onPress={() => void useMyLocation(category, true)}
        style={[styles.locationButton, { bottom: selected ? 340 : 104 }]}
      >
        <Text style={styles.locationButtonText}>⌖</Text>
      </Pressable>

      {selected ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{selected.name}</Text>
                {selected.openNow !== null ? (
                  <View style={[styles.openBadge, !selected.openNow && styles.closedBadge]}>
                    <Text style={styles.openBadgeText}>{selected.openNow ? 'OPEN' : 'CLOSED'}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.sheetMeta}>
                {formatDistance(selected.distanceMiles)}
                {selected.rating ? ' · ★ ' + selected.rating.toFixed(1) : ''}
                {selected.userRatingCount ? ' (' + selected.userRatingCount + ')' : ''}
              </Text>
              <Text style={styles.address} numberOfLines={2}>{selected.address}</Text>
            </View>
          </View>

          {selected.category === 'gas' ? (
            <>
              <View style={styles.priceRow}>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>Regular</Text>
                  <Text style={styles.priceValue}>{formatPrice(selectedRegular)}</Text>
                </View>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>Midgrade</Text>
                  <Text style={styles.priceValue}>{formatPrice(selectedMidgrade)}</Text>
                </View>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>Premium</Text>
                  <Text style={styles.priceValue}>{formatPrice(selectedPremium)}</Text>
                </View>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>Diesel</Text>
                  <Text style={styles.priceValue}>{formatPrice(selectedDiesel)}</Text>
                </View>
              </View>
              <Text style={styles.priceUpdate}>
                {selectedUpdated ? 'Fuel prices updated ' + selectedUpdated : 'Fuel price data is not available for this station.'}
              </Text>
            </>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable onPress={() => openDirections(selected)} style={[styles.actionButton, styles.actionPrimary]}>
              <Text style={styles.actionIcon}>➜</Text>
              <Text style={styles.actionPrimaryText}>Directions</Text>
            </Pressable>
            {selected.phone ? (
              <Pressable onPress={() => callPlace(selected)} style={styles.actionButton}>
                <Text style={styles.actionIcon}>☎</Text>
                <Text style={styles.actionText}>Call</Text>
              </Pressable>
            ) : null}
            {selected.websiteUri ? (
              <Pressable onPress={() => openWebsite(selected)} style={styles.actionButton}>
                <Text style={styles.actionIcon}>↗</Text>
                <Text style={styles.actionText}>Website</Text>
              </Pressable>
            ) : null}
          </View>

          {selected.category === 'mechanic' || selected.category === 'towing' ? (
            <Pressable onPress={() => requestService(selected)} style={styles.serviceButton}>
              <Text style={styles.serviceButtonText}>
                {selected.category === 'towing' ? 'Request towing in Gas Car’s' : 'Request mechanic in Gas Car’s'}
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.googleAttribution}>Place data provided by Google Maps</Text>
        </View>
      ) : null}

      <View style={[styles.liveBadge, { bottom: selected ? 340 : 104 }]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>
          {places.length ? places.length + ' live results' : 'Google Maps live data'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E9E7DF' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    height: 54,
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(35,37,31,0.08)',
  },
  searchIcon: { color: colors.ink, fontSize: 22, marginRight: 8, fontWeight: '800' },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  profileButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  profileText: { color: colors.lime, fontSize: 13, fontWeight: '900' },
  quickActions: { gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  quickAction: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(35,37,31,0.08)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  quickActionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  quickActionIcon: { fontSize: 16 },
  quickActionText: { color: colors.ink, fontSize: 9.5, fontWeight: '900' },
  quickActionTextActive: { color: colors.white },
  statusBanner: {
    marginHorizontal: 14,
    marginTop: 8,
    minHeight: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(255,253,248,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(35,37,31,0.08)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBannerError: { backgroundColor: 'rgba(255,240,236,0.97)', borderColor: '#F0B6A8' },
  statusBannerText: { flex: 1, color: colors.ink, fontSize: 9.5, lineHeight: 14, fontWeight: '800' },
  marker: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.coral,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  markerRound: {
    minWidth: 46,
    width: 46,
    height: 46,
    borderRadius: 16,
    paddingHorizontal: 0,
    backgroundColor: colors.ink,
  },
  markerSelected: { transform: [{ scale: 1.08 }], borderColor: colors.lime },
  markerText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  markerIcon: { fontSize: 18 },
  locationButton: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(35,37,31,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  locationButtonText: { fontSize: 25, color: colors.ink, fontWeight: '900' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 94,
    minHeight: 220,
    maxHeight: 330,
    backgroundColor: colors.paper,
    borderRadius: 26,
    paddingHorizontal: 17,
    paddingTop: 9,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(35,37,31,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#C8C8C0',
    alignSelf: 'center',
    marginBottom: 11,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { flexShrink: 1, color: colors.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  sheetMeta: { color: colors.muted, fontSize: 10.5, marginTop: 4 },
  address: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  openBadge: { borderRadius: 999, backgroundColor: colors.limeSoft, paddingHorizontal: 8, paddingVertical: 4 },
  closedBadge: { backgroundColor: '#F4DDD7' },
  openBadgeText: { color: colors.ink, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  priceRow: { flexDirection: 'row', gap: 7, marginTop: 13 },
  priceCell: {
    flex: 1,
    minHeight: 58,
    borderRadius: 15,
    backgroundColor: '#F1EFE7',
    paddingHorizontal: 7,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  priceLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '800' },
  priceValue: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 3 },
  priceUpdate: { color: colors.muted, fontSize: 8.5, marginTop: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  actionButton: {
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: '#F1EFE7',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.coral },
  actionIcon: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  actionText: { color: colors.ink, fontSize: 9, fontWeight: '900' },
  actionPrimaryText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  serviceButton: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  serviceButtonText: { color: colors.lime, fontSize: 9.5, fontWeight: '900' },
  googleAttribution: { color: colors.muted, fontSize: 7.5, marginTop: 8, textAlign: 'right' },
  liveBadge: {
    position: 'absolute',
    left: 16,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(32,35,30,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.lime },
  liveText: { color: colors.white, fontSize: 9.5, fontWeight: '900' },
});
