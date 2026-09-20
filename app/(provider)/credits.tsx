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

type CreditPackage = {
  id: string;
  slug: string;
  name: string;
  credits: number;
  price_cents: number;
  sort_order: number;
};

function makeRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function dollars(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

export default function ProviderCreditsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [devMode, setDevMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user) return;

    if (!silent) setLoading(true);
    try {
      const ownedBusiness = await loadOwnedProviderBusiness(user.id);
      if (!ownedBusiness) {
        router.replace('/business');
        return;
      }

      setBusiness(ownedBusiness);
      const supabase = getSupabaseClient();

      const [walletResult, ledgerResult, packagesResult, devResult] = await Promise.all([
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
        supabase
          .from('gascars_credit_packages')
          .select('id,slug,name,credits,price_cents,sort_order')
          .eq('active', true)
          .order('sort_order', { ascending: true }),
        supabase.rpc('gascars_dev_signup_status'),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      if (packagesResult.error) throw packagesResult.error;
      if (devResult.error) throw devResult.error;

      setBalance(walletResult.data?.balance ?? 0);
      setLedger((ledgerResult.data ?? []) as LedgerEntry[]);
      setPackages((packagesResult.data ?? []) as CreditPackage[]);
      setDevMode(devResult.data === true);
    } catch (error) {
      if (!silent) {
        Alert.alert('Could not load credits', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!business) return;

    const supabase = getSupabaseClient();
    setLiveStatus('connecting');

    const channel = supabase
      .channel('provider-credits-' + business.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_wallets', filter: 'business_id=eq.' + business.id },
        () => void load(true),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gascars_wallet_ledger', filter: 'business_id=eq.' + business.id },
        () => void load(true),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveStatus('offline');
        else setLiveStatus('connecting');
      });

    const fallback = setInterval(() => {
      void load(true);
    }, 15000);

    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [business?.id, load]);

  async function simulatePurchase(pkg: CreditPackage) {
    setBuyingId(pkg.id);
    setMessage(null);

    try {
      const { data, error } = await getSupabaseClient().rpc('gascars_dev_purchase_credit_package', {
        p_package_id: pkg.id,
        p_request_id: makeRequestId(),
      });

      if (error) throw error;

      const result = data as { ok?: boolean; balance?: number } | null;
      if (!result?.ok) throw new Error('The test purchase could not be completed.');

      setMessage(pkg.credits + ' credits were added. New balance: ' + String(result.balance ?? balance + pkg.credits) + '.');
      await load(true);
    } catch (error) {
      Alert.alert('Credit purchase failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBuyingId(null);
    }
  }

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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.liveRow}>
              <Text style={styles.kicker}>PROVIDER CREDITS</Text>
              <View style={[styles.livePill, liveStatus === 'live' ? styles.livePillOn : styles.livePillOff]}>
                <View style={[styles.liveDot, liveStatus === 'live' ? styles.liveDotOn : styles.liveDotOff]} />
                <Text style={styles.liveText}>{liveStatus === 'live' ? 'LIVE' : 'SYNCING'}</Text>
              </View>
            </View>
            <Text style={styles.title}>Lead balance.</Text>
            <Text style={styles.subtitle}>Your balance and ledger update automatically whenever credits are added or spent.</Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>AVAILABLE CREDITS</Text>
          <Text style={styles.balanceValue}>{balance}</Text>
          <Text style={styles.balanceText}>A lead can only be accepted when the wallet has enough credits for its listed cost.</Text>
        </View>

        {message ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Credits updated</Text>
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Credit packs</Text>
        <Text style={styles.sectionText}>
          Package pricing is stored in the backend, so it can be changed later without rebuilding the app.
        </Text>

        <View style={styles.packGrid}>
          {packages.map((pkg) => (
            <View key={pkg.id} style={styles.packCard}>
              <Text style={styles.packName}>{pkg.name}</Text>
              <Text style={styles.packCredits}>{pkg.credits}</Text>
              <Text style={styles.packUnit}>credits</Text>
              <Text style={styles.packPrice}>{dollars(pkg.price_cents)}</Text>

              {devMode ? (
                <Pressable
                  disabled={buyingId === pkg.id}
                  onPress={() => void simulatePurchase(pkg)}
                  style={({ pressed }) => [styles.buyButton, (pressed || buyingId === pkg.id) && { opacity: 0.7 }]}
                >
                  {buyingId === pkg.id
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.buyButtonText}>Test purchase</Text>}
                </Pressable>
              ) : (
                <View style={styles.paymentPending}>
                  <Text style={styles.paymentPendingText}>Stripe checkout not connected yet</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.architectureCard}>
          <Text style={styles.architectureTitle}>How production purchases will work</Text>
          <Text style={styles.architectureText}>
            Provider pays in Stripe → Stripe confirms payment to the server → the server writes a paid purchase → credits are added atomically → this screen updates live. The app never grants credits just because a client says payment succeeded.
          </Text>
        </View>

        {devMode ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Development simulator is ON</Text>
            <Text style={styles.infoText}>“Test purchase” adds the selected package immediately without charging a card. This is only for the temporary development backend.</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Recent activity</Text>

        {ledger.length ? ledger.map((entry) => (
          <View key={entry.id} style={styles.ledgerRow}>
            <View style={[styles.deltaBadge, entry.delta >= 0 ? styles.deltaPositive : styles.deltaNegative]}>
              <Text style={styles.deltaText}>{entry.delta >= 0 ? '+' : ''}{entry.delta}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryTitle}>{entry.reason || entry.kind}</Text>
              <Text style={styles.entryMeta}>{entry.kind} · {new Date(entry.created_at).toLocaleString()}</Text>
            </View>
            <View style={styles.afterWrap}>
              <Text style={styles.afterValue}>{entry.balance_after}</Text>
              <Text style={styles.afterLabel}>after</Text>
            </View>
          </View>
        )) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No credit activity yet</Text>
            <Text style={styles.emptyText}>Purchases, admin grants and accepted leads will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 18, paddingBottom: 120 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '950', letterSpacing: 1.5 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  livePillOn: { backgroundColor: colors.limeSoft },
  livePillOff: { backgroundColor: '#EEECE5' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotOn: { backgroundColor: '#5B9A2D' },
  liveDotOff: { backgroundColor: '#9B9D96' },
  liveText: { color: colors.ink, fontSize: 7.5, fontWeight: '950', letterSpacing: 0.5 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '950', letterSpacing: -1.1, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7, maxWidth: 560 },
  balanceCard: { marginTop: 20, borderRadius: 24, backgroundColor: colors.ink, padding: 20 },
  balanceLabel: { color: '#BFC2B9', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8 },
  balanceValue: { color: colors.lime, fontSize: 48, lineHeight: 52, fontWeight: '950', marginTop: 7 },
  balanceText: { color: '#C9CBC4', fontSize: 10.5, lineHeight: 16, marginTop: 4, maxWidth: 520 },
  successBox: { marginTop: 12, borderRadius: 17, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D5E8AE', padding: 13 },
  successTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  successText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '950', marginTop: 24, marginBottom: 5 },
  sectionText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginBottom: 10 },
  packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  packCard: { minWidth: 170, flexGrow: 1, flexBasis: '30%', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 15 },
  packName: { color: colors.coral, fontSize: 9, fontWeight: '950', letterSpacing: 0.7, textTransform: 'uppercase' },
  packCredits: { color: colors.ink, fontSize: 30, fontWeight: '950', marginTop: 9 },
  packUnit: { color: colors.muted, fontSize: 9, marginTop: 1 },
  packPrice: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 10 },
  buyButton: { minHeight: 43, borderRadius: 13, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  buyButtonText: { color: colors.white, fontSize: 10.5, fontWeight: '950' },
  paymentPending: { minHeight: 43, borderRadius: 13, backgroundColor: '#EEECE5', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 8 },
  paymentPendingText: { color: colors.muted, fontSize: 8.5, fontWeight: '800', textAlign: 'center' },
  architectureCard: { marginTop: 13, borderRadius: 18, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: '#D8CFF7', padding: 14 },
  architectureTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  architectureText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  infoCard: { marginTop: 12, borderRadius: 18, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', padding: 14 },
  infoTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  infoText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
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
