import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  type ServiceCatalogItem,
  type ServiceCategory,
  type ServiceLocation,
} from '@/lib/services';
import { useAuth } from '@/providers/auth';

const locationChoices: Array<{ value: ServiceLocation; title: string; subtitle: string }> = [
  { value: 'shop', title: "I'll go to the shop", subtitle: 'Only match shops that service vehicles at their location.' },
  { value: 'mobile', title: 'Come to me', subtitle: 'Only match mobile mechanics that can come to your location.' },
  { value: 'either', title: 'Either works', subtitle: 'Match shops or mobile mechanics that offer this service.' },
];

export default function RequestScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [category, setCategory] = useState<ServiceCategory>('repair');
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [serviceQuery, setServiceQuery] = useState('');
  const [selectedService, setSelectedService] = useState<ServiceCatalogItem | null>(null);
  const [serviceLocation, setServiceLocation] = useState<ServiceLocation | null>(null);
  const [issue, setIssue] = useState('');
  const [zip, setZip] = useState('75201');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [working, setWorking] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    setLoadingServices(true);

    loadServiceCatalog()
      .then((items) => {
        if (active) setCatalog(items);
      })
      .catch((error) => {
        if (active) {
          Alert.alert(
            'Could not load services',
            error instanceof Error ? error.message : 'Please try again.',
          );
        }
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const categoryServices = useMemo(
    () => catalog.filter((item) => item.category === category),
    [catalog, category],
  );

  const searchResults = useMemo(
    () => filterServices(categoryServices, serviceQuery).slice(0, 10),
    [categoryServices, serviceQuery],
  );

  function changeCategory(next: ServiceCategory) {
    setCategory(next);
    setSelectedService(null);
    setServiceQuery('');
    setServiceLocation(next === 'towing' ? 'mobile' : null);
  }

  function chooseService(item: ServiceCatalogItem) {
    setSelectedService(item);
    setServiceQuery(item.name);
  }

  async function submit() {
    if (!user) {
      router.push('/auth');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert(
        'Development setup required',
        'Connect the Expo environment to the temporary Supabase project before submitting real requests.',
      );
      return;
    }

    if (!selectedService) {
      Alert.alert('Choose a service', 'Select the specific service you need so the request reaches the right provider.');
      return;
    }

    if (!serviceLocation) {
      Alert.alert('Choose where service should happen', 'Tell us whether you will go to a shop or need a mobile mechanic.');
      return;
    }

    if (issue.trim().length < 5) {
      Alert.alert('Tell us what is happening', 'Add a short description so the provider understands the problem.');
      return;
    }

    if (!contactPhone.trim() && !contactEmail.trim()) {
      Alert.alert('Contact information required', 'Add a phone number or email so an unlocked provider can contact you.');
      return;
    }

    setWorking(true);

    try {
      const { error } = await getSupabaseClient().rpc('gascars_create_lead_v2', {
        p_category: category,
        p_service_id: selectedService.id,
        p_service_location: serviceLocation,
        p_issue_description: issue,
        p_contact_name: contactName,
        p_contact_phone: contactPhone,
        p_contact_email: contactEmail,
        p_vehicle_id: null,
        p_preferred_time: 'As soon as possible',
        p_zip: zip,
        p_pickup_address: category === 'towing' ? pickup : null,
        p_destination_address: category === 'towing' ? destination : null,
        p_latitude: null,
        p_longitude: null,
      });

      if (error) throw error;

      Alert.alert(
        'Request created',
        'Only businesses that offer this service and support your selected service location can see this lead.',
      );

      setIssue('');
      setSelectedService(null);
      setServiceQuery('');
      if (category === 'repair') setServiceLocation(null);
      if (category === 'towing') {
        setPickup('');
        setDestination('');
      }
    } catch (error) {
      Alert.alert('Could not create request', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
        >
          <Text style={styles.kicker}>REQUEST SERVICE</Text>
          <Text style={styles.title}>What does your car need?</Text>
          <Text style={styles.subtitle}>
            Choose the exact service so your request only reaches businesses that actually offer it.
          </Text>

          <View style={styles.segment}>
            <Pressable
              onPress={() => changeCategory('repair')}
              style={[styles.segmentButton, category === 'repair' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, category === 'repair' && styles.segmentTextActive]}>Mechanic</Text>
            </Pressable>
            <Pressable
              onPress={() => changeCategory('towing')}
              style={[styles.segmentButton, category === 'towing' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, category === 'towing' && styles.segmentTextActive]}>Roadside / towing</Text>
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.heroIcon}>{category === 'repair' ? '🔧' : '🚚'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>
                {category === 'repair' ? 'Find the right mechanic' : 'Get roadside help'}
              </Text>
              <Text style={styles.heroText}>
                Matching uses both the selected service and where the service needs to happen.
              </Text>
            </View>
          </View>

          <SectionTitle title="Choose a service" right={loadingServices ? 'Loading…' : String(categoryServices.length) + ' available'} />
          <Card style={styles.serviceCard}>
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={serviceQuery}
                onChangeText={(value) => {
                  setServiceQuery(value);
                  if (selectedService && value !== selectedService.name) setSelectedService(null);
                }}
                placeholder={category === 'repair' ? 'Search brakes, AC, battery...' : 'Search tow, jump start, flat tire...'}
                placeholderTextColor="#A1A39C"
                style={styles.searchInput}
                autoCorrect={false}
              />
              {serviceQuery ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setServiceQuery('');
                    setSelectedService(null);
                  }}
                >
                  <Text style={styles.clear}>×</Text>
                </Pressable>
              ) : null}
            </View>

            {selectedService ? (
              <View style={styles.selectedService}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedLabel}>SELECTED SERVICE</Text>
                  <Text style={styles.selectedName}>{selectedService.name}</Text>
                  {selectedService.description ? <Text style={styles.selectedDescription}>{selectedService.description}</Text> : null}
                </View>
                <Text style={styles.selectedCheck}>✓</Text>
              </View>
            ) : (
              <View style={styles.results}>
                {searchResults.length ? (
                  searchResults.map((item) => (
                    <Pressable key={item.id} onPress={() => chooseService(item)} style={styles.resultRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName}>{item.name}</Text>
                        <Text style={styles.resultMeta}>
                          {(item.group_name || 'Service') + (item.description ? ' · ' + item.description : '')}
                        </Text>
                      </View>
                      <Text style={styles.resultArrow}>›</Text>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.noResults}>
                    <Text style={styles.noResultsTitle}>No matching service</Text>
                    <Text style={styles.noResultsText}>Try another word, such as “brake”, “battery”, “AC” or “tow”.</Text>
                  </View>
                )}
              </View>
            )}
          </Card>

          <View style={styles.sectionGap}>
            <SectionTitle title={category === 'repair' ? 'Where should the service happen?' : 'Service location'} />
          </View>

          {category === 'repair' ? (
            <View style={styles.locationList}>
              {locationChoices.map((choice) => {
                const active = serviceLocation === choice.value;
                return (
                  <Pressable
                    key={choice.value}
                    onPress={() => setServiceLocation(choice.value)}
                    style={[styles.locationChoice, active && styles.locationChoiceActive]}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.locationTitle, active && styles.locationTitleActive]}>{choice.title}</Text>
                      <Text style={styles.locationSubtitle}>{choice.subtitle}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Card style={styles.roadsideLocation}>
              <Text style={styles.roadsideTitle}>📍 Provider comes to the vehicle</Text>
              <Text style={styles.roadsideText}>Roadside and towing requests are matched only to providers that support mobile service.</Text>
            </Card>
          )}

          <View style={styles.sectionGap}><SectionTitle title="Request details" /></View>
          <Card style={styles.formCard}>
            <Text style={styles.label}>What is happening?</Text>
            <TextInput
              value={issue}
              onChangeText={setIssue}
              placeholder="Example: grinding noise when braking at low speed..."
              placeholderTextColor="#A1A39C"
              style={[styles.input, styles.textarea]}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>ZIP code</Text>
            <TextInput
              value={zip}
              onChangeText={setZip}
              placeholder="75201"
              placeholderTextColor="#A1A39C"
              style={styles.input}
              keyboardType="number-pad"
            />

            {category === 'towing' ? (
              <>
                <Text style={styles.label}>Pickup</Text>
                <TextInput value={pickup} onChangeText={setPickup} placeholder="Current location or address" placeholderTextColor="#A1A39C" style={styles.input} />
                <Text style={styles.label}>Destination</Text>
                <TextInput value={destination} onChangeText={setDestination} placeholder="Where should the vehicle go?" placeholderTextColor="#A1A39C" style={styles.input} />
              </>
            ) : null}
          </Card>

          <View style={styles.sectionGap}><SectionTitle title="Private contact details" /></View>
          <Card style={styles.formCard}>
            <Text style={styles.privacyNote}>These details stay hidden until an eligible business unlocks the lead.</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor="#A1A39C" style={styles.input} />
            <Text style={styles.label}>Phone</Text>
            <TextInput value={contactPhone} onChangeText={setContactPhone} placeholder="(555) 555-5555" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="phone-pad" />
            <Text style={styles.label}>Email</Text>
            <TextInput value={contactEmail} onChangeText={setContactEmail} placeholder="you@example.com" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="email-address" autoCapitalize="none" />
          </Card>

          <View style={styles.submitWrap}>
            <PrimaryButton
              label={user ? (working ? 'Creating request…' : 'Create matched request') : 'Sign in to continue'}
              accent
              onPress={working ? undefined : submit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  keyboardArea: { flex: 1 },
  content: { padding: 18, paddingBottom: 130 },
  kicker: { color: colors.coral, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 5, color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '950', letterSpacing: -1.3 },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.muted },
  segment: { marginTop: 20, padding: 5, borderRadius: 16, backgroundColor: '#ECE9DF', flexDirection: 'row', gap: 5 },
  segmentButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { color: colors.muted, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  segmentTextActive: { color: colors.white },
  heroCard: { marginVertical: 18, backgroundColor: colors.limeSoft, borderRadius: 24, padding: 17, flexDirection: 'row', gap: 13, borderWidth: 1, borderColor: '#DBEABF' },
  heroIcon: { fontSize: 26 },
  heroTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  heroText: { marginTop: 4, color: colors.muted, lineHeight: 18, fontSize: 12 },
  serviceCard: { padding: 12 },
  searchWrap: { minHeight: 52, borderRadius: 16, backgroundColor: '#F5F3EC', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  searchIcon: { color: colors.muted, fontSize: 21, marginRight: 8 },
  searchInput: { flex: 1, minHeight: 50, color: colors.ink, fontSize: 13, fontWeight: '700' },
  clear: { color: colors.muted, fontSize: 25, lineHeight: 27 },
  results: { marginTop: 8 },
  resultRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultName: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  resultMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  resultArrow: { color: '#A3A59E', fontSize: 25, marginLeft: 8 },
  selectedService: { marginTop: 10, padding: 14, borderRadius: 17, backgroundColor: colors.coralSoft, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedLabel: { color: colors.coral, fontSize: 8.5, fontWeight: '950', letterSpacing: 0.8 },
  selectedName: { color: colors.ink, fontSize: 15, fontWeight: '950', marginTop: 3 },
  selectedDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  selectedCheck: { color: colors.coral, fontSize: 20, fontWeight: '950' },
  noResults: { paddingVertical: 18, paddingHorizontal: 5 },
  noResultsTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  noResultsText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  sectionGap: { marginTop: 21 },
  locationList: { gap: 9 },
  locationChoice: { minHeight: 76, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 13, flexDirection: 'row', gap: 12, alignItems: 'center' },
  locationChoiceActive: { borderColor: colors.coral, backgroundColor: '#FFF7F3' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B8B9B3', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.coral },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral },
  locationTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  locationTitleActive: { color: colors.coral },
  locationSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  roadsideLocation: { backgroundColor: colors.mintSoft },
  roadsideTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  roadsideText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  formCard: { gap: 9 },
  label: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: 3 },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FAF9F5', paddingHorizontal: 14, color: colors.ink, fontSize: 13 },
  textarea: { minHeight: 104, paddingTop: 13, paddingBottom: 13 },
  privacyNote: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginBottom: 2 },
  submitWrap: { marginTop: 18 },
});
