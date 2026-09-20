import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';

export default function GarageScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>MY GARAGE</Text>
        <Text style={styles.title}>2019 Toyota Camry SE</Text>
        <Text style={styles.subtitle}>2.5L · Automatic · Regular fuel</Text>

        <View style={styles.carCard}>
          <View style={styles.carTop}><Text style={styles.carEmoji}>🚘</Text><View style={styles.activePill}><Text style={styles.activeText}>ACTIVE</Text></View></View>
          <Text style={styles.vehicleLabel}>Primary vehicle</Text>
          <Text style={styles.vehicleName}>Camry SE</Text>
        </View>

        <View style={styles.stats}>
          <Card style={styles.stat}><Text style={styles.statLabel}>Mileage</Text><Text style={styles.statValue}>67,420</Text><Text style={styles.statUnit}>mi</Text></Card>
          <Card style={styles.stat}><Text style={styles.statLabel}>Next service</Text><Text style={styles.statValue}>1,580</Text><Text style={styles.statUnit}>mi</Text></Card>
          <Card style={styles.stat}><Text style={styles.statLabel}>Fuel</Text><Text style={styles.statValueSmall}>Regular</Text><Text style={styles.statUnit}>preferred</Text></Card>
        </View>

        <PrimaryButton
          label="Request service"
          accent
          onPress={() => router.push('/(tabs)/request')}
        />

        <View style={{ marginTop: 24 }}><SectionTitle title="Maintenance" right="Demo history" /></View>
        {[['Oil & filter change', 'Completed · 64,980 mi', 'Done'], ['Brake inspection', 'Recommended within 30 days', 'Due soon'], ['Battery health check', 'Last checked 5 months ago', 'Good']].map(([name, meta, state]) => (
          <Card key={name} style={styles.maintenance}>
            <View style={styles.maintenanceDot} />
            <View style={{ flex: 1 }}><Text style={styles.maintenanceName}>{name}</Text><Text style={styles.maintenanceMeta}>{meta}</Text></View>
            <Text style={styles.maintenanceState}>{state}</Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 110 },
  kicker: { color: colors.violet, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 }, title: { marginTop: 5, color: colors.ink, fontSize: 29, fontWeight: '950', letterSpacing: -1.1 }, subtitle: { color: colors.muted, marginTop: 5, fontSize: 12 },
  carCard: { marginTop: 20, backgroundColor: colors.violetSoft, borderRadius: 28, padding: 20, minHeight: 180, justifyContent: 'flex-end', borderWidth: 1, borderColor: '#DDD4FA' }, carTop: { position: 'absolute', left: 20, right: 20, top: 18, flexDirection: 'row', justifyContent: 'space-between' }, carEmoji: { fontSize: 46 }, activePill: { alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }, activeText: { color: colors.ink, fontSize: 9, fontWeight: '950' }, vehicleLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, vehicleName: { marginTop: 4, color: colors.ink, fontSize: 30, fontWeight: '950' },
  stats: { flexDirection: 'row', gap: 8, marginVertical: 12 }, stat: { flex: 1, padding: 12, minHeight: 102 }, statLabel: { color: colors.muted, fontSize: 9, textTransform: 'uppercase', fontWeight: '800' }, statValue: { marginTop: 10, color: colors.ink, fontSize: 21, fontWeight: '950' }, statValueSmall: { marginTop: 12, color: colors.ink, fontSize: 14, fontWeight: '950' }, statUnit: { marginTop: 2, color: colors.muted, fontSize: 9 },
  maintenance: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9, padding: 13 }, maintenanceDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mint }, maintenanceName: { color: colors.ink, fontSize: 12, fontWeight: '900' }, maintenanceMeta: { color: colors.muted, fontSize: 10, marginTop: 3 }, maintenanceState: { fontSize: 10, fontWeight: '900', color: colors.ink },
});
