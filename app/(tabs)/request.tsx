import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';
import { services } from '@/data/mock';

export default function RequestScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>GET HELP</Text>
        <Text style={styles.title}>What does your car need?</Text>
        <Text style={styles.subtitle}>Start a request and connect with nearby automotive businesses.</Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroIcon}>⚡</Text>
          <View style={{ flex: 1 }}><Text style={styles.heroTitle}>Fast request</Text><Text style={styles.heroText}>Share the issue once. Nearby providers can respond with availability or a quote.</Text></View>
        </View>

        <SectionTitle title="Choose a service" />
        <View style={{ gap: 10 }}>
          {services.map((service) => (
            <Card key={service.title} style={styles.serviceCard}>
              <View style={styles.serviceIcon}><Text style={{ fontSize: 22 }}>{service.icon}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.serviceTitle}>{service.title}</Text><Text style={styles.serviceSubtitle}>{service.subtitle}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </Card>
          ))}
        </View>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton label="Start repair request" accent />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 110 },
  kicker: { color: colors.coral, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 5, color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '950', letterSpacing: -1.3 },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.muted },
  heroCard: { marginVertical: 22, backgroundColor: colors.limeSoft, borderRadius: 24, padding: 17, flexDirection: 'row', gap: 13, borderWidth: 1, borderColor: '#DBEABF' },
  heroIcon: { fontSize: 26 }, heroTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' }, heroText: { marginTop: 4, color: colors.muted, lineHeight: 18, fontSize: 12 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  serviceIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.coralSoft, alignItems: 'center', justifyContent: 'center' },
  serviceTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' }, serviceSubtitle: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16 }, chevron: { fontSize: 27, color: '#A5A79F' },
});
