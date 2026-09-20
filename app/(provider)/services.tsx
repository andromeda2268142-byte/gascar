import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';
import {
  filterServices,
  loadServiceCatalog,
  type BusinessServiceMode,
  type ServiceCatalogItem,
} from '@/lib/services';
import {
  loadOwnedProviderBusiness,
  providerCategory,
  providerTypeLabel,
  type ProviderBusiness,
} from '@/lib/provider';
import { useAuth } from '@/providers/auth';

const modes: Array<{ value: BusinessServiceMode; label: string; detail: string }> = [
  { value: 'shop', label: 'Shop', detail: 'Customer comes to you' },
  { value: 'mobile', label: 'Mobile', detail: 'You go to the customer' },
  { value: 'both', label: 'Both', detail: 'Shop + mobile service' },
];

export default function ProviderServicesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [offerings, setOfferings] = useState<Record<string, BusinessServiceMode>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

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
      const category = providerCategory(ownedBusiness.business_type);

      if (!category) {
        setCatalog([]);
        setOfferings({});
        return;
      }

      const supabase = getSupabaseClient();
      const [services, currentResult] = await Promise.all([
        loadServiceCatalog(category),
        supabase
          .from('gascars_business_services')
          .select('service_id,service_mode')
          .eq('business_id', ownedBusiness.id)
          .eq('active', true),
      ]);

      if (currentResult.error) throw currentResult.error;

      const selected: Record<string, BusinessServiceMode> = {};
      for (const row of currentResult.data ?? []) selected[row.service_id] = row.service_mode as BusinessServiceMode;

      setCatalog(services);
      setOfferings(selected);
    } catch (error) {
      Alert.alert('Could not load services', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleServices = useMemo(() => {
    if (search.trim().length < 2) {
      return catalog.filter((service) => Boolean(offerings[service.id]));
    }
    return filterServices(catalog, search);
  }, [catalog, offerings, search]);

  async function toggleService(service: ServiceCatalogItem) {
    if (!business) return;

    setWorkingId(service.id);
    try {
      const supabase = getSupabaseClient();
      const currentMode = offerings[service.id];

      if (currentMode) {
        const { error } = await supabase
          .from('gascars_business_services')
          .delete()
          .eq('business_id', business.id)
          .eq('service_id', service.id);
        if (error) throw error;

        setOfferings((current) => {
          const next = { ...current };
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
        setOfferings((current) => ({ ...current, [service.id]: defaultMode }));
      }
    } catch (error) {
      Alert.alert('Could not update service', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorkingId(null);
    }
  }

  async function updateMode(serviceId: string, mode: BusinessServiceMode) {
    if (!business || !offerings[serviceId]) return;

    setWorkingId(serviceId);
    try {
      const { error } = await getSupabaseClient()
        .from('gascars_business_services')
        .update({ service_mode: mode })
        .eq('business_id', business.id)
        .eq('service_id', serviceId);

      if (error) throw error;
      setOfferings((current) => ({ ...current, [serviceId]: mode }));
    } catch (error) {
      Alert.alert('Could not update service mode', error instanceof Error ? error.message : 'Please try again.');
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

  if (business.business_type === 'parts') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>PROVIDER CATALOG</Text>
          <Text style={styles.title}>Parts inventory.</Text>
          <Text style={styles.subtitle}>This business type will use product inventory and promotions instead of mechanic service matching.</Text>
          <View style={styles.partsCard}>
            <Text style={styles.partsTitle}>Auto Parts workflow</Text>
            <Text style={styles.partsText}>Your account is separate from driver accounts. Inventory, stock status and promoted products will be managed here when the parts marketplace is connected.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>PROVIDER SERVICES</Text>
        <Text style={styles.title}>What do you actually do?</Text>
        <Text style={styles.subtitle}>
          {providerTypeLabel(business.business_type)} leads are matched from this list. A customer should never reach you for a service you did not select.
        </Text>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>SELECTED SERVICES</Text>
            <Text style={styles.summaryValue}>{Object.keys(offerings).length}</Text>
          </View>
          <Text style={styles.summaryText}>Service mode is saved separately for every service.</Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={business.business_type === 'mechanic' ? 'Search brakes, AC, battery...' : 'Search tow, jump start...'}
            placeholderTextColor="#999B94"
            style={styles.searchInput}
            autoCorrect={false}
          />
          {search ? <Pressable onPress={() => setSearch('')}><Text style={styles.clear}>×</Text></Pressable> : null}
        </View>

        {visibleServices.map((service) => {
          const selectedMode = offerings[service.id];
          const selected = Boolean(selectedMode);
          const busy = workingId === service.id;

          return (
            <View key={service.id} style={[styles.serviceCard, selected && styles.serviceCardSelected]}>
              <Pressable disabled={busy} onPress={() => void toggleService(service)} style={styles.serviceMain}>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  <Text style={styles.checkboxText}>{selected ? '✓' : ''}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.serviceMeta}>{service.group_name || 'Service'}{service.description ? ' · ' + service.description : ''}</Text>
                </View>
                {busy ? <ActivityIndicator size="small" color={colors.coral} /> : null}
              </Pressable>

              {selected ? (
                <View style={styles.modeSection}>
                  <Text style={styles.modeHeading}>WHERE DO YOU OFFER THIS SERVICE?</Text>
                  <View style={styles.modeRow}>
                    {(business.business_type === 'towing' ? modes.filter((mode) => mode.value === 'mobile') : modes).map((mode) => {
                      const active = selectedMode === mode.value;
                      return (
                        <Pressable
                          key={mode.value}
                          disabled={busy}
                          onPress={() => void updateMode(service.id, mode.value)}
                          style={[styles.modeButton, active && styles.modeButtonActive]}
                        >
                          <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{mode.label}</Text>
                          <Text style={[styles.modeDetail, active && styles.modeDetailActive]}>{mode.detail}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {!visibleServices.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {search.trim().length < 2 ? 'Search the service catalog' : 'No matching services'}
            </Text>
            <Text style={styles.emptyText}>
              {search.trim().length < 2
                ? 'Your selected services appear here. Type at least 2 characters to find and add another service.'
                : 'Try another keyword or spelling. Search tolerates small typing mistakes.'}
            </Text>
          </View>
        ) : null}
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
  summaryCard: { marginTop: 18, borderRadius: 18, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D9EAB8', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 18 },
  summaryLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  summaryValue: { color: colors.ink, fontSize: 26, fontWeight: '950', marginTop: 3 },
  summaryText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
  searchBox: { minHeight: 50, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, marginVertical: 16 },
  searchIcon: { color: colors.muted, fontSize: 20, marginRight: 7 },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 12.5, fontWeight: '700' },
  clear: { color: colors.muted, fontSize: 24 },
  serviceCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 13, marginBottom: 9 },
  serviceCardSelected: { borderColor: '#F1A08D', backgroundColor: '#FFF9F6' },
  serviceMain: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkbox: { width: 25, height: 25, borderRadius: 8, borderWidth: 2, borderColor: '#B5B7AF', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.coral, borderColor: colors.coral },
  checkboxText: { color: colors.white, fontSize: 13, fontWeight: '950' },
  serviceName: { color: colors.ink, fontSize: 12.5, fontWeight: '950' },
  serviceMeta: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  modeSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 11 },
  modeHeading: { color: colors.muted, fontSize: 7.5, fontWeight: '950', letterSpacing: 0.6, marginBottom: 7 },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeButton: { flex: 1, minHeight: 52, borderRadius: 12, backgroundColor: '#EFEDE6', paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: colors.ink },
  modeLabel: { color: colors.ink, fontSize: 9.5, fontWeight: '950' },
  modeLabelActive: { color: colors.lime },
  modeDetail: { color: colors.muted, fontSize: 7.5, textAlign: 'center', marginTop: 2 },
  modeDetailActive: { color: '#C8CAC3' },
  emptyCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 16 },
  emptyTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '950' },
  emptyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  partsCard: { marginTop: 20, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: '#D8CFF7', borderRadius: 20, padding: 16 },
  partsTitle: { color: colors.ink, fontSize: 14, fontWeight: '950' },
  partsText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 5 },
});
