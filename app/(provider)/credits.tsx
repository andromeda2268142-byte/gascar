import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';
import { loadOwnedProviderBusiness, type ProviderBusiness } from '@/lib/provider';
import { useAuth } from '@/providers/auth';

type LedgerEntry = {
  id: string;
  delta: number;
  balance_after: number;
  kind: string;
  reason: string | null;
  lead_id: string | null;
  created_at: string;
};

export default function ProviderCreditsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
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
      const supabase = getSupabaseClient();

      const [walletResult, ledgerResult] = await Promise.all([
        supabase
          .from('gascars_wallets')
          .select('balance')
          .eq('business_id', ownedBusiness.id)
          .maybeSingle(),
        supabase
          .from('gascars_wallet_ledger')
          .select('id,delta,balance_after,kind,reason,lead_id,created_at')
          .eq('business_id', ownedBusiness.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (ledgerResult.error) throw ledgerResult.error;

      setBalance(walletResult.data?.balance ?? 0);
      setLedger((ledgerResult.data ?? []) as LedgerEntry[]);
    } catch (error) {
      Alert.alert('Could not load credits', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !business) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loading}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  if (!business) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>PROVIDER CREDITS</Text>
        <Text style={styles.title}>Lead balance.</Text>
        <Text style={styles.subtitle}>Credits are used when your business accepts a matched customer lead.</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>AVAILABLE CREDITS</Text>
          <Text style={styles.balanceValue}>{balance}</Text>
          <Text style={styles.balanceText}>Each lead shows its credit cost before you accept it.</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Development testing</Text>
          <Text style={styles.infoText}>During testing, the admin can grant credits from the Admin Portal. Production purchases and billing will be connected later.</Text>
        </View>

        <Text style={styles.sectionTitle}>Recent activity</Text>

        {ledger.length ? ledger.map((entry) => (
          <View key={entry.id} style={styles.ledgerRow}>
            <View style={[styles.deltaBadge, entry.delta >= 0 ? styles.deltaPositive : styles.deltaNegative]}>
              <Text style={styles.deltaText}>{entry.delta >= 0 ? '+' : ''}{entry.delta}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryTitle}>{entry.reason || entry.kind}</Text>
              <Text style={styles.entryMeta}>{entry.kind} · {new Date(entry.created_at).toLocaleDateString()}</Text>
            </View>
            <View style={styles.afterWrap}>
              <Text style={styles.afterValue}>{entry.balance_after}</Text>
              <Text style={styles.afterLabel}>after</Text>
            </View>
          </View>
        )) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No credit activity yet</Text>
            <Text style={styles.emptyText}>Admin grants and accepted leads will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 120 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '950', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '950', letterSpacing: -1.1, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  balanceCard: { marginTop: 20, borderRadius: 24, backgroundColor: colors.ink, padding: 20 },
  balanceLabel: { color: '#BFC2B9', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8 },
  balanceValue: { color: colors.lime, fontSize: 48, lineHeight: 52, fontWeight: '950', marginTop: 7 },
  balanceText: { color: '#C9CBC4', fontSize: 10.5, lineHeight: 16, marginTop: 4, maxWidth: 320 },
  infoCard: { marginTop: 12, borderRadius: 18, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', padding: 14 },
  infoTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  infoText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '950', marginTop: 24, marginBottom: 10 },
  ledgerRow: { minHeight: 70, borderRadius: 17, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  deltaBadge: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deltaPositive: { backgroundColor: colors.limeSoft },
  deltaNegative: { backgroundColor: colors.coralSoft },
  deltaText: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  entryTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '900' },
  entryMeta: { color: colors.muted, fontSize: 9, marginTop: 3, textTransform: 'capitalize' },
  afterWrap: { alignItems: 'flex-end' },
  afterValue: { color: colors.ink, fontSize: 14, fontWeight: '950' },
  afterLabel: { color: colors.muted, fontSize: 8, marginTop: 1 },
  emptyCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 16 },
  emptyTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
});
