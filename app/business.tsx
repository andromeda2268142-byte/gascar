import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { loadOwnedProviderBusiness } from '@/lib/provider';
import { useAuth } from '@/providers/auth';

type BusinessType = 'mechanic' | 'towing' | 'parts';

export default function BusinessOnboardingScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [role, setRole] = useState<'driver' | 'business' | 'admin' | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType>('mechanic');
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState(user?.email ?? '');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [businessZip, setBusinessZip] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const checkAccount = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: profile, error: profileError }, existingBusiness] = await Promise.all([
        supabase.from('gascars_profiles').select('role').eq('id', user.id).single(),
        loadOwnedProviderBusiness(user.id),
      ]);

      if (profileError) throw profileError;

      const nextRole = (profile?.role as 'driver' | 'business' | 'admin' | undefined) ?? null;
      setRole(nextRole);

      if (nextRole === 'admin') {
        router.replace('/admin');
        return;
      }

      if (existingBusiness && nextRole === 'business') {
        router.replace('/(provider)');
        return;
      }
    } catch (error) {
      Alert.alert('Could not load business setup', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void checkAccount();
  }, [checkAccount]);

  async function logout() {
    await signOut();
    router.replace('/auth');
  }

  async function createBusiness() {
    if (!user || role !== 'business') return;

    if (businessName.trim().length < 2) {
      Alert.alert('Business name required', 'Enter the public name of the business.');
      return;
    }

    if (!businessPhone.trim()) {
      Alert.alert('Business phone required', 'Add a phone number for this provider account.');
      return;
    }

    if (!/^\d{5}$/.test(businessZip.trim())) {
      Alert.alert('ZIP code required', 'Enter a valid 5-digit primary service ZIP.');
      return;
    }

    setWorking(true);
    try {
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
      router.replace('/(provider)/services');
    } catch (error) {
      Alert.alert('Could not create provider profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
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
        <View style={styles.center}>
          <Text style={styles.kicker}>PROVIDER ACCOUNT</Text>
          <Text style={styles.title}>Sign in first.</Text>
          <Pressable onPress={() => router.replace('/auth')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'business') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.kicker}>PROVIDER ACCOUNT</Text>
          <Text style={styles.title}>Use a separate business account.</Text>
          <Text style={styles.subtitle}>
            Driver accounts keep the customer experience. Mechanics, towing companies and parts businesses use a dedicated Business account with provider-only navigation.
          </Text>
          <Pressable onPress={() => void logout()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign out and create Business account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <View style={styles.providerBadge}><Text style={styles.providerBadgeText}>BUSINESS</Text></View>
            <Pressable onPress={() => void logout()}><Text style={styles.signOut}>Sign out</Text></Pressable>
          </View>

          <Text style={styles.kicker}>GAS CAR'S PROVIDER</Text>
          <Text style={styles.title}>Set up your business.</Text>
          <Text style={styles.subtitle}>
            This account will not have Request Service or Garage. Its workspace is built for leads, services, credits and business operations.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Provider type</Text>
            <View style={styles.typeRow}>
              <Pressable onPress={() => setBusinessType('mechanic')} style={[styles.typeCard, businessType === 'mechanic' && styles.typeCardActive]}>
                <Text style={styles.typeIcon}>🔧</Text>
                <Text style={[styles.typeTitle, businessType === 'mechanic' && styles.typeTitleActive]}>Mechanic</Text>
                <Text style={styles.typeText}>Repair and maintenance leads.</Text>
              </Pressable>
              <Pressable onPress={() => setBusinessType('towing')} style={[styles.typeCard, businessType === 'towing' && styles.typeCardActive]}>
                <Text style={styles.typeIcon}>🚚</Text>
                <Text style={[styles.typeTitle, businessType === 'towing' && styles.typeTitleActive]}>Towing</Text>
                <Text style={styles.typeText}>Roadside and towing leads.</Text>
              </Pressable>
              <Pressable onPress={() => setBusinessType('parts')} style={[styles.typeCard, businessType === 'parts' && styles.typeCardActive]}>
                <Text style={styles.typeIcon}>⚙</Text>
                <Text style={[styles.typeTitle, businessType === 'parts' && styles.typeTitleActive]}>Auto Parts</Text>
                <Text style={styles.typeText}>Store and inventory workspace.</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Business name</Text>
            <TextInput value={businessName} onChangeText={setBusinessName} placeholder="Example: Rapid Auto Care" placeholderTextColor="#A1A39C" style={styles.input} />

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

            <Text style={styles.label}>Primary service ZIP</Text>
            <TextInput value={businessZip} onChangeText={setBusinessZip} placeholder="75201" placeholderTextColor="#A1A39C" style={styles.input} keyboardType="number-pad" maxLength={5} />

            <View style={styles.note}>
              <Text style={styles.noteTitle}>Next step</Text>
              <Text style={styles.noteText}>
                Mechanics and towing providers will choose exact services and whether each one is Shop, Mobile or Both. The business stays Pending until admin approval.
              </Text>
            </View>

            <Pressable disabled={working} onPress={() => void createBusiness()} style={({ pressed }) => [styles.primaryButton, (pressed || working) && { opacity: 0.72 }]}>
              {working ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Continue to provider portal</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, padding: 24, justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  providerBadge: { borderRadius: 999, backgroundColor: colors.ink, paddingHorizontal: 11, paddingVertical: 7 },
  providerBadgeText: { color: colors.lime, fontSize: 8, fontWeight: '950', letterSpacing: 0.8 },
  signOut: { color: colors.coral, fontSize: 11, fontWeight: '900' },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '950', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '950', letterSpacing: -1.2, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 430 },
  formCard: { marginTop: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 15, gap: 11 },
  label: { color: colors.ink, fontSize: 10.5, fontWeight: '900', marginTop: 2 },
  typeRow: { flexDirection: 'row', gap: 7 },
  typeCard: { flex: 1, minHeight: 112, borderRadius: 15, backgroundColor: '#F2F0E9', borderWidth: 1, borderColor: colors.line, padding: 10 },
  typeCardActive: { backgroundColor: '#FFF6F2', borderColor: colors.coral },
  typeIcon: { fontSize: 20 },
  typeTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '900', marginTop: 7 },
  typeTitleActive: { color: colors.coral },
  typeText: { color: colors.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FAF9F5', paddingHorizontal: 13, color: colors.ink, fontSize: 12.5 },
  cityStateRow: { flexDirection: 'row', gap: 8 },
  stateField: { width: 88 },
  note: { borderRadius: 15, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', padding: 12, marginTop: 3 },
  noteTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '900' },
  noteText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.white, fontSize: 12.5, fontWeight: '950', textAlign: 'center' },
});
