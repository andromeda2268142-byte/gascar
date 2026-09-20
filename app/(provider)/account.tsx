import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { loadOwnedProviderBusiness, providerTypeLabel, type ProviderBusiness } from '@/lib/provider';
import { useAuth } from '@/providers/auth';

export default function ProviderAccountScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const ownedBusiness = await loadOwnedProviderBusiness(user.id);
      if (!ownedBusiness) {
        router.replace('/business');
        return;
      }
      setBusiness(ownedBusiness);
    } catch (error) {
      Alert.alert('Could not load business account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await signOut();
    router.replace('/auth');
  }

  if (loading && !business) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loading}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  if (!business) return null;

  const active = business.status === 'active' && business.is_verified;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>PROVIDER ACCOUNT</Text>
        <Text style={styles.title}>{business.name}</Text>
        <Text style={styles.subtitle}>This is a provider account, separate from the regular driver experience.</Text>

        <View style={styles.identityCard}>
          <View style={styles.identityTop}>
            <View style={styles.logo}><Text style={styles.logoText}>{business.business_type === 'mechanic' ? '🔧' : business.business_type === 'towing' ? '🚚' : '⚙'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.businessName}>{business.name}</Text>
              <Text style={styles.businessType}>{providerTypeLabel(business.business_type)}</Text>
            </View>
            <View style={[styles.statusPill, active ? styles.statusActive : styles.statusPending]}>
              <Text style={styles.statusText}>{active ? 'ACTIVE' : business.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <InfoRow label="Account email" value={user?.email || '—'} />
          <InfoRow label="Business phone" value={business.phone || '—'} />
          <InfoRow label="Business email" value={business.email || '—'} />
          <InfoRow label="Address" value={[business.address, business.city, business.state, business.zip].filter(Boolean).join(', ') || '—'} />
          <InfoRow label="Service ZIPs" value={(business.service_zips ?? []).join(', ') || business.zip || '—'} />
        </View>

        <View style={styles.approvalCard}>
          <Text style={styles.approvalTitle}>{active ? 'Provider approved' : 'Provider review required'}</Text>
          <Text style={styles.approvalText}>
            {active
              ? 'This business can receive matched leads based on its services, work mode and coverage.'
              : 'You can finish configuring services while the account is pending, but matched leads stay hidden until approval.'}
          </Text>
        </View>

        <View style={styles.scopeCard}>
          <Text style={styles.scopeTitle}>Provider navigation</Text>
          <Text style={styles.scopeText}>This account does not use the driver Garage or Request Service tabs. Its workspace is focused on leads, services, credits and business operations.</Text>
        </View>

        <Pressable onPress={() => void logout()} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 120 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '950', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '950', letterSpacing: -1.1, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  identityCard: { marginTop: 20, borderRadius: 21, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 15 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 22 },
  businessName: { color: colors.ink, fontSize: 14, fontWeight: '950' },
  businessType: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusActive: { backgroundColor: colors.limeSoft },
  statusPending: { backgroundColor: colors.sunSoft },
  statusText: { color: colors.ink, fontSize: 7.5, fontWeight: '950' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 13 },
  infoRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EFECE4' },
  infoLabel: { color: colors.muted, fontSize: 8.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { color: colors.ink, fontSize: 11.5, fontWeight: '800', marginTop: 4 },
  approvalCard: { marginTop: 12, borderRadius: 18, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D9EAB8', padding: 14 },
  approvalTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  approvalText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  scopeCard: { marginTop: 10, borderRadius: 18, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: '#D8CFF7', padding: 14 },
  scopeTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  scopeText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  signOutButton: { minHeight: 50, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  signOutText: { color: colors.white, fontSize: 12, fontWeight: '950' },
});
