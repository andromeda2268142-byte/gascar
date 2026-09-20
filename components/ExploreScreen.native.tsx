import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { mapPlaces, type MapCategory, type MapPlace } from '@/data/mapPlaces';

const DALLAS_REGION: Region = {
  latitude: 32.7936,
  longitude: -96.8019,
  latitudeDelta: 0.055,
  longitudeDelta: 0.04,
};

const filters: Array<{ key: MapCategory; label: string; icon: string }> = [
  { key: 'gas', label: 'Gasolina', icon: '⛽' },
  { key: 'mechanic', label: 'Talleres', icon: '🔧' },
  { key: 'towing', label: 'Grúas', icon: '🚚' },
  { key: 'parts', label: 'Autopartes', icon: '⚙️' },
];

function money(value?: number) {
  return typeof value === 'number' ? '$' + value.toFixed(2) : '—';
}

function markerLabel(place: MapPlace) {
  if (place.category === 'gas') return money(place.regular);
  if (place.category === 'mechanic') return '🔧';
  if (place.category === 'towing') return '🚚';
  return '⚙️';
}

export default function ExploreScreen() {
  const mapRef = useRef<MapView>(null);
  const [category, setCategory] = useState<MapCategory>('gas');
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [search, setSearch] = useState('');
  const [locationEnabled, setLocationEnabled] = useState(false);

  const visiblePlaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mapPlaces.filter((place) => {
      const categoryMatch = place.category === category;
      const searchMatch = !query || place.name.toLowerCase().includes(query) || place.address.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
  }, [category, search]);

  function selectCategory(nextCategory: MapCategory) {
    setCategory(nextCategory);
    setSelected(null);
    const first = mapPlaces.find((place) => place.category === nextCategory);
    if (first) {
      mapRef.current?.animateToRegion(
        {
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.045,
          longitudeDelta: 0.035,
        },
        350,
      );
    }
  }

  function selectPlace(place: MapPlace) {
    setSelected(place);
    mapRef.current?.animateCamera(
      {
        center: { latitude: place.latitude, longitude: place.longitude },
        zoom: 14.8,
      },
      { duration: 350 },
    );
  }

  async function useMyLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ubicación desactivada', 'Activa el permiso de ubicación para centrar el mapa donde estás.');
        return;
      }

      setLocationEnabled(true);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.045,
          longitudeDelta: 0.035,
        },
        500,
      );
    } catch {
      Alert.alert('No pudimos obtener tu ubicación', 'Puedes seguir explorando el mapa manualmente.');
    }
  }

  function openDirections(place: MapPlace) {
    const destination = encodeURIComponent(place.latitude + ',' + place.longitude);
    const url = Platform.select({
      ios: 'http://maps.apple.com/?daddr=' + destination,
      android: 'https://www.google.com/maps/dir/?api=1&destination=' + destination,
      default: 'https://www.google.com/maps/dir/?api=1&destination=' + destination,
    });
    if (url) void Linking.openURL(url);
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DALLAS_REGION}
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
            tracksViewChanges={false}
          >
            <View style={[styles.marker, place.category !== 'gas' && styles.markerRound, selected?.id === place.id && styles.markerSelected]}>
              <Text style={[styles.markerText, place.category !== 'gas' && styles.markerIcon]}>{markerLabel(place)}</Text>
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
              placeholder="Buscar gasolina, taller, grúa..."
              placeholderTextColor="#8E9188"
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <Pressable style={styles.profileButton}>
            <Text style={styles.profileText}>GC</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filters.map((item) => {
            const active = category === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => selectCategory(item.key)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={styles.filterIcon}>{item.icon}</Text>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <Pressable onPress={useMyLocation} style={[styles.locationButton, { bottom: selected ? 286 : 104 }]}>
        <Text style={styles.locationButtonText}>⌖</Text>
      </Pressable>

      {selected ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle}>{selected.name}</Text>
                {selected.category === 'gas' ? <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>CERCA</Text></View> : null}
              </View>
              <Text style={styles.sheetMeta}>
                {selected.distance}
                {selected.rating ? ' · ★ ' + selected.rating.toFixed(1) : ''}
                {selected.eta ? ' · ETA ' + selected.eta : ''}
                {selected.updated ? ' · actualizado hace ' + selected.updated : ''}
              </Text>
            </View>
            <Pressable onPress={() => openDirections(selected)} style={styles.routeButton}>
              <Text style={styles.routeButtonIcon}>➜</Text>
              <Text style={styles.routeButtonText}>Ir</Text>
            </Pressable>
          </View>

          {selected.category === 'gas' ? (
            <View style={styles.priceRow}>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Regular</Text>
                <Text style={styles.priceValue}>{money(selected.regular)}</Text>
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Intermedia</Text>
                <Text style={styles.priceValue}>{money(selected.midgrade)}</Text>
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Premium</Text>
                <Text style={styles.priceValue}>{money(selected.premium)}</Text>
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Diésel</Text>
                <Text style={styles.priceValue}>{money(selected.diesel)}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceInfoText}>{selected.address}</Text>
              <Text style={styles.serviceInfoSub}>Toca “Ir” para abrir navegación. Próximamente: cotizaciones y disponibilidad en vivo.</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={[styles.demoBadge, { bottom: selected ? 286 : 104 }]}>
        <View style={styles.demoDot} />
        <Text style={styles.demoText}>Precios demo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E9E7DF' },

  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
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
  profileText: { color: colors.lime, fontSize: 13, fontWeight: '950' },

  filterRow: { paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8, gap: 8 },
  filterPill: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: 'rgba(255,253,248,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(35,37,31,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  filterPillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterIcon: { fontSize: 14 },
  filterText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: colors.white },

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
  markerSelected: {
    transform: [{ scale: 1.08 }],
    borderColor: colors.lime,
  },
  markerText: { color: colors.white, fontSize: 13, fontWeight: '950' },
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
    minHeight: 172,
    backgroundColor: colors.paper,
    borderRadius: 26,
    paddingHorizontal: 17,
    paddingTop: 9,
    paddingBottom: 15,
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
  sheetTitle: { color: colors.ink, fontSize: 19, fontWeight: '950', letterSpacing: -0.4 },
  bestBadge: { backgroundColor: colors.limeSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  bestBadgeText: { color: '#5E791F', fontSize: 8, fontWeight: '950', letterSpacing: 0.6 },
  sheetMeta: { color: colors.muted, fontSize: 10.5, marginTop: 4 },
  routeButton: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeButtonIcon: { color: colors.white, fontSize: 15, fontWeight: '950' },
  routeButtonText: { color: colors.white, fontSize: 9, fontWeight: '900', marginTop: 1 },

  priceRow: { flexDirection: 'row', gap: 7, marginTop: 15 },
  priceCell: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: '#F1EFE7',
    paddingHorizontal: 8,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  priceLabel: { color: colors.muted, fontSize: 8.5, fontWeight: '800' },
  priceValue: { color: colors.ink, fontSize: 16, fontWeight: '950', marginTop: 4 },

  serviceInfo: { marginTop: 14, backgroundColor: '#F1EFE7', borderRadius: 16, padding: 12 },
  serviceInfoText: { color: colors.ink, fontSize: 11.5, fontWeight: '900' },
  serviceInfoSub: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },

  demoBadge: {
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
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.lime },
  demoText: { color: colors.white, fontSize: 9.5, fontWeight: '900' },
});
