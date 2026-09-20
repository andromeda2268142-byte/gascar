import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { loadOwnedProviderBusiness, serviceModeLabel, type ProviderBusiness } from '@/lib/provider';
import { useAuth } from '@/providers/auth';

type Lead = {
  id: string;
  service: string | null;
  service_location: 'shop' | 'mobile' | 'either';
  issue_description: string;
  preferred_time: string | null;
  zip: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  status: 'open' | 'accepted' | 'in_progress' | 'completed' | 'closed' | 'cancelled' | 'expired';
  credit_cost: number;
  accepted_business_id: string | null;
  created_at: string;
};

type Contact = {
  lead_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  preferred_contact_method: 'app' | 'phone' | 'email';
};

type Filter = 'available' | 'active' | 'completed';
type Notice = {
  kind: 'error' | 'success' | 'info';
  title: string;
  text: string;
  action?: 'credits';
};

function makeRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function friendlyLeadError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('not enough credits')) {
    return {
      kind: 'error' as const,
      title: 'Not enough credits',
      text: 'Add credits before accepting this lead. Your balance updates automatically after a successful credit purchase.',
      action: 'credits' as const,
    };
  }

  if (normalized.includes('no longer available')) {
    return {
      kind: 'info' as const,
      title: 'Lead already taken or expired',
      text: 'This lead is no longer available. The list has been refreshed.',
    };
  }

  if (normalized.includes('approved')) {
    return {
      kind: 'error' as const,
      title: 'Provider approval required',
      text: 'Your provider account must be active and verified before accepting leads.',
    };
  }

  if (normalized.includes('service area')) {
    return {
      kind: 'error' as const,
      title: 'Outside your service area',
      text: 'This request no longer matches the ZIP coverage configured for your business.',
    };
  }

  if (normalized.includes('services or service mode')) {
    return {
      kind: 'error' as const,
      title: 'Service no longer matches',
      text: 'Review your Services tab. This lead does not match your current service or Shop/Mobile settings.',
    };
  }

  return {
    kind: 'error' as const,
    title: 'Could not accept lead',
    text: message || 'Please refresh and try again.',
  };
}

