import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

const rows = [
  ['♥', 'Saved places', 'Favorites and preferred providers'],
  ['⛽', 'Fuel preferences', 'Regular · cheapest nearby'],
  ['◉', 'Notifications', 'Price alerts and service updates'],
  ['▣', 'Payments', 'Cards and receipts'],
  ['✓', 'Privacy & account', 'Location, data and security'],
];

type ServiceHistoryItem = {
  id: string;
  service: string | null;
  status: string;
  accepted_business_id: string | null;
  customer_archived_at: string | null;
  created_at: string;
  updated_at: string;
  provider_name?: string | null;
};

function initials(email?: string) {
  if (!email) return 'GC';
  return email.slice(0, 2).toUpperCase();
}

function statusLabel(status: string) {
  if (status === 'in_progress') return 'In progress';
  if (status === 'accepted') return 'Accepted';
  if (status === 'completed') return 'Completed';
  if (status === 'open') return 'Waiting';
  return status.replaceAll('_', ' ');
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading, configured, signOut } = useAuth();
  const [history, setHistory] = useState<ServiceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: leads, error } = await supabase
        .from('gascars_leads')
        .select('id,service,status,accepted_business_id,customer_archived_at,created_at,updated_at')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      const businessIds = Array.from(
        new Set((leads ?? []).map((lead) => lead.accepted_business_id).filter(Boolean)),
      ) as string[];

      const names = new Map<string, string>();
      if (businessIds.length) {
        const { data: businesses } = await supabase
          .from('gascars_businesses')
          .select('id,name')
          .in('id', businessIds);

        for (const business of businesses ?? []) names.set(business.id, business.name);
      }

      setHistory(
        (leads ?? []).map((lead) => ({
          ...lead,
          provider_name: lead.accepted_business_id
            ? names.get(lead.accepted_business_id) ?? null
            : null,
        })) as ServiceHistoryItem[],
      );
    } catch (error) {
      Alert.alert('Could not load service history', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadHistory();

    if (!user || !isSupabaseConfigured) return;
    const supabase = getSupabaseClient();

    const channel = supabase
      .channel('driver-service-history-' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_leads', filter: 'customer_id=eq.' + user.id },
        () => void loadHistory(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadHistory, user]);

  async function restoreToCurrent(item: ServiceHistoryItem) {
    if (workingId) return;

    setWorkingId(item.id);
    try {
      const { error } = await getSupabaseClient().rpc('gascars_customer_set_case_archived', {
        p_lead_id: item.id,
        p_archived: false,
        p_reason: null,
      });

      if (error) throw error;
      await loadHistory();
      router.push('/(tabs)/request');
    } catch (error) {
      Alert.alert('Could not restore service', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorkingId(null);
    }
  }

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

        {user ? (
          <View style={styles.historySection}>
            <SectionTitle title="Service history" right={historyLoading ? 'Syncing…' : undefined} />
            {history.length ? (
              <View style={styles.historyList}>
                {history.map((item) => (
                  <View key={item.id} style={styles.historyCard}>
                    <Pressable
                      disabled={!item.accepted_business_id}
                      onPress={() => item.accepted_business_id
                        ? router.push({ pathname: '/lead-chat', params: { leadId: item.id } })
                        : undefined}
                      style={styles.historyMain}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyService}>{item.service || 'Service request'}</Text>
                        <Text style={styles.historyProvider}>
                          {item.provider_name || (item.accepted_business_id ? 'Matched provider' : 'No provider yet')}
                        </Text>
                        <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                      </View>
                      <View style={[
                        styles.statusPill,
                        item.status === 'completed'
                          ? styles.statusDone
                          : item.status === 'in_progress'
                            ? styles.statusActive
                            : item.status === 'accepted'
                              ? styles.statusAccepted
                              : styles.statusWaiting,
                      ]}>
                        <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
                      </View>
                    </Pressable>

                    {item.customer_archived_at ? (
                      <View style={styles.archivedRow}>
                        <Text style={styles.archivedText}>Hidden from Current Service</Text>
                        {['accepted', 'in_progress'].includes(item.status) ? (
                          <Pressable
                            disabled={workingId === item.id}
                            onPress={() => void restoreToCurrent(item)}
                            style={({ pressed }) => [styles.restoreButton, (pressed || workingId === item.id) && { opacity: 0.6 }]}
                          >
                            <Text style={styles.restoreButtonText}>
                              {workingId === item.id ? 'Restoring…' : 'Show again'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Card style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryTitle}>No service history yet</Text>
                <Text style={styles.emptyHistoryText}>Requests you create will appear here.</Text>
              </Card>
            )}
          </View>
        ) : null}

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
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 18, paddingBottom: 110 },
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
  historySection: { marginBottom: 24 },
  historyList: { gap: 8 },
  historyCard: { borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  historyMain: { minHeight: 82, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyService: { color: colors.ink, fontSize: 12.5, fontWeight: '950' },
  historyProvider: { color: colors.muted, fontSize: 9.5, marginTop: 4 },
  historyDate: { color: '#A0A39B', fontSize: 8.5, marginTop: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusWaiting: { backgroundColor: colors.sunSoft },
  statusAccepted: { backgroundColor: colors.violetSoft },
  statusActive: { backgroundColor: colors.coralSoft },
  statusDone: { backgroundColor: colors.limeSoft },
  statusText: { color: colors.ink, fontSize: 8, fontWeight: '950', textTransform: 'uppercase' },
  archivedRow: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#F8F6F0', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  archivedText: { color: colors.muted, fontSize: 8.5, fontWeight: '800' },
  restoreButton: { minHeight: 32, borderRadius: 10, backgroundColor: colors.ink, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  restoreButtonText: { color: colors.lime, fontSize: 8.5, fontWeight: '950' },
  emptyHistory: { marginBottom: 4 },
  emptyHistoryTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  emptyHistoryText: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
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
