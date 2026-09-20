import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  loadOwnedProviderBusiness,
  providerTypeLabel,
  type ProviderBusiness,
} from '@/lib/provider';
import { useAuth } from '@/providers/auth';

type LeadPreview = {
  id: string;
  service: string | null;
  service_location: 'shop' | 'mobile' | 'either';
  zip: string | null;
  status: string;
  credit_cost: number;
  created_at: string;
};

export default function ProviderHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [leads, setLeads] = useState<LeadPreview[]>([]);
  const [credits, setCredits] = useState(0);
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
      const [servicesResult, leadsResult, walletResult] = await Promise.all([
        supabase
          .from('gascars_business_services')
          .select('service_id')
          .eq('business_id', ownedBusiness.id)
          .eq('active', true),
        supabase
          .from('gascars_leads')
          .select('id,service,service_location,zip,status,credit_cost,created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('gascars_wallets')
          .select('balance')
          .eq('business_id', ownedBusiness.id)
          .maybeSingle(),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (leadsResult.error) throw leadsResult.error;
      if (walletResult.error) throw walletResult.error;

      setServiceCount((servicesResult.data ?? []).length);
      setLeads((leadsResult.data ?? []) as LeadPreview[]);
      setCredits(walletResult.data?.balance ?? 0);
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

  const active = business.status === 'active' && business.is_verified;
  const location = [business.city, business.state, business.zip].filter(Boolean).join(', ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>PROVIDER PORTAL</Text>
            <Text style={styles.title}>{business.name}</Text>
            <Text style={styles.subtitle}>{providerTypeLabel(business.business_type)}{location ? ' · ' + location : ''}</Text>
          </View>
          <View style={[styles.statusPill, active ? styles.statusActive : styles.statusPending]}>
            <Text style={styles.statusText}>{active ? 'ACTIVE' : business.status.toUpperCase()}</Text>
          </View>
        </View>

        {!active ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>Business review in progress</Text>
            <Text style={styles.pendingText}>
              Configure your services now. Matched leads will appear after an administrator approves and verifies this provider account.
            </Text>
          </View>
        ) : null}

        <View style={styles.metrics}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>MATCHED LEADS</Text>
            <Text style={styles.metricValue}>{leads.filter((lead) => lead.status === 'open').length}</Text>
            <Text style={styles.metricMeta}>available now</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>SERVICES</Text>
            <Text style={styles.metricValue}>{serviceCount}</Text>
            <Text style={styles.metricMeta}>enabled</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>CREDITS</Text>
            <Text style={styles.metricValue}>{credits}</Text>
            <Text style={styles.metricMeta}>balance</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Run your business</Text>
        <View style={styles.actionsGrid}>
          <Pressable onPress={() => router.push('/(provider)/leads')} style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: colors.coralSoft }]}><Text style={styles.actionIconText}>↗</Text></View>
            <Text style={styles.actionTitle}>Matched leads</Text>
            <Text style={styles.actionText}>Only requests that match your services, service mode and ZIP coverage.</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(provider)/services')} style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: colors.limeSoft }]}><Text style={styles.actionIconText}>⚙</Text></View>
            <Text style={styles.actionTitle}>Services</Text>
            <Text style={styles.actionText}>Choose exactly what you offer and whether it is Shop, Mobile or Both.</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(provider)/credits')} style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: colors.sunSoft }]}><Text style={styles.actionIconText}>$</Text></View>
            <Text style={styles.actionTitle}>Credits</Text>
            <Text style={styles.actionText}>Review your lead-credit balance and recent activity.</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(provider)/account')} style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: colors.violetSoft }]}><Text style={styles.actionIconText}>●</Text></View>
            <Text style={styles.actionTitle}>Business account</Text>
            <Text style={styles.actionText}>Provider details, approval status and account controls.</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent lead activity</Text>
          <Pressable onPress={() => router.push('/(provider)/leads')}>
            <Text style={styles.seeAll}>View all</Text>
          </Pressable>
        </View>

        {leads.length ? leads.slice(0, 3).map((lead) => (
          <View key={lead.id} style={styles.leadCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.leadService}>{lead.service || 'Service request'}</Text>
              <Text style={styles.leadMeta}>ZIP {lead.zip || '—'} · {lead.service_location} · {lead.credit_cost} credits</Text>
            </View>
            <View style={styles.leadStatus}><Text style={styles.leadStatusText}>{lead.status.toUpperCase()}</Text></View>
          </View>
        )) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{active ? 'No matched leads yet' : 'Leads unlock after approval'}</Text>
            <Text style={styles.emptyText}>
              {active
                ? 'When a customer request matches your selected service, service mode and ZIP, it will appear here.'
                : 'Use this time to finish selecting the services your business actually performs.'}
            </Text>
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
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '950', letterSpacing: 1.5 },
  title: { marginTop: 5, color: colors.ink, fontSize: 31, lineHeight: 34, fontWeight: '950', letterSpacing: -1.2 },
  subtitle: { marginTop: 6, color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusActive: { backgroundColor: colors.limeSoft },
  statusPending: { backgroundColor: colors.sunSoft },
  statusText: { color: colors.ink, fontSize: 8, fontWeight: '950', letterSpacing: 0.6 },
  pendingCard: { marginTop: 18, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', borderRadius: 18, padding: 14 },
  pendingTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950' },
  pendingText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 18 },
  metricCard: { flex: 1, minHeight: 104, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 12 },
  metricLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  metricValue: { color: colors.ink, fontSize: 25, fontWeight: '950', marginTop: 10 },
  metricMeta: { color: colors.muted, fontSize: 8.5, marginTop: 2 },
  sectionHeader: { marginTop: 24, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '950', letterSpacing: -0.3, marginTop: 24, marginBottom: 10 },
  seeAll: { color: colors.coral, fontSize: 10.5, fontWeight: '900', marginTop: 14 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  actionCard: { flexGrow: 1, flexBasis: '45%', minWidth: 145, borderRadius: 19, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 14 },
  actionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionIconText: { color: colors.ink, fontSize: 17, fontWeight: '950' },
  actionTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950', marginTop: 10 },
  actionText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  leadCard: { minHeight: 72, borderRadius: 17, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  leadService: { color: colors.ink, fontSize: 12.5, fontWeight: '900' },
  leadMeta: { color: colors.muted, fontSize: 9.5, marginTop: 4 },
  leadStatus: { borderRadius: 999, backgroundColor: colors.limeSoft, paddingHorizontal: 8, paddingVertical: 5 },
  leadStatusText: { color: colors.ink, fontSize: 7.5, fontWeight: '950' },
  emptyCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 19, padding: 16 },
  emptyTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
});
