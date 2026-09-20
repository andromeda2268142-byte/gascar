import { useCallback, useEffect, useMemo, useState } from 'react';
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

type ContactMethod = 'app' | 'phone' | 'email';

type MyRequest = {
  id: string;
  service: string | null;
  status: string;
  accepted_business_id: string | null;
  created_at: string;
  provider_name?: string | null;
};

type DriverNotification = {
  id: string;
  lead_id: string | null;
  message_id: string | null;
  type: 'lead_accepted' | 'job_started' | 'job_completed' | 'new_message';
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

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
  const [preferredContact, setPreferredContact] = useState<ContactMethod>('app');
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loadingMyRequests, setLoadingMyRequests] = useState(false);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [working, setWorking] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [errors, setErrors] = useState<{
    service?: string;
    location?: string;
    issue?: string;
    contact?: string;
  }>({});

  const loadMyRequests = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setMyRequests([]);
      return;
    }

    setLoadingMyRequests(true);
    try {
      const supabase = getSupabaseClient();
      const [leadsResult, notificationsResult] = await Promise.all([
        supabase
          .from('gascars_leads')
          .select('id,service,status,accepted_business_id,created_at')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('gascars_notifications')
          .select('id,lead_id,message_id,type,title,body,read_at,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (notificationsResult.error) throw notificationsResult.error;

      const leads = leadsResult.data ?? [];
      setNotifications((notificationsResult.data ?? []) as DriverNotification[]);

      const businessIds = Array.from(
        new Set(leads.map((lead) => lead.accepted_business_id).filter(Boolean)),
      ) as string[];

      const businessNames = new Map<string, string>();
      if (businessIds.length) {
        const { data: businesses } = await supabase
          .from('gascars_businesses')
          .select('id,name')
          .in('id', businessIds);

        for (const business of businesses ?? []) {
          businessNames.set(business.id, business.name);
        }
      }

      setMyRequests(
        leads.map((lead) => ({
          ...lead,
          provider_name: lead.accepted_business_id
            ? businessNames.get(lead.accepted_business_id) ?? null
            : null,
        })) as MyRequest[],
      );
    } catch {
      // Keep the request form usable even if history cannot refresh.
    } finally {
      setLoadingMyRequests(false);
    }
  }, [user]);

  useEffect(() => {
    void loadMyRequests();
    if (!user || !isSupabaseConfigured) return;

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('driver-requests-' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_leads', filter: 'customer_id=eq.' + user.id },
        () => void loadMyRequests(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_notifications', filter: 'user_id=eq.' + user.id },
        () => void loadMyRequests(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gascars_lead_messages', filter: 'recipient_id=eq.' + user.id },
        () => void loadMyRequests(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMyRequests, user]);

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
    setErrors({});
  }

  function chooseService(item: ServiceCatalogItem) {
    setSelectedService(item);
    setServiceQuery(item.name);
    setErrors((current) => ({ ...current, service: undefined }));
  }

  const currentCase = useMemo(() => {
    const active = myRequests.find((request) => ['open', 'accepted', 'in_progress'].includes(request.status));
    return active ?? myRequests[0] ?? null;
  }, [myRequests]);

  const unreadMessagesForCurrentCase = useMemo(() => {
    if (!currentCase) return 0;
    return notifications.filter(
      (item) =>
        item.type === 'new_message' &&
        item.lead_id === currentCase.id &&
        !item.read_at,
    ).length;
  }, [currentCase, notifications]);

  const progressIndex = useMemo(() => {
    if (!currentCase) return 0;
    if (currentCase.status === 'completed') return 3;
    if (currentCase.status === 'in_progress') return 2;
    if (currentCase.status === 'accepted') return 1;
    return 0;
  }, [currentCase]);

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

    const nextErrors: typeof errors = {};

    if (!selectedService) {
      nextErrors.service = 'Choose the exact service you need.';
    }

    if (!serviceLocation) {
      nextErrors.location = 'Choose where the service should happen.';
    }

    if (issue.trim().length < 5) {
      nextErrors.issue = 'Describe the problem in at least a few words.';
    }

    if (!contactPhone.trim() && !contactEmail.trim() && preferredContact !== 'app') {
      nextErrors.contact = 'Add a phone number or email so the provider can contact you.';
    }

    if (preferredContact === 'phone' && !contactPhone.trim()) {
      nextErrors.contact = 'Add a phone number to use Phone as your preferred contact method.';
    }

    if (preferredContact === 'email' && !contactEmail.trim()) {
      nextErrors.contact = 'Add an email address to use Email as your preferred contact method.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    setWorking(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc('gascars_create_lead_v3', {
        p_category: category,
        p_service_id: selectedService.id,
        p_service_location: serviceLocation,
        p_issue_description: issue,
        p_contact_name: contactName,
        p_contact_phone: contactPhone,
        p_contact_email: contactEmail,
        p_preferred_contact_method: preferredContact,
        p_vehicle_id: null,
        p_preferred_time: 'As soon as possible',
        p_zip: zip,
        p_pickup_address: category === 'towing' ? pickup : null,
        p_destination_address: category === 'towing' ? destination : null,
        p_latitude: null,
        p_longitude: null,
      });

      if (error) throw error;

      void supabase.functions.invoke('gascars-email-worker').catch(() => undefined);
      await loadMyRequests();

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

          {user && currentCase ? (
            <View style={styles.caseWrap}>
              <View style={styles.caseHeader}>
                <View>
                  <Text style={styles.caseKicker}>CURRENT SERVICE</Text>
                  <Text style={styles.caseTitle}>{currentCase.service || 'Service request'}</Text>
                </View>
                <View style={[
                  styles.caseStatus,
                  currentCase.status === 'completed'
                    ? styles.caseStatusDone
                    : currentCase.status === 'in_progress'
                      ? styles.caseStatusActive
                      : currentCase.status === 'accepted'
                        ? styles.caseStatusAccepted
                        : styles.caseStatusWaiting,
                ]}>
                  <Text style={styles.caseStatusText}>
                    {currentCase.status === 'open'
                      ? 'WAITING'
                      : currentCase.status.replaceAll('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.caseProvider}>
                {currentCase.accepted_business_id
                  ? currentCase.provider_name || 'Matched provider'
                  : 'Searching for a matching provider'}
              </Text>

              <View style={styles.progressTrack}>
                {[
                  ['Request sent', 0],
                  ['Accepted', 1],
                  ['In progress', 2],
                  ['Completed', 3],
                ].map(([label, index], stepIndex) => {
                  const done = progressIndex >= Number(index);
                  const current = progressIndex === Number(index);
                  return (
                    <View key={String(label)} style={styles.progressStepWrap}>
                      <View style={styles.progressRow}>
                        <View style={[
                          styles.progressDot,
                          done && styles.progressDotDone,
                          current && styles.progressDotCurrent,
                        ]}>
                          <Text style={[styles.progressDotText, done && styles.progressDotTextDone]}>
                            {done && !current ? '✓' : stepIndex + 1}
                          </Text>
                        </View>
                        {stepIndex < 3 ? (
                          <View style={[styles.progressLine, progressIndex > Number(index) && styles.progressLineDone]} />
                        ) : null}
                      </View>
                      <Text style={[styles.progressLabel, done && styles.progressLabelDone]}>{label}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.caseNow}>
                <Text style={styles.caseNowLabel}>RIGHT NOW</Text>
                <Text style={styles.caseNowTitle}>
                  {currentCase.status === 'open'
                    ? 'We are matching your request'
                    : currentCase.status === 'accepted'
                      ? (currentCase.provider_name || 'Your provider') + ' accepted your request'
                      : currentCase.status === 'in_progress'
                        ? (currentCase.provider_name || 'Your provider') + ' is working on your vehicle'
                        : 'The provider marked this service completed'}
                </Text>
                <Text style={styles.caseNowText}>
                  {currentCase.status === 'open'
                    ? 'You will see this same card update when a qualified provider accepts.'
                    : currentCase.status === 'accepted'
                      ? 'You can contact the provider from the floating message button.'
                      : currentCase.status === 'in_progress'
                        ? 'The provider controls the work status. This card updates automatically as the case advances.'
                        : 'This service is finished. The case remains visible as the final record of progress.'}
                </Text>
              </View>
            </View>
          ) : null}

          {user && myRequests.filter((request) => request.id !== currentCase?.id).length ? (
            <View style={styles.historyWrap}>
              <Text style={styles.historyTitle}>Recent services</Text>
              {myRequests
                .filter((request) => request.id !== currentCase?.id)
                .slice(0, 3)
                .map((request) => (
                  <View key={request.id} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyService}>{request.service || 'Service request'}</Text>
                      <Text style={styles.historyMeta}>
                        {request.status.replaceAll('_', ' ')} · {new Date(request.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.historyArrow}>›</Text>
                  </View>
                ))}
            </View>
          ) : null}

          <SectionTitle title="Choose a service" right={loadingServices ? 'Loading…' : String(categoryServices.length) + ' available'} />
          <Card style={styles.serviceCard}>
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={serviceQuery}
                onChangeText={(value) => {
                  setServiceQuery(value);
                  if (selectedService && value !== selectedService.name) setSelectedService(null);
                  setErrors((current) => ({ ...current, service: undefined }));
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
          {errors.service ? <Text style={styles.fieldError}>{errors.service}</Text> : null}

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
                    onPress={() => {
                      setServiceLocation(choice.value);
                      setErrors((current) => ({ ...current, location: undefined }));
                    }}
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
          {errors.location ? <Text style={styles.fieldError}>{errors.location}</Text> : null}

          <View style={styles.sectionGap}><SectionTitle title="Request details" /></View>
          <Card style={styles.formCard}>
            <Text style={styles.label}>What is happening?</Text>
            <TextInput
              value={issue}
              onChangeText={(value) => {
                setIssue(value);
                if (value.trim().length >= 5) {
                  setErrors((current) => ({ ...current, issue: undefined }));
                }
              }}
              placeholder="Example: grinding noise when braking at low speed..."
              placeholderTextColor="#A1A39C"
              style={[styles.input, styles.textarea, errors.issue && styles.inputError]}
              multiline
              textAlignVertical="top"
            />
            {errors.issue ? <Text style={styles.fieldErrorInside}>{errors.issue}</Text> : null}

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
            <Text style={styles.label}>Preferred contact method</Text>
            <View style={styles.contactMethodRow}>
              {([
                ['app', 'In-app', 'Fastest and keeps everything with your request'],
                ['phone', 'Phone', 'Provider can call you after accepting'],
                ['email', 'Email', 'Provider can email you after accepting'],
              ] as Array<[ContactMethod, string, string]>).map(([value, label, detail]) => {
                const active = preferredContact === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setPreferredContact(value);
                      setErrors((current) => ({ ...current, contact: undefined }));
                    }}
                    style={[styles.contactMethod, active && styles.contactMethodActive]}
                  >
                    <Text style={[styles.contactMethodLabel, active && styles.contactMethodLabelActive]}>{label}</Text>
                    <Text style={styles.contactMethodDetail}>{detail}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>Name</Text>
            <TextInput value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor="#A1A39C" style={styles.input} />
            <Text style={styles.label}>Phone</Text>
            <TextInput
              value={contactPhone}
              onChangeText={(value) => {
                setContactPhone(value);
                if (value.trim() || contactEmail.trim()) {
                  setErrors((current) => ({ ...current, contact: undefined }));
                }
              }}
              placeholder="(555) 555-5555"
              placeholderTextColor="#A1A39C"
              style={styles.input}
              keyboardType="phone-pad"
            />
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={contactEmail}
              onChangeText={(value) => {
                setContactEmail(value);
                if (value.trim() || contactPhone.trim()) {
                  setErrors((current) => ({ ...current, contact: undefined }));
                }
              }}
              placeholder="you@example.com"
              placeholderTextColor="#A1A39C"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.contact ? <Text style={styles.fieldErrorInside}>{errors.contact}</Text> : null}
          </Card>

          <View style={styles.submitWrap}>
            <PrimaryButton
              label={user ? (working ? 'Creating request…' : 'Create matched request') : 'Sign in to continue'}
              accent
              onPress={working ? undefined : submit}
            />
          </View>
        </ScrollView>

        {user && currentCase?.accepted_business_id ? (
          <Pressable
            onPress={() => router.push({ pathname: '/lead-chat', params: { leadId: currentCase.id } })}
            style={({ pressed }) => [styles.messageFab, pressed && { opacity: 0.86 }]}
          >
            <Text style={styles.messageFabIcon}>✉</Text>
            {unreadMessagesForCurrentCase > 0 ? (
              <View style={styles.messageFabBadge}>
                <Text style={styles.messageFabBadgeText}>
                  {unreadMessagesForCurrentCase > 9 ? '9+' : unreadMessagesForCurrentCase}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
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
  caseWrap: { marginBottom: 20, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, padding: 17 },
  caseHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  caseKicker: { color: colors.coral, fontSize: 8.5, fontWeight: '950', letterSpacing: 1.1 },
  caseTitle: { color: colors.ink, fontSize: 20, lineHeight: 24, fontWeight: '950', marginTop: 3 },
  caseProvider: { color: colors.muted, fontSize: 10.5, fontWeight: '800', marginTop: 5 },
  caseStatus: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  caseStatusWaiting: { backgroundColor: colors.sunSoft },
  caseStatusAccepted: { backgroundColor: colors.violetSoft },
  caseStatusActive: { backgroundColor: colors.coralSoft },
  caseStatusDone: { backgroundColor: colors.limeSoft },
  caseStatusText: { color: colors.ink, fontSize: 7.5, fontWeight: '950', letterSpacing: 0.5 },
  progressTrack: { flexDirection: 'row', marginTop: 22, marginBottom: 18 },
  progressStepWrap: { flex: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progressDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E7E4DC', borderWidth: 2, borderColor: '#D4D1C8', alignItems: 'center', justifyContent: 'center' },
  progressDotDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  progressDotCurrent: { borderColor: colors.coral, borderWidth: 3 },
  progressDotText: { color: colors.muted, fontSize: 8.5, fontWeight: '950' },
  progressDotTextDone: { color: colors.lime },
  progressLine: { flex: 1, height: 3, backgroundColor: '#E1DED5', marginHorizontal: 4, borderRadius: 2 },
  progressLineDone: { backgroundColor: colors.ink },
  progressLabel: { color: '#999C94', fontSize: 7.5, fontWeight: '800', marginTop: 6, paddingRight: 4 },
  progressLabelDone: { color: colors.ink },
  caseNow: { borderRadius: 17, backgroundColor: '#F3F1EA', padding: 13 },
  caseNowLabel: { color: colors.coral, fontSize: 7.5, fontWeight: '950', letterSpacing: 0.8 },
  caseNowTitle: { color: colors.ink, fontSize: 12.5, lineHeight: 17, fontWeight: '950', marginTop: 4 },
  caseNowText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  historyWrap: { marginBottom: 20 },
  historyTitle: { color: colors.ink, fontSize: 14, fontWeight: '950', marginBottom: 8 },
  historyRow: { minHeight: 58, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  historyService: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  historyMeta: { color: colors.muted, fontSize: 8.5, marginTop: 3, textTransform: 'capitalize' },
  historyArrow: { color: '#A3A59E', fontSize: 22 },
  messageFab: { position: 'absolute', right: 20, bottom: 92, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  messageFabIcon: { color: colors.lime, fontSize: 21, fontWeight: '950' },
  messageFabBadge: { position: 'absolute', right: -2, top: -3, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.coral, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  messageFabBadgeText: { color: colors.white, fontSize: 8, fontWeight: '950' },
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
  inputError: { borderColor: colors.coral, borderWidth: 1.5 },
  fieldError: { color: colors.coral, fontSize: 10.5, fontWeight: '800', marginTop: 7, marginLeft: 4 },
  fieldErrorInside: { color: colors.coral, fontSize: 10, fontWeight: '800', marginTop: -2, marginBottom: 3 },
  privacyNote: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginBottom: 2 },
  contactMethodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  contactMethod: { flexGrow: 1, flexBasis: '30%', minWidth: 105, minHeight: 76, borderRadius: 14, backgroundColor: '#F2F0E9', borderWidth: 1, borderColor: colors.line, padding: 10 },
  contactMethodActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  contactMethodLabel: { color: colors.ink, fontSize: 10.5, fontWeight: '950' },
  contactMethodLabelActive: { color: colors.lime },
  contactMethodDetail: { color: colors.muted, fontSize: 8.2, lineHeight: 12, marginTop: 4 },
  submitWrap: { marginTop: 18 },
});
