import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth';

const rows = [
  ['♥', 'Saved places', 'Favorites and preferred providers'],
  ['⛽', 'Fuel preferences', 'Regular · cheapest nearby'],
  ['◉', 'Notifications', 'Price alerts and service updates'],
  ['▣', 'Payments', 'Cards and receipts'],
  ['✓', 'Privacy & account', 'Location, data and security'],
];

function initials(email?: string) {
  if (!email) return 'GC';
  return email.slice(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading, configured, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>DRIVER PROFILE</Text>
        <Text style={styles.title}>Account</Text>

        {loading ? (
          <Card style={styles.loadingCard}><ActivityIndicator color={colors.coral} /></Card>
        ) : user ? (
          <>
            <Card style={styles.profileCard}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(user.email)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.user_metadata?.full_name || 'Gas Car’s Driver'}</Text>
                <Text style={styles.meta}>{user.email}</Text>
              </View>
            </Card>
            <View style={styles.accountAction}><PrimaryButton label="Sign out" onPress={() => void signOut()} /></View>
          </>
        ) : (
          <Card style={styles.guestCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>GC</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Continue with an account</Text>
              <Text style={styles.meta}>{configured ? 'Save your vehicles, leads and preferences.' : 'Account backend is ready; Expo environment setup is pending.'}</Text>
            </View>
            <View style={styles.signInWrap}><PrimaryButton label="Sign in" accent onPress={() => router.push('/auth')} /></View>
          </Card>
        )}

        <SectionTitle title="Preferences" />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map(([symbol, title, meta], index) => (
            <View key={title} style={[styles.row, index < rows.length - 1 && styles.rowBorder]}>
              <View style={styles.rowIcon}><Text style={styles.rowIconText}>{symbol}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowMeta}>{meta}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </View>
          ))}
        </Card>

        <View style={styles.guard}>
          <Text style={styles.guardTitle}>API cost protection</Text>
          <Text style={styles.guardText}>Production will use spending thresholds and alerts before paid fuel-search usage exceeds the agreed monthly budget.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 110 },
  kicker: { color: colors.mint, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 5, marginBottom: 18, color: colors.ink, fontSize: 32, fontWeight: '950', letterSpacing: -1.2 },
  loadingCard: { minHeight: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  guestCard: { gap: 13, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.coralSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.coral, fontSize: 17, fontWeight: '950' },
  name: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  accountAction: { marginTop: 9, marginBottom: 24 },
  signInWrap: { marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingHorizontal: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#F2F0E9', alignItems: 'center', justifyContent: 'center' },
  rowIconText: { color: colors.ink, fontWeight: '900' },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  rowMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  chevron: { color: '#A3A59E', fontSize: 25 },
  guard: { marginTop: 16, backgroundColor: colors.limeSoft, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#DDEABF' },
  guardTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  guardText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
});
