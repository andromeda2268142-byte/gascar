import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  filterServices,
  loadServiceCatalog,
  type BusinessServiceMode,
  type ServiceCatalogItem,
  type ServiceCategory,
} from '@/lib/services';
import { useAuth } from '@/providers/auth';

type Business = {
  id: string;
  name: string;
  business_type: 'mechanic' | 'towing' | 'parts';
  status: 'pending' | 'active' | 'suspended';
};

type Lead = {
  id: string;
  service: string | null;
  service_location: 'shop' | 'mobile' | 'either';
  issue_description: string;
  zip: string | null;
  created_at: string;
};

const modes: Array<{ value: BusinessServiceMode; label: string }> = [
  { value: 'shop', label: 'Shop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'both', label: 'Both' },
];

export default function BusinessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<'mechanic' | 'towing' | 'parts'>('mechanic');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState(user?.email ?? '');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [businessZip, setBusinessZip] = useState('');
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [offerings, setOfferings] = useState<Record<string, BusinessServiceMode>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadBusinessData = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: businessData, error: businessError } = await supabase
        .from('gascars_businesses')
        .select('id, name, business_type, status')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (businessError) throw businessError;

      const nextBusiness = businessData as Business | null;
      setBusiness(nextBusiness);

      if (!nextBusiness) {
        setCatalog([]);
        setOfferings({});
        setLeads([]);
        return;
      }

      if (nextBusiness.business_type === 'parts') {
        setCatalog([]);
        setOfferings({});
        setLeads([]);
        return;
      }

      const category: ServiceCategory = nextBusiness.business_type === 'towing' ? 'towing' : 'repair';

      const [services, offeringResult, leadsResult] = await Promise.all([
        loadServiceCatalog(category),
        supabase
          .from('gascars_business_services')
          .select('service_id, service_mode')
          .eq('business_id', nextBusiness.id)
          .eq('active', true),
        supabase
          .from('gascars_leads')
          .select('id, service, service_location, issue_description, zip, created_at')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (offeringResult.error) throw offeringResult.error;
      if (leadsResult.error) throw leadsResult.error;

      const nextOfferings: Record<string, BusinessServiceMode> = {};
      for (const row of offeringResult.data ?? []) {
        nextOfferings[row.service_id] = row.service_mode as BusinessServiceMode;
      }

      setCatalog(services);
      setOfferings(nextOfferings);
      setLeads((leadsResult.data ?? []) as Lead[]);
    } catch (error) {
      Alert.alert('Could not load business portal', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadBusinessData();
  }, [loadBusinessData]);

  const visibleServices = useMemo(
    () => filterServices(catalog, serviceSearch),
    [catalog, serviceSearch],
  );

  async function createBusiness() {
    if (!user) {
      router.push('/auth');
      return;
    }

    if (!businessName.trim()) {
      Alert.alert('Business name required', 'Enter the public business name.');
      return;
    }

    if (!businessPhone.trim()) {
      Alert.alert('Business phone required', 'Add a phone number customers and Gas Car’s can use for this business.');
      return;
    }

    if (!businessZip.trim()) {
      Alert.alert('ZIP code required', 'Add the primary ZIP code for this business.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await getSupabaseClient().rpc('gascars_create_business_profile', {
        p_business_type: businessType,
        p_name: businessName.trim(),
        p_phone: businessPhone.trim(),
        p_email: businessEmail.trim() || null,
        p_address: businessAddress.trim() || null,
        p_city: businessCity.trim() || null,
        p_state: businessState.trim() || null,
        p_zip: businessZip.trim(),
      });

      if (error) throw error;
      await loadBusinessData();
    } catch (error) {
      Alert.alert('Could not create business profile', error instanceof Error ? error.message : 'Please try again.');
      setLoading(false);
    }
  }

  async function toggleService(service: ServiceCatalogItem) {
    if (!business) return;

    setSavingId(service.id);
    try {
      const supabase = getSupabaseClient();
      const current = offerings[service.id];

      if (current) {
        const { error } = await supabase
          .from('gascars_business_services')
          .delete()
          .eq('business_id', business.id)
          .eq('service_id', service.id);
        if (error) throw error;

        setOfferings((state) => {
          const next = { ...state };
          delete next[service.id];
          return next;
        });
      } else {
        const defaultMode: BusinessServiceMode = business.business_type === 'towing' ? 'mobile' : 'shop';
        const { error } = await supabase.from('gascars_business_services').insert({
          business_id: business.id,
          service_id: service.id,
          service_mode: defaultMode,
          active: true,
        });
        if (error) throw error;
        setOfferings((state) => ({ ...state, [service.id]: defaultMode }));
      }

      const { data: refreshedLeads, error: leadsError } = await supabase
        .from('gascars_leads')
        .select('id, service, service_location, issue_description, zip, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20);

      if (leadsError) throw leadsError;
      setLeads((refreshedLeads ?? []) as Lead[]);
    } catch (error) {
      Alert.alert('Could not update service', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  async function changeMode(serviceId: string, mode: BusinessServiceMode) {
    if (!business || !offerings[serviceId]) return;

    setSavingId(serviceId);
    try {
      const { error } = await getSupabaseClient()
        .from('gascars_business_services')
        .update({ service_mode: mode })
        .eq('business_id', business.id)
        .eq('service_id', serviceId);

      if (error) throw error;
      setOfferings((state) => ({ ...state, [serviceId]: mode }));
      await loadBusinessData();
    } catch (error) {
      Alert.alert('Could not update service mode', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loading}><ActivityIndicator color={colors.coral} /></View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.kicker}>BUSINESS PORTAL</Text>
          <Text style={styles.title}>Sign in first.</Text>
          <Text style={styles.subtitle}>Business services and matched leads are tied to a verified account.</Text>
          <View style={styles.action}><PrimaryButton label="Sign in" accent onPress={() => router.push('/auth')} /></View>
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
          <Text style={styles.kicker}>BUSINESS PORTAL</Text>
          <Text style={styles.title}>Set up your business.</Text>
          <Text style={styles.subtitle}>Complete the provider profile. It will remain pending until an administrator approves the business.</Text>

          <Card style={styles.setupCard}>
            <Text style={styles.label}>Business name</Text>
            <TextInput value={businessName} onChangeText={setBusinessName} placeholder="Example: Valdy Auto Care" placeholderTextColor="#A1A39C" style={styles.input} />

            <Text style={styles.label}>Business type</Text>
            <View style={styles.typeRow}>
              <Pressable onPress={() => setBusinessType('mechanic')} style={[styles.typeButton, businessType === 'mechanic' && styles.typeButtonActive]}>
                <Text style={[styles.typeText, businessType === 'mechanic' && styles.typeTextActive]}>🔧 Mechanic</Text>
              </Pressable>
              <Pressable onPress={() => setBusinessType('towing')} style={[styles.typeButton, businessType === 'towing' && styles.typeButtonActive]}>
                <Text style={[styles.typeText, businessType === 'towing' && styles.typeTextActive]}>🚚 Towing</Text>
              </Pressable>
              <Pressable onPress={() => setBusinessType('parts')} style={[styles.typeButton, businessType === 'parts' && styles.typeButtonActive]}>
                <Text style={[styles.typeText, businessType === 'parts' && styles.typeTextActive]}>⚙ Parts</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Business phone</Text>
            <TextInput value={businessPhone} onChangeText={setBusinessPhone} placeholder="(555) 555-5555" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="phone-pad" />

            <Text style={styles.label}>Business email</Text>
            <TextInput value={businessEmail} onChangeText={setBusinessEmail} placeholder="service@business.com" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>Street address</Text>
            <TextInput value={businessAddress} onChangeText={setBusinessAddress} placeholder="123 Main St" placeholderTextColor="#A1A39C" style={styles.input} />

            <View style={styles.cityStateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>City</Text>
                <TextInput value={businessCity} onChangeText={setBusinessCity} placeholder="Dallas" placeholderTextColor="#A1A39C" style={styles.input} />
              </View>
              <View style={styles.stateField}>
                <Text style={styles.label}>State</Text>
                <TextInput value={businessState} onChangeText={setBusinessState} placeholder="TX" placeholderTextColor="#A1A39C" style={styles.input} autoCapitalize="characters" maxLength={2} />
              </View>
            </View>

            <Text style={styles.label}>Primary ZIP code</Text>
            <TextInput value={businessZip} onChangeText={setBusinessZip} placeholder="75201" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="number-pad" />

            <View style={styles.pendingSetupNote}>
              <Text style={styles.pendingSetupTitle}>What happens next?</Text>
              <Text style={styles.pendingSetupText}>
                After this profile is created, mechanics and towing companies select the exact services they offer and whether each service is Shop, Mobile or Both. The business stays Pending until admin approval.
              </Text>
            </View>

            <PrimaryButton label="Continue to services" accent onPress={createBusiness} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>

        <View style={styles.businessHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>BUSINESS PORTAL</Text>
            <Text style={styles.title}>{business.name}</Text>
            <Text style={styles.subtitle}>
              {business.business_type === 'mechanic' ? 'Mechanic' : 'Towing'} · {business.status === 'active' ? 'Active' : 'Pending approval'}
            </Text>
          </View>
          <View style={[styles.statusPill, business.status === 'active' && styles.statusActive]}>
            <Text style={styles.statusText}>{business.status.toUpperCase()}</Text>
          </View>
        </View>

        {business.status !== 'active' ? (
          <View style={styles.pendingNotice}>
            <Text style={styles.pendingTitle}>You can configure services now.</Text>
            <Text style={styles.pendingText}>Matched leads will begin appearing after this business is approved and active.</Text>
          </View>
        ) : null}

        {business.business_type === 'parts' ? (
          <Card style={styles.partsCard}>
            <Text style={styles.partsTitle}>Auto parts business profile created</Text>
            <Text style={styles.partsText}>Your store is pending approval. Inventory and parts-specific marketplace controls will live here as that workflow is connected.</Text>
          </Card>
        ) : (
          <>
        <SectionTitle title="Services I offer" right={String(Object.keys(offerings).length) + ' selected'} />
        <Card style={styles.servicesCard}>
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput value={serviceSearch} onChangeText={setServiceSearch} placeholder="Search services..." placeholderTextColor="#A1A39C" style={styles.searchInput} />
          </View>

          <Text style={styles.explainer}>
            A lead is shown to you only when its service matches one you selected and its requested location matches your service mode.
          </Text>

          {visibleServices.map((service) => {
            const selectedMode = offerings[service.id];
            const selected = Boolean(selectedMode);
            const busy = savingId === service.id;

            return (
              <View key={service.id} style={styles.serviceRow}>
                <Pressable onPress={() => void toggleService(service)} style={styles.serviceMain} disabled={busy}>
                  <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                    <Text style={styles.checkboxText}>{selected ? '✓' : ''}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.serviceMeta}>{service.group_name || 'Service'}</Text>
                  </View>
                  {busy ? <ActivityIndicator size="small" color={colors.coral} /> : null}
                </Pressable>

                {selected && business.business_type === 'mechanic' ? (
                  <View style={styles.modeRow}>
                    {modes.map((mode) => {
                      const active = selectedMode === mode.value;
                      return (
                        <Pressable key={mode.value} onPress={() => void changeMode(service.id, mode.value)} style={[styles.modeButton, active && styles.modeButtonActive]}>
                          <Text style={[styles.modeText, active && styles.modeTextActive]}>{mode.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : selected ? (
                  <View style={styles.mobileOnly}><Text style={styles.mobileOnlyText}>📍 Mobile / roadside</Text></View>
                ) : null}
              </View>
            );
          })}
        </Card>

        <View style={styles.sectionGap}>
          <SectionTitle title="Matched leads" right={business.status === 'active' ? String(leads.length) + ' available' : 'Waiting for approval'} />
        </View>

        {leads.length ? (
          leads.map((lead) => (
            <Card key={lead.id} style={styles.leadCard}>
              <Text style={styles.leadType}>{(lead.service || 'SERVICE').toUpperCase()}</Text>
              <Text style={styles.leadTitle}>{lead.zip ? 'ZIP ' + lead.zip : 'Nearby request'}</Text>
              <Text style={styles.leadMode}>
                {lead.service_location === 'mobile' ? '📍 Customer needs mobile service' : lead.service_location === 'shop' ? '🏪 Customer will come to shop' : '↔ Either location works'}
              </Text>
              <Text style={styles.leadText}>{lead.issue_description}</Text>
              <View style={styles.locked}><Text style={styles.lockedText}>Contact details remain locked until the lead is unlocked.</Text></View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyLead}>
            <Text style={styles.emptyLeadTitle}>No matched leads yet</Text>
            <Text style={styles.emptyLeadText}>Only leads that match your selected services and service mode will appear here.</Text>
          </Card>
        )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerContent: { flex: 1, padding: 22, justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 50 },
  back: { color: colors.muted, fontWeight: '800', fontSize: 13, marginBottom: 22 },
  kicker: { color: colors.coral, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 6, color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '950', letterSpacing: -1.3 },
  subtitle: { color: colors.muted, marginTop: 8, fontSize: 13, lineHeight: 19 },
  action: { marginTop: 20 },
  businessHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 22 },
  statusPill: { backgroundColor: colors.sunSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusActive: { backgroundColor: colors.limeSoft },
  statusText: { color: colors.ink, fontSize: 8, fontWeight: '950', letterSpacing: 0.7 },
  pendingNotice: { backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E8D692', padding: 13, borderRadius: 17, marginBottom: 20 },
  pendingTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  pendingText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  setupCard: { marginTop: 22, gap: 12 },
  label: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  input: { height: 52, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FAF9F5', paddingHorizontal: 14, color: colors.ink, fontSize: 13 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cityStateRow: { flexDirection: 'row', gap: 8 },
  stateField: { width: 86 },
  pendingSetupNote: { backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', borderRadius: 15, padding: 12, marginVertical: 3 },
  pendingSetupTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '900' },
  pendingSetupText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  partsCard: { backgroundColor: colors.violetSoft, borderColor: '#DDD4FA', marginTop: 4 },
  partsTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  partsText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  typeButton: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  typeButtonActive: { backgroundColor: colors.ink },
  typeText: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  typeTextActive: { color: colors.white },
  servicesCard: { padding: 12 },
  searchWrap: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#F7F5EF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  searchIcon: { color: colors.muted, fontSize: 20, marginRight: 7 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' },
  explainer: { color: colors.muted, fontSize: 10, lineHeight: 15, paddingVertical: 12, paddingHorizontal: 3 },
  serviceRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10 },
  serviceMain: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: '#B6B7B0', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.coral, borderColor: colors.coral },
  checkboxText: { color: colors.white, fontSize: 13, fontWeight: '950' },
  serviceName: { color: colors.ink, fontSize: 12.5, fontWeight: '900' },
  serviceMeta: { color: colors.muted, fontSize: 9.5, marginTop: 2 },
  modeRow: { flexDirection: 'row', gap: 6, marginLeft: 35, marginTop: 7 },
  modeButton: { minHeight: 34, paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#EFEEE8', alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: colors.ink },
  modeText: { color: colors.muted, fontSize: 9.5, fontWeight: '900' },
  modeTextActive: { color: colors.white },
  mobileOnly: { marginLeft: 35, marginTop: 5 },
  mobileOnlyText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  sectionGap: { marginTop: 22 },
  leadCard: { marginBottom: 10 },
  leadType: { color: colors.coral, fontSize: 9, letterSpacing: 1.1, fontWeight: '950' },
  leadTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 7 },
  leadMode: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: 5 },
  leadText: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  locked: { backgroundColor: '#F2F0E9', borderRadius: 13, padding: 11, marginTop: 13 },
  lockedText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  emptyLead: { backgroundColor: '#F7F5EF' },
  emptyLeadTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  emptyLeadText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
});
