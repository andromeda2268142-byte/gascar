import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Card, Pill, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';
import { places } from '@/data/mock';

const tones = {
  coral: colors.coralSoft,
  sun: colors.sunSoft,
  violet: colors.violetSoft,
  mint: colors.mintSoft,
};

export default function ExploreScreen() {
  const [filter, setFilter] = useState('All');
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.eyebrow}>GAS CAR'S</Text>
            <Text style={styles.location}>Dallas, Texas</Text>
          </View>
          <Pressable onPress={() => router.push('/business')} style={styles.businessButton}>
            <Text style={styles.businessButtonText}>Business Portal</Text>
          </Pressable>
        </View>

        <Text style={styles.hero}>Everything your car needs, nearby.</Text>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput placeholder="Search gas, mechanics, towing..." placeholderTextColor="#9A9C94" style={styles.searchInput} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {['All', 'Gas', 'Mechanics', 'Towing', 'Auto Parts'].map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)}><Pill active={filter === item}>{item}</Pill></Pressable>
          ))}
        </ScrollView>

        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <View><Text style={styles.mapTitle}>Dallas–Fort Worth</Text><Text style={styles.mapCaption}>Preview map · demo locations</Text></View>
            <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>Nearby</Text></View>
          </View>
          <View style={styles.mapCanvas}>
            <View style={[styles.road, { top: 70, left: -30, transform: [{ rotate: '12deg' }] }]} />
            <View style={[styles.road, { top: 118, left: -20, transform: [{ rotate: '-7deg' }] }]} />
            <View style={[styles.roadVertical, { left: 92, top: -20, transform: [{ rotate: '8deg' }] }]} />
            <View style={[styles.pin, styles.pinCoral, { left: '22%', top: '36%' }]}><Text style={styles.pinText}>$2.74</Text></View>
            <View style={[styles.pin, styles.pinSun, { left: '62%', top: '24%' }]}><Text style={styles.pinText}>$2.79</Text></View>
            <View style={[styles.pinRound, styles.pinViolet, { left: '51%', top: '60%' }]}><Text>🔧</Text></View>
            <View style={[styles.pinRound, styles.pinMint, { left: '76%', top: '58%' }]}><Text>🚚</Text></View>
            <View style={styles.userDot} />
          </View>
        </View>

        <SectionTitle title="Nearby right now" right="Demo data" />
        <View style={{ gap: 10 }}>
          {places.map((place) => (
            <Card key={place.id} style={styles.placeCard}>
              <View style={[styles.placeIcon, { backgroundColor: tones[place.tone] }]}><Text style={{ fontSize: 20 }}>{place.type === 'Gas' ? '⛽' : place.type === 'Mechanic' ? '🔧' : '🚚'}</Text></View>
              <View style={styles.placeCopy}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeMeta}>{place.type} · {place.meta}</Text>
              </View>
              <Text style={styles.placePrice}>{place.price}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 110 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.coral, fontSize: 12, fontWeight: '950', letterSpacing: 1.5 },
  location: { marginTop: 3, color: colors.ink, fontSize: 18, fontWeight: '900' },
  businessButton: { backgroundColor: colors.lime, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13 },
  businessButtonText: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  hero: { color: colors.ink, fontSize: 34, fontWeight: '950', letterSpacing: -1.5, lineHeight: 37, marginTop: 26, maxWidth: 330 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, height: 54, paddingHorizontal: 15, marginTop: 18 },
  searchIcon: { fontSize: 22, marginRight: 9, color: colors.muted },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' },
  pills: { paddingVertical: 14 },
  mapCard: { backgroundColor: colors.white, borderRadius: 26, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', marginBottom: 20 },
  mapHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  mapCaption: { fontSize: 11, color: colors.muted, marginTop: 3 },
  livePill: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: colors.limeSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#70A72B' },
  liveText: { fontSize: 10, fontWeight: '900', color: colors.ink },
  mapCanvas: { height: 230, backgroundColor: '#EAE7DC', overflow: 'hidden' },
  road: { position: 'absolute', width: '125%', height: 18, backgroundColor: '#F8F5ED', borderWidth: 1, borderColor: '#DCD7CB' },
  roadVertical: { position: 'absolute', width: 18, height: 290, backgroundColor: '#F8F5ED', borderWidth: 1, borderColor: '#DCD7CB' },
  pin: { position: 'absolute', minWidth: 55, paddingHorizontal: 10, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  pinRound: { position: 'absolute', width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  pinCoral: { backgroundColor: colors.coral }, pinSun: { backgroundColor: '#C69419' }, pinViolet: { backgroundColor: colors.violet }, pinMint: { backgroundColor: '#3DA985' },
  pinText: { color: colors.white, fontSize: 12, fontWeight: '950' },
  userDot: { position: 'absolute', left: '46%', top: '43%', width: 17, height: 17, borderRadius: 9, backgroundColor: '#246BE8', borderWidth: 4, borderColor: colors.white },
  placeCard: { flexDirection: 'row', alignItems: 'center', padding: 13 },
  placeIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  placeCopy: { flex: 1, marginLeft: 12 },
  placeName: { fontSize: 14, fontWeight: '900', color: colors.ink },
  placeMeta: { marginTop: 4, fontSize: 11, color: colors.muted },
  placePrice: { fontSize: 16, fontWeight: '950', color: colors.ink },
});
