import { useCallback, useEffect, useMemo, useState } from 'react';
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

const categories: Array<{ value: AutomotiveCategory; label: string; icon: string }> = [
  { value: 'gas', label: 'Gas', icon: '⛽' },
  { value: 'mechanic', label: 'Mechanics', icon: '🔧' },
  { value: 'towing', label: 'Towing', icon: '🚚' },
  { value: 'parts', label: 'Auto parts', icon: '⚙️' },
];

function categoryTitle(category: AutomotiveCategory) {
  if (category === 'gas') return 'gas stations';
  if (category === 'mechanic') return 'mechanics';
  if (category === 'towing') return 'towing';
  return 'auto parts';
}

export default function ExploreScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<AutomotiveCategory>('gas');
  const [selected, setSelected] = useState<AutomotivePlace | null>(null);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [places, setPlaces] = useState<AutomotivePlace[]>([]);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setPlacesError(null);
    try {
      const nextPlaces = await searchAutomotivePlaces({
        category: nextCategory,
        latitude,
        longitude,
        radius: 8000,
      });
      setPlaces(nextPlaces);
      setSelected(null);
      trackPlaceEvents(nextCategory, 'impression', nextPlaces.map((place) => place.id));
    } catch (error) {
      setPlaces([]);
      setSelected(null);
      setPlacesError(error instanceof Error ? error.message : 'Could not load nearby businesses.');
    } finally {
      setLoading(false);
    }
  }, []);

  const locateAndLoad = useCallback(async (nextCategory: AutomotiveCategory) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setPlacesError('Allow location access to load automotive businesses near you.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextOrigin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setOrigin(nextOrigin);
      await loadPlaces(nextCategory, nextOrigin.latitude, nextOrigin.longitude);
    } catch {
      setPlacesError('We could not get your location in this browser.');
    }
  }, [loadPlaces]);

  useEffect(() => {
    void locateAndLoad('gas');
  }, []);

  function selectCategory(nextCategory: AutomotiveCategory) {
    setCategory(nextCategory);
    setSearch('');
    setSelected(null);
    if (origin) {
      void loadPlaces(nextCategory, origin.latitude, origin.longitude);
    } else {
      void locateAndLoad(nextCategory);
    }
  }

  function selectPlace(place: AutomotivePlace) {
    setSelected(place);
    trackPlaceEvents(place.category, 'view', [place.id]);
  }

  function openDirections(place: AutomotivePlace) {
    trackPlaceEvents(place.category, 'directions', [place.id]);
    const destination = encodeURIComponent(place.latitude + ',' + place.longitude);
    void Linking.openURL(
      'https://www.google.com/maps/dir/?api=1&destination='
      + destination
      + '&destination_place_id='
      + encodeURIComponent(place.id),
    );
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.kicker}>GAS CAR'S</Text>
            <Text style={styles.title}>Everything automotive nearby.</Text>
            <Text style={styles.subtitle}>
              Live gas, mechanics, towing and auto parts powered by Google Maps data.
            </Text>
          </View>
          <View style={styles.gc}><Text style={styles.gcText}>GC</Text></View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={'Search nearby ' + categoryTitle(category) + '...'}
            placeholderTextColor="#8E9188"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.quickActions}>
          {categories.map((item) => {
            const active = category === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => selectCategory(item.value)}
                style={[styles.quickAction, active && styles.quickActionActive]}
              >
                <Text style={styles.quickActionIcon}>{item.icon}</Text>
                <View>
                  <Text style={[styles.quickActionTitle, active && styles.quickActionTitleActive]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.quickActionMeta, active && styles.quickActionMetaActive]}>
                    {item.value === 'gas'
                      ? 'Live fuel prices'
                      : item.value === 'mechanic'
                        ? 'Nearby repair shops'
                        : item.value === 'towing'
                          ? 'Roadside providers'
                          : 'Parts and tire stores'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.mapPreview}>
          <Text style={styles.mapIcon}>⌖</Text>
          <Text style={styles.mapTitle}>Web discovery mode</Text>
          <Text style={styles.mapText}>
            The mobile app shows these businesses directly on the interactive Google map.
            On web, use the live list below.
          </Text>
          <Pressable onPress={() => void locateAndLoad(category)} style={styles.locationButton}>
            <Text style={styles.locationButtonText}>Refresh my location</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={colors.coral} />
            <Text style={styles.statusText}>Loading live {categoryTitle(category)}...</Text>
          </View>
        ) : null}

        {placesError ? (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.statusText}>{placesError}</Text>
          </View>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{categoryTitle(category)}</Text>
          <Text style={styles.count}>{visiblePlaces.length} live results</Text>
        </View>

        <View style={styles.grid}>
          {visiblePlaces.map((place) => {
            const regular = fuelPrice(place, 'REGULAR_UNLEADED');
            return (
              <Pressable
                key={place.id}
                onPress={() => selectPlace(place)}
                style={[styles.placeCard, selected?.id === place.id && styles.placeCardSelected]}
              >
                <View style={styles.placeTop}>
                  <View style={styles.placeIcon}>
                    <Text style={styles.placeIconText}>
                      {place.category === 'gas'
                        ? '⛽'
                        : place.category === 'mechanic'
                          ? '🔧'
                          : place.category === 'towing'
                            ? '🚚'
                            : '⚙️'}
                    </Text>
                  </View>
                  {place.category === 'gas' ? (
                    <Text style={styles.price}>{formatPrice(regular)}</Text>
                  ) : place.openNow !== null ? (
                    <Text style={styles.openState}>{place.openNow ? 'OPEN' : 'CLOSED'}</Text>
                  ) : null}
                </View>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeMeta}>
                  {formatDistance(place.distanceMiles)}
                  {place.rating ? ' · ★ ' + place.rating.toFixed(1) : ''}
                  {place.userRatingCount ? ' (' + place.userRatingCount + ')' : ''}
                </Text>
                <Text style={styles.placeAddress}>{place.address}</Text>
              </Pressable>
            );
          })}
        </View>

        {!loading && !placesError && visiblePlaces.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No live results in this area</Text>
            <Text style={styles.emptyText}>Try another category or refresh your location.</Text>
          </View>
        ) : null}

        {selected ? (
          <View style={styles.detailCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailKicker}>SELECTED</Text>
              <Text style={styles.detailTitle}>{selected.name}</Text>
              <Text style={styles.detailMeta}>
                {formatDistance(selected.distanceMiles)}
                {selected.rating ? ' · ★ ' + selected.rating.toFixed(1) : ''}
                {selected.openNow !== null ? ' · ' + (selected.openNow ? 'Open now' : 'Closed') : ''}
              </Text>
              <Text style={styles.detailAddress}>{selected.address}</Text>

              {selected.category === 'gas' ? (
                <View style={styles.fuelRow}>
                  <Text style={styles.fuelText}>Regular {formatPrice(fuelPrice(selected, 'REGULAR_UNLEADED'))}</Text>
                  <Text style={styles.fuelText}>Mid {formatPrice(fuelPrice(selected, 'MIDGRADE'))}</Text>
                  <Text style={styles.fuelText}>Premium {formatPrice(fuelPrice(selected, 'PREMIUM'))}</Text>
                  <Text style={styles.fuelText}>Diesel {formatPrice(fuelPrice(selected, 'DIESEL'))}</Text>
                  <Text style={styles.fuelUpdated}>
                    {formatUpdated(latestFuelUpdate(selected)) || 'Update time unavailable'}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.googleAttribution}>Place data provided by Google Maps</Text>
            </View>

            <View style={styles.detailActions}>
              <Pressable onPress={() => openDirections(selected)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Directions</Text>
              </Pressable>
              {selected.phone ? (
                <Pressable onPress={() => callPlace(selected)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Call</Text>
                </Pressable>
              ) : null}
              {selected.websiteUri ? (
                <Pressable onPress={() => openWebsite(selected)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Website</Text>
                </Pressable>
              ) : null}
              {selected.category === 'mechanic' || selected.category === 'towing' ? (
                <Pressable onPress={() => requestService(selected)} style={styles.requestButton}>
                  <Text style={styles.requestButtonText}>Request service</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 24, paddingBottom: 120 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '900', letterSpacing: -1.2, marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 6, maxWidth: 620 },
  gc: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  gcText: { color: colors.lime, fontSize: 12, fontWeight: '900' },
  searchBox: { marginTop: 20, minHeight: 52, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  searchIcon: { color: colors.ink, fontSize: 21, marginRight: 8 },
  searchInput: { flex: 1, minHeight: 50, color: colors.ink, fontSize: 13, fontWeight: '700' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 11 },
  quickAction: { flex: 1, minWidth: 190, minHeight: 74, borderRadius: 19, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  quickActionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  quickActionIcon: { fontSize: 23 },
  quickActionTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  quickActionTitleActive: { color: colors.white },
  quickActionMeta: { color: colors.muted, fontSize: 8.5, marginTop: 3 },
  quickActionMetaActive: { color: '#ECEDE7' },
  mapPreview: { minHeight: 190, marginTop: 14, borderRadius: 24, backgroundColor: '#E9E7DF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mapIcon: { fontSize: 34, color: colors.coral },
  mapTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 8 },
  mapText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', maxWidth: 560, marginTop: 5 },
  locationButton: { minHeight: 38, marginTop: 13, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  locationButtonText: { color: colors.ink, fontSize: 9.5, fontWeight: '900' },
  statusCard: { marginTop: 12, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorCard: { backgroundColor: '#FFF0EC', borderColor: '#F0B6A8' },
  statusText: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  sectionRow: { marginTop: 22, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  count: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  placeCard: { minWidth: 220, flexGrow: 1, flexBasis: '30%', borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 14 },
  placeCardSelected: { borderColor: colors.coral, backgroundColor: '#FFF8F4' },
  placeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralSoft },
  placeIconText: { fontSize: 17 },
  price: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  openState: { color: colors.ink, fontSize: 8.5, fontWeight: '900' },
  placeName: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 10 },
  placeMeta: { color: colors.muted, fontSize: 9.5, marginTop: 4 },
  placeAddress: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  emptyCard: { marginTop: 12, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 18 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  detailCard: { marginTop: 14, borderRadius: 20, backgroundColor: colors.ink, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  detailKicker: { color: colors.lime, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  detailTitle: { color: colors.white, fontSize: 16, fontWeight: '900', marginTop: 3 },
  detailMeta: { color: '#BFC2B9', fontSize: 10, marginTop: 4 },
  detailAddress: { color: '#D4D6D0', fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  fuelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  fuelText: { color: colors.white, fontSize: 9.5, fontWeight: '800' },
  fuelUpdated: { color: colors.lime, fontSize: 8.5, width: '100%' },
  googleAttribution: { color: '#9EA198', fontSize: 8, marginTop: 8 },
  detailActions: { gap: 7, minWidth: 110 },
  primaryButton: { minHeight: 40, borderRadius: 12, backgroundColor: colors.coral, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.white, fontSize: 9.5, fontWeight: '900' },
  secondaryButton: { minHeight: 38, borderRadius: 12, backgroundColor: '#34382F', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.white, fontSize: 9.5, fontWeight: '900' },
  requestButton: { minHeight: 40, borderRadius: 12, backgroundColor: colors.lime, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  requestButtonText: { color: colors.ink, fontSize: 9.5, fontWeight: '900' },
});
