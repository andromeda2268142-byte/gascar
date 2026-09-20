import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/ui';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

type Category = 'repair' | 'towing';

export default function RequestScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>('repair');
  const [service, setService] = useState('Brakes');
  const [issue, setIssue] = useState('');
  const [zip, setZip] = useState('75201');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [working, setWorking] = useState(false);

  async function submit() {
    if (!user) {
      router.push('/auth');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Development setup required', 'Connect the Expo environment to the temporary Supabase project before submitting real requests.');
      return;
    }
    if (issue.trim().length < 5) {
      Alert.alert('Tell us what is happening', 'Add a short description so nearby providers understand the request.');
      return;
    }
    if (!contactPhone.trim() && !contactEmail.trim()) {
      Alert.alert('Contact information required', 'Add a phone number or email so an unlocked provider can contact you.');
      return;
    }

    setWorking(true);
    try {
      const { data, error } = await getSupabaseClient().rpc('gascars_create_lead', {
        p_category: category,
        p_service: service,
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

      Alert.alert('Request created', 'Your request is now stored securely. Contact details remain protected from businesses until the lead is unlocked.', [
        { text: 'OK' },
      ]);
      setIssue('');
      if (category === 'towing') {
        setPickup('');
        setDestination('');
      }
      console.log('Created lead', data);
    } catch (error) {
      Alert.alert('Could not create request', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>GET HELP</Text>
        <Text style={styles.title}>What does your car need?</Text>
        <Text style={styles.subtitle}>Create a protected request and connect with nearby automotive businesses.</Text>

        <View style={styles.segment}>
          <Pressable onPress={() => setCategory('repair')} style={[styles.segmentButton, category === 'repair' && styles.segmentActive]}>
            <Text style={[styles.segmentText, category === 'repair' && styles.segmentTextActive]}>Repair</Text>
          </Pressable>
          <Pressable onPress={() => setCategory('towing')} style={[styles.segmentButton, category === 'towing' && styles.segmentActive]}>
            <Text style={[styles.segmentText, category === 'towing' && styles.segmentTextActive]}>Towing</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroIcon}>{category === 'repair' ? '🔧' : '🚚'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{category === 'repair' ? 'Repair request' : 'Roadside / towing request'}</Text>
            <Text style={styles.heroText}>Businesses can see the service need, but your contact information is stored separately and protected.</Text>
          </View>
        </View>

        <SectionTitle title="Request details" />
        <Card style={styles.formCard}>
          <Text style={styles.label}>Service</Text>
          <TextInput value={service} onChangeText={setService} placeholder={category === 'repair' ? 'Brakes, AC, engine...' : 'Tow, jump start, tire...'} placeholderTextColor="#A1A39C" style={styles.input} />

          <Text style={styles.label}>What is happening?</Text>
          <TextInput value={issue} onChangeText={setIssue} placeholder="Describe the problem..." placeholderTextColor="#A1A39C" style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />

          <Text style={styles.label}>ZIP code</Text>
          <TextInput value={zip} onChangeText={setZip} placeholder="75201" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="number-pad" />

          {category === 'towing' ? (
            <>
              <Text style={styles.label}>Pickup</Text>
              <TextInput value={pickup} onChangeText={setPickup} placeholder="Current location or address" placeholderTextColor="#A1A39C" style={styles.input} />
              <Text style={styles.label}>Destination</Text>
              <TextInput value={destination} onChangeText={setDestination} placeholder="Where should the vehicle go?" placeholderTextColor="#A1A39C" style={styles.input} />
            </>
          ) : null}
        </Card>

        <View style={{ marginTop: 20 }}><SectionTitle title="Private contact details" /></View>
        <Card style={styles.formCard}>
          <Text style={styles.privacyNote}>These fields are not part of the public lead summary.</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor="#A1A39C" style={styles.input} />
          <Text style={styles.label}>Phone</Text>
          <TextInput value={contactPhone} onChangeText={setContactPhone} placeholder="(555) 555-5555" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="phone-pad" />
          <Text style={styles.label}>Email</Text>
          <TextInput value={contactEmail} onChangeText={setContactEmail} placeholder="you@example.com" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="email-address" autoCapitalize="none" />
        </Card>

        <View style={styles.submitWrap}>
          <PrimaryButton label={user ? (working ? 'Creating request…' : 'Create request') : 'Sign in to continue'} accent onPress={working ? undefined : submit} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 110 },
  kicker: { color: colors.coral, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 5, color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '950', letterSpacing: -1.3 },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.muted },
  segment: { marginTop: 20, padding: 5, borderRadius: 16, backgroundColor: '#ECE9DF', flexDirection: 'row', gap: 5 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: colors.white },
  heroCard: { marginVertical: 18, backgroundColor: colors.limeSoft, borderRadius: 24, padding: 17, flexDirection: 'row', gap: 13, borderWidth: 1, borderColor: '#DBEABF' },
  heroIcon: { fontSize: 26 },
  heroTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  heroText: { marginTop: 4, color: colors.muted, lineHeight: 18, fontSize: 12 },
  formCard: { gap: 9 },
  label: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: 3 },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FAF9F5', paddingHorizontal: 14, color: colors.ink, fontSize: 13 },
  textarea: { minHeight: 104, paddingTop: 13, paddingBottom: 13 },
  privacyNote: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginBottom: 2 },
  submitWrap: { marginTop: 18 },
});