export default function ProviderLeadsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [credits, setCredits] = useState(0);
  const [filter, setFilter] = useState<Filter>('available');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');

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

      const [leadsResult, walletResult] = await Promise.all([
        supabase
          .from('gascars_leads')
          .select('id,service,service_location,issue_description,preferred_time,zip,pickup_address,destination_address,status,credit_cost,accepted_business_id,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('gascars_wallets')
          .select('balance')
          .eq('business_id', ownedBusiness.id)
          .maybeSingle(),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (walletResult.error) throw walletResult.error;

      const nextLeads = (leadsResult.data ?? []) as Lead[];
      setLeads(nextLeads);
      setCredits(walletResult.data?.balance ?? 0);

      const acceptedIds = nextLeads
        .filter((lead) => lead.accepted_business_id === ownedBusiness.id && lead.status !== 'open')
        .map((lead) => lead.id);

      if (acceptedIds.length) {
        const { data: contactRows, error: contactError } = await supabase
          .from('gascars_lead_contacts')
          .select('lead_id,contact_name,contact_phone,contact_email,pickup_address,destination_address,preferred_contact_method')
          .in('lead_id', acceptedIds);

        if (contactError) throw contactError;

        const nextContacts: Record<string, Contact> = {};
        for (const row of contactRows ?? []) nextContacts[row.lead_id] = row as Contact;
        setContacts(nextContacts);
      } else {
        setContacts({});
      }
    } catch (error) {
      if (!silent) {
        setNotice({
          kind: 'error',
          title: 'Could not load leads',
          text: error instanceof Error ? error.message : 'Please try again.',
        });
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
      .channel('provider-live-' + business.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_leads' },
        () => void load(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_wallets', filter: 'business_id=eq.' + business.id },
        () => void load(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_businesses', filter: 'id=eq.' + business.id },
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

  const visibleLeads = useMemo(() => {
    if (filter === 'available') return leads.filter((lead) => lead.status === 'open');
    if (filter === 'active') return leads.filter((lead) => ['accepted', 'in_progress'].includes(lead.status));
    return leads.filter((lead) => lead.status === 'completed');
  }, [filter, leads]);

  async function acceptLead(lead: Lead) {
    if (!business) return;

    if (credits < lead.credit_cost) {
      setNotice({
        kind: 'error',
        title: 'Not enough credits',
        text: 'This lead costs ' + lead.credit_cost + ' credits and your balance is ' + credits + '. Add credits to continue.',
        action: 'credits',
      });
      return;
    }

    setWorkingId(lead.id);
    setNotice(null);

    try {
      const { error } = await getSupabaseClient().rpc('gascars_provider_accept_lead', {
        p_lead_id: lead.id,
        p_request_id: makeRequestId(),
      });

      if (error) throw error;

      setFilter('active');
      setNotice({
        kind: 'success',
        title: 'Lead accepted',
        text: 'Customer contact details are now unlocked for your business.',
      });
      void getSupabaseClient().functions.invoke('gascars-email-worker').catch(() => undefined);
      await load(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      setNotice(friendlyLeadError(message));
      await load(true);
    } finally {
      setWorkingId(null);
    }
  }

  async function setLeadStatus(lead: Lead, status: 'in_progress' | 'completed') {
    setWorkingId(lead.id);
    setNotice(null);

    try {
      const { error } = await getSupabaseClient().rpc('gascars_provider_set_lead_status', {
        p_lead_id: lead.id,
        p_status: status,
      });
      if (error) throw error;

      setNotice({
        kind: 'success',
        title: status === 'in_progress' ? 'Job started' : 'Job completed',
        text: status === 'in_progress'
          ? 'This lead moved to Active jobs.'
          : 'This job moved to Completed.',
      });
      await load(true);
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Could not update job',
        text: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setWorkingId(null);
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

  const activeBusiness = business.status === 'active' && business.is_verified;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.liveRow}>
              <Text style={styles.kicker}>PROVIDER LEADS</Text>
              <View style={[styles.livePill, liveStatus === 'live' ? styles.livePillOn : styles.livePillOff]}>
                <View style={[styles.liveDot, liveStatus === 'live' ? styles.liveDotOn : styles.liveDotOff]} />
                <Text style={styles.liveText}>{liveStatus === 'live' ? 'LIVE' : liveStatus === 'connecting' ? 'CONNECTING' : 'SYNCING'}</Text>
              </View>
            </View>
            <Text style={styles.title}>Matched work.</Text>
            <Text style={styles.subtitle}>New compatible leads and credit changes update automatically. A 15-second fallback refresh runs if realtime is interrupted.</Text>
          </View>
          <Pressable onPress={() => router.push('/(provider)/credits')} style={styles.creditPill}>
            <Text style={styles.creditValue}>{credits}</Text>
            <Text style={styles.creditLabel}>credits</Text>
          </Pressable>
        </View>

        {notice ? (
          <View style={[
            styles.notice,
            notice.kind === 'error' ? styles.noticeError : notice.kind === 'success' ? styles.noticeSuccess : styles.noticeInfo,
          ]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeText}>{notice.text}</Text>
            </View>
            {notice.action === 'credits' ? (
              <Pressable onPress={() => router.push('/(provider)/credits')} style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>Add credits</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setNotice(null)} hitSlop={8}>
                <Text style={styles.noticeClose}>×</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {!activeBusiness ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>Waiting for approval</Text>
            <Text style={styles.pendingText}>You can configure services now, but new leads stay hidden until this provider account is approved.</Text>
          </View>
        ) : null}

        <View style={styles.filters}>
          {([
            ['available', 'Available'],
            ['active', 'Active jobs'],
            ['completed', 'Completed'],
          ] as Array<[Filter, string]>).map(([value, label]) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filterButton, filter === value && styles.filterButtonActive]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {visibleLeads.length ? visibleLeads.map((lead) => {
          const contact = contacts[lead.id];
          const acceptedByThisBusiness = lead.accepted_business_id === business.id;
          const canAfford = credits >= lead.credit_cost;

          return (
            <View key={lead.id} style={styles.leadCard}>
              <View style={styles.leadTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leadService}>{lead.service || 'Service request'}</Text>
                  <Text style={styles.leadMeta}>ZIP {lead.zip || '—'} · {serviceModeLabel(lead.service_location)} · {lead.credit_cost} credits</Text>
                </View>
                <View style={[styles.statusPill, lead.status === 'open' ? styles.statusOpen : styles.statusActive]}>
                  <Text style={styles.statusText}>{lead.status.replaceAll('_', ' ').toUpperCase()}</Text>
                </View>
              </View>

              <Text style={styles.issue}>{lead.issue_description}</Text>
              {lead.preferred_time ? <Text style={styles.detail}>Preferred time: {lead.preferred_time}</Text> : null}

              {lead.status === 'open' ? (
                <View style={styles.lockedContact}>
                  <Text style={styles.lockedTitle}>Customer contact is locked</Text>
                  <Text style={styles.lockedText}>Accepting the lead unlocks the customer details for your business.</Text>
                </View>
              ) : acceptedByThisBusiness ? (
                <View style={styles.contactCard}>
                  <Text style={styles.contactKicker}>CUSTOMER</Text>
                  <Text style={styles.contactName}>{contact?.contact_name || 'Customer'}</Text>
                  {contact?.contact_phone ? <Text style={styles.contactLine}>Phone · {contact.contact_phone}</Text> : null}
                  {contact?.contact_email ? <Text style={styles.contactLine}>Email · {contact.contact_email}</Text> : null}
                  {(contact?.pickup_address || lead.pickup_address) ? <Text style={styles.contactLine}>Pickup · {contact?.pickup_address || lead.pickup_address}</Text> : null}
                  {(contact?.destination_address || lead.destination_address) ? <Text style={styles.contactLine}>Destination · {contact?.destination_address || lead.destination_address}</Text> : null}
                  <Text style={styles.preferredContact}>
                    Preferred contact · {(contact?.preferred_contact_method || 'app').toUpperCase()}
                  </Text>
                  <View style={styles.contactActions}>
                    {contact?.contact_phone ? (
                      <Pressable
                        onPress={() => void Linking.openURL('tel:' + contact.contact_phone)}
                        style={[
                          styles.contactAction,
                          contact.preferred_contact_method === 'phone' && styles.contactActionPreferred,
                        ]}
                      >
                        <Text style={[
                          styles.contactActionText,
                          contact.preferred_contact_method === 'phone' && styles.contactActionTextPreferred,
                        ]}>Call</Text>
                      </Pressable>
                    ) : null}

                    {contact?.contact_email ? (
                      <Pressable
                        onPress={() => void Linking.openURL(
                          'mailto:' + encodeURIComponent(contact.contact_email) +
                          '?subject=' + encodeURIComponent("Gas Car's · " + (lead.service || 'Service request')),
                        )}
                        style={[
                          styles.contactAction,
                          contact.preferred_contact_method === 'email' && styles.contactActionPreferred,
                        ]}
                      >
                        <Text style={[
                          styles.contactActionText,
                          contact.preferred_contact_method === 'email' && styles.contactActionTextPreferred,
                        ]}>Email</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() => router.push({ pathname: '/lead-chat', params: { leadId: lead.id } })}
                      style={[
                        styles.contactAction,
                        contact?.preferred_contact_method === 'app' && styles.contactActionPreferred,
                      ]}
                    >
                      <Text style={[
                        styles.contactActionText,
                        contact?.preferred_contact_method === 'app' && styles.contactActionTextPreferred,
                      ]}>Message</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {lead.status === 'open' && activeBusiness ? (
                <Pressable
                  disabled={workingId === lead.id}
                  onPress={() => canAfford ? void acceptLead(lead) : router.push('/(provider)/credits')}
                  style={({ pressed }) => [
                    canAfford ? styles.primaryButton : styles.creditButton,
                    (pressed || workingId === lead.id) && { opacity: 0.7 },
                  ]}
                >
                  {workingId === lead.id ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={canAfford ? styles.primaryButtonText : styles.creditButtonText}>
                      {canAfford
                        ? 'Accept lead · ' + lead.credit_cost + ' credits'
                        : 'Add credits · need ' + (lead.credit_cost - credits) + ' more'}
                    </Text>
                  )}
                </Pressable>
              ) : null}

              {lead.status === 'accepted' && acceptedByThisBusiness ? (
                <Pressable
                  disabled={workingId === lead.id}
                  onPress={() => void setLeadStatus(lead, 'in_progress')}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Start job</Text>
                </Pressable>
              ) : null}

              {lead.status === 'in_progress' && acceptedByThisBusiness ? (
                <Pressable
                  disabled={workingId === lead.id}
                  onPress={() => void setLeadStatus(lead, 'completed')}
                  style={styles.completeButton}
                >
                  <Text style={styles.completeButtonText}>Mark completed</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {filter === 'available' ? 'No available matched leads' : filter === 'active' ? 'No active jobs' : 'No completed jobs yet'}
            </Text>
            <Text style={styles.emptyText}>
              {activeBusiness
                ? 'Lead visibility updates automatically as customer requests match your services, work mode and ZIP.'
                : 'Finish your services and wait for admin approval.'}
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
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 18, paddingBottom: 120 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' },
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
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6, maxWidth: 520 },
  creditPill: { minWidth: 76, borderRadius: 17, backgroundColor: colors.limeSoft, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' },
  creditValue: { color: colors.ink, fontSize: 18, fontWeight: '950' },
  creditLabel: { color: colors.muted, fontSize: 8, marginTop: 1 },
  notice: { marginTop: 15, borderRadius: 17, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeError: { backgroundColor: '#FFF0EC', borderColor: '#F0B6A8' },
  noticeSuccess: { backgroundColor: colors.limeSoft, borderColor: '#D5E8AE' },
  noticeInfo: { backgroundColor: colors.violetSoft, borderColor: '#D8CFF7' },
  noticeTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  noticeText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  noticeButton: { minHeight: 36, borderRadius: 11, backgroundColor: colors.ink, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  noticeButtonText: { color: colors.lime, fontSize: 9, fontWeight: '950' },
  noticeClose: { color: colors.muted, fontSize: 22, lineHeight: 24 },
  pendingCard: { marginTop: 16, borderRadius: 17, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', padding: 13 },
  pendingTitle: { color: colors.ink, fontSize: 12, fontWeight: '950' },
  pendingText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  filters: { flexDirection: 'row', gap: 7, marginTop: 18, marginBottom: 13 },
  filterButton: { flex: 1, minHeight: 40, borderRadius: 13, backgroundColor: '#ECE9E0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  filterButtonActive: { backgroundColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 9.5, fontWeight: '900', textAlign: 'center' },
  filterTextActive: { color: colors.white },
  leadCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 15, marginBottom: 10 },
  leadTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  leadService: { color: colors.ink, fontSize: 14, fontWeight: '950' },
  leadMeta: { color: colors.muted, fontSize: 9.5, marginTop: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusOpen: { backgroundColor: colors.coralSoft },
  statusActive: { backgroundColor: colors.limeSoft },
  statusText: { color: colors.ink, fontSize: 7.5, fontWeight: '950' },
  issue: { color: colors.ink, fontSize: 11.5, lineHeight: 17, marginTop: 13 },
  detail: { color: colors.muted, fontSize: 9.5, marginTop: 6 },
  lockedContact: { marginTop: 13, borderRadius: 14, backgroundColor: '#F2F0E9', padding: 12 },
  lockedTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '900' },
  lockedText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  contactCard: { marginTop: 13, borderRadius: 15, backgroundColor: colors.mintSoft, borderWidth: 1, borderColor: '#C8EBDD', padding: 12 },
  contactKicker: { color: '#3E8E73', fontSize: 8, fontWeight: '950', letterSpacing: 0.8 },
  contactName: { color: colors.ink, fontSize: 12.5, fontWeight: '950', marginTop: 4 },
  contactLine: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  preferredContact: { color: '#3E8E73', fontSize: 8.5, fontWeight: '900', marginTop: 9 },
  contactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  contactAction: { minHeight: 38, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#BFDCCF', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  contactActionPreferred: { backgroundColor: colors.ink, borderColor: colors.ink },
  contactActionText: { color: colors.ink, fontSize: 9.5, fontWeight: '950' },
  contactActionTextPreferred: { color: colors.lime },
  primaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 12 },
  primaryButtonText: { color: colors.white, fontSize: 11.5, fontWeight: '950' },
  creditButton: { minHeight: 48, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 12 },
  creditButtonText: { color: colors.lime, fontSize: 11.5, fontWeight: '950' },
  completeButton: { minHeight: 48, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  completeButtonText: { color: colors.lime, fontSize: 11.5, fontWeight: '950' },
  emptyCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 19, padding: 18 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
});
