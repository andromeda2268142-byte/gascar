import { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { mapPlaces, type MapCategory, type MapPlace } from '@/data/mapPlaces';

const filters: Array<{ key: MapCategory; label: string; icon: string }> = [
  { key: 'gas', label: 'Gasolina', icon: '⛽' },
  { key: 'mechanic', label: 'Talleres', icon: '🔧' },
  { key: 'towing', label: 'Grúas', icon: '🚚' },
  { key: 'parts', label: 'Autopartes', icon: '⚙️' },
];

function money(value?: number) {
  return typeof value === 'number' ? '$' + value.toFixed(2) : '—';
}

function openDirections(place: MapPlace) {
  const destination = encodeURIComponent(place.latitude + ',' + place.longitude);
  void Linking.openURL('https://www.google.com/maps/dir/?api=1&destination=' + destination);
}

export default function ExploreScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<MapCategory>('gas');
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [search, setSearch] = useState('');

  const visiblePlaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mapPlaces.filter((place) => {
      const categoryMatch = place.category === category;
      const haystack = (place.name + ' ' + place.address).toLowerCase();
      return categoryMatch && (!query || haystack.includes(query));
    });
  }, [category, search]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.kicker}>GAS CAR'S</Text>
            <Text style={styles.title}>Explore nearby.</Text>
            <Text style={styles.subtitle}>Web testing view · the native app keeps the interactive map.</Text>
          </View>
          <View style={styles.gc}><Text style={styles.gcText}>GC</Text></View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar gasolina, grúa, autopartes..."
            placeholderTextColor="#8E9188"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.quickActions}>
          <Pressable
            onPress={() => {
              setCategory('gas');
              setSelected(null);
            }}
            style={styles.quickAction}
          >
            <Text style={styles.quickActionIcon}>⛽</Text>
            <View><Text style={styles.quickActionTitle}>Gas nearby</Text><Text style={styles.quickActionMeta}>Compare nearby prices</Text></View>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/request', params: { category: 'repair' } })}
            style={[styles.quickAction, styles.quickActionDark]}
          >
            <Text style={styles.quickActionIcon}>🔧</Text>
            <View><Text style={styles.quickActionTitleDark}>Request mechanic</Text><Text style={styles.quickActionMetaDark}>Matched service providers</Text></View>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/request', params: { category: 'towing' } })}
            style={[styles.quickAction, styles.quickActionCoral]}
          >
            <Text style={styles.quickActionIcon}>🚚</Text>
            <View><Text style={styles.quickActionTitleDark}>Need towing</Text><Text style={styles.quickActionMetaDark}>Pickup and destination</Text></View>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => {
            const active = category === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  if (item.key === 'mechanic') {
                    router.push('/(tabs)/request');
                    return;
                  }
                  setCategory(item.key);
                  setSelected(null);
                }}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text>{item.icon}</Text>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.webMap}>
          <View style={styles.webMapGrid} />
          <Text style={styles.webMapIcon}>⌖</Text>
          <Text style={styles.webMapTitle}>Map preview disabled on web test mode</Text>
          <Text style={styles.webMapText}>
            Use the list below to test accounts and flows on PC. The interactive native map remains available in Expo Go.
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{filters.find((item) => item.key === category)?.label}</Text>
          <Text style={styles.count}>{visiblePlaces.length} demo</Text>
        </View>

        <View style={styles.grid}>
          {visiblePlaces.map((place) => (
            <Pressable
              key={place.id}
              onPress={() => setSelected(place)}
              style={[styles.placeCard, selected?.id === place.id && styles.placeCardSelected]}
            >
              <View style={styles.placeTop}>
                <View style={[styles.placeIcon, place.category === 'gas' ? styles.gasIcon : styles.serviceIcon]}>
                  <Text style={styles.placeIconText}>
                    {place.category === 'gas' ? '⛽' : place.category === 'mechanic' ? '🔧' : place.category === 'towing' ? '🚚' : '⚙️'}
                  </Text>
                </View>
                {place.category === 'gas' ? <Text style={styles.price}>{money(place.regular)}</Text> : null}
              </View>
              <Text style={styles.placeName}>{place.name}</Text>
              <Text style={styles.placeMeta}>{place.distance}{place.rating ? ' · ★ ' + place.rating.toFixed(1) : ''}</Text>
              <Text style={styles.placeAddress}>{place.address}</Text>
            </Pressable>
          ))}
        </View>

        {selected ? (
          <View style={styles.detailCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailKicker}>SELECTED</Text>
              <Text style={styles.detailTitle}>{selected.name}</Text>
              <Text style={styles.detailMeta}>{selected.address}</Text>
              {selected.category === 'gas' ? (
                <Text style={styles.detailPrice}>Regular {money(selected.regular)} · Premium {money(selected.premium)} · Diesel {money(selected.diesel)}</Text>
              ) : null}
            </View>
            <Pressable onPress={() => openDirections(selected)} style={styles.routeButton}>
              <Text style={styles.routeText}>Directions</Text>
            </Pressable>
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
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 6 },
  gc: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  gcText: { color: colors.lime, fontSize: 12, fontWeight: '900' },
  searchBox: { marginTop: 20, minHeight: 52, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  searchIcon: { color: colors.ink, fontSize: 21, marginRight: 8 },
  searchInput: { flex: 1, minHeight: 50, color: colors.ink, fontSize: 13, fontWeight: '700' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 11 },
  quickAction: { flex: 1, minWidth: 190, minHeight: 78, borderRadius: 19, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  quickActionDark: { backgroundColor: colors.ink, borderColor: colors.ink },
  quickActionCoral: { backgroundColor: colors.coral, borderColor: colors.coral },
  quickActionIcon: { fontSize: 23 },
  quickActionTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  quickActionTitleDark: { color: colors.white, fontSize: 12, fontWeight: '950' },
  quickActionMeta: { color: colors.muted, fontSize: 8.5, marginTop: 3 },
  quickActionMetaDark: { color: '#ECEDE7', fontSize: 8.5, marginTop: 3 },
  filters: { gap: 8, paddingVertical: 14 },
  filter: { minHeight: 40, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, flexDirection: 'row', gap: 7, alignItems: 'center' },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: colors.white },
  webMap: { minHeight: 210, borderRadius: 24, backgroundColor: '#E9E7DF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'hidden' },
  webMapGrid: { ...StyleSheet.absoluteFillObject, opacity: 0.15, borderWidth: 18, borderColor: colors.white },
  webMapIcon: { fontSize: 34, color: colors.coral },
  webMapTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 8 },
  webMapText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', maxWidth: 500, marginTop: 5 },
  sectionRow: { marginTop: 22, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  placeCard: { minWidth: 220, flexGrow: 1, flexBasis: '30%', borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 14 },
  placeCardSelected: { borderColor: colors.coral, backgroundColor: '#FFF8F4' },
  placeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  gasIcon: { backgroundColor: colors.coralSoft },
  serviceIcon: { backgroundColor: colors.limeSoft },
  placeIconText: { fontSize: 17 },
  price: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  placeName: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 10 },
  placeMeta: { color: colors.muted, fontSize: 9.5, marginTop: 4 },
  placeAddress: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  detailCard: { marginTop: 14, borderRadius: 20, backgroundColor: colors.ink, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailKicker: { color: colors.lime, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  detailTitle: { color: colors.white, fontSize: 16, fontWeight: '900', marginTop: 3 },
  detailMeta: { color: '#BFC2B9', fontSize: 10, marginTop: 4 },
  detailPrice: { color: colors.white, fontSize: 10.5, marginTop: 7, fontWeight: '700' },
  routeButton: { minHeight: 42, borderRadius: 13, backgroundColor: colors.coral, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  routeText: { color: colors.white, fontSize: 10.5, fontWeight: '900' },
});
