import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';

export default function BusinessScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.kicker}>BUSINESS PORTAL</Text>
        <Text style={styles.title}>Turn local demand into customers.</Text>
        <Text style={styles.subtitle}>Demo dashboard for mechanics, towing companies and future automotive partners.</Text>
        <View style={styles.metrics}>
          <Card style={styles.metric}><Text style={styles.metricLabel}>New leads</Text><Text style={styles.metricValue}>12</Text></Card>
          <Card style={styles.metric}><Text style={styles.metricLabel}>Unlocked</Text><Text style={styles.metricValue}>7</Text></Card>
          <Card style={styles.metric}><Text style={styles.metricLabel}>Est. ROI</Text><Text style={styles.metricValue}>3.4×</Text></Card>
        </View>
        <SectionTitle title="New lead" right="2 min ago" />
        <Card>
          <Text style={styles.leadType}>BRAKE SERVICE</Text>
          <Text style={styles.leadTitle}>2019 Toyota Camry · Dallas 75201</Text>
          <Text style={styles.leadText}>Grinding sound while braking. Customer prefers service today.</Text>
          <View style={styles.locked}><Text style={styles.lockedText}>Contact details locked · 1 lead credit</Text></View>
          <PrimaryButton label="Unlock lead" accent />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 30 }, back: { color: colors.muted, fontWeight: '800', fontSize: 13, marginBottom: 24 }, kicker: { color: colors.coral, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 }, title: { marginTop: 6, color: colors.ink, fontSize: 33, lineHeight: 36, fontWeight: '950', letterSpacing: -1.4 }, subtitle: { color: colors.muted, marginTop: 10, fontSize: 13, lineHeight: 20 }, metrics: { flexDirection: 'row', gap: 8, marginVertical: 22 }, metric: { flex: 1, minHeight: 96, padding: 12 }, metricLabel: { color: colors.muted, fontSize: 9, textTransform: 'uppercase', fontWeight: '800' }, metricValue: { color: colors.ink, fontSize: 23, fontWeight: '950', marginTop: 13 }, leadType: { color: colors.coral, fontSize: 9, letterSpacing: 1.2, fontWeight: '950' }, leadTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 8 }, leadText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, locked: { backgroundColor: '#F2F0E9', borderRadius: 13, padding: 11, marginVertical: 15 }, lockedText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
});
