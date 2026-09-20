import { useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'signin' | 'signup';
type AccountType = 'driver' | 'business';

const developmentTestMode = ['1', 'true', 'yes', 'on'].includes(
  (process.env.EXPO_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase(),
);

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: Mode; confirmation?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [accountType, setAccountType] = useState<AccountType>('driver');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit() {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase not connected on this device', 'Add the temporary Supabase URL and publishable key to the Expo environment before testing accounts.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Name required', accountType === 'business' ? 'Enter your name before creating the business account.' : 'Enter your name before creating the account.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      Alert.alert('Check your information', 'Enter a valid email and a password with at least 6 characters.');
      return;
    }

    setWorking(true);
    const supabase = getSupabaseClient();

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: name.trim() || undefined, account_type: accountType } },
        });
        if (error) throw error;

        if (!data.session) {
          if (developmentTestMode) {
            const { data: devSignInData, error: devSignInError } = await supabase.auth.signInWithPassword({
              email: email.trim().toLowerCase(),
              password,
            });

            if (!devSignInError && devSignInData.user) {
              const { data: profile } = await supabase
                .from('gascars_profiles')
                .select('role')
                .eq('id', devSignInData.user.id)
                .single();

              if (profile?.role === 'business' || accountType === 'business') {
                router.replace('/business');
                return;
              }

              router.replace('/(tabs)');
              return;
            }
          }

          router.replace({
            pathname: '/verify-email',
            params: { email: email.trim().toLowerCase(), accountType },
          });
          return;
        }

        if (accountType === 'business') {
          router.replace('/business');
          return;
        }
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            router.replace({
              pathname: '/verify-email',
              params: { email: email.trim().toLowerCase(), status: 'pending' },
            });
            return;
          }
          throw error;
        }

        const { data: profile } = await supabase
          .from('gascars_profiles')
          .select('role')
          .eq('id', signInData.user.id)
          .single();

        if (profile?.role === 'admin') {
          router.replace('/admin');
          return;
        }

        if (profile?.role === 'business') {
          router.replace('/business');
          return;
        }
      }

      router.replace('/(tabs)/profile');
    } catch (error) {
      Alert.alert('Could not continue', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <View style={styles.brandMark}><Text style={styles.brandMarkText}>GC</Text></View>
          <Text style={styles.kicker}>GAS CAR'S ACCOUNT</Text>
          <Text style={styles.title}>{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</Text>
          <Text style={styles.subtitle}>
            {mode === 'signin'
              ? 'One sign-in for drivers, automotive businesses and administrators.'
              : accountType === 'business'
                ? 'Create your business account, verify your email, then complete your provider profile.'
                : 'Create a driver account to save vehicles, request help and personalize Gas Car’s.'}
          </Text>

          {mode === 'signup' && developmentTestMode ? (
            <View style={styles.devNotice}>
              <Text style={styles.devNoticeTitle}>Development test mode</Text>
              <Text style={styles.devNoticeText}>New test accounts are auto-confirmed in the temporary development backend so you can test multiple drivers and businesses without opening email links.</Text>
            </View>
          ) : null}

          {params.confirmation === 'check' ? (
            <View style={styles.verifiedNotice}>
              <Text style={styles.verifiedTitle}>Ready to check your account</Text>
              <Text style={styles.verifiedText}>Sign in below. Gas Car’s will only continue if Supabase confirms that your email has actually been verified.</Text>
            </View>
          ) : null}

          {!isSupabaseConfigured ? (
            <View style={styles.setupNotice}>
              <Text style={styles.setupTitle}>Development setup required</Text>
              <Text style={styles.setupText}>The interface is ready. Add the temporary Supabase environment values before testing real accounts.</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {mode === 'signup' ? (
              <View>
                <Text style={styles.label}>How will you use Gas Car’s?</Text>
                <View style={styles.accountTypeRow}>
                  <Pressable
                    onPress={() => setAccountType('driver')}
                    style={[styles.accountTypeCard, accountType === 'driver' && styles.accountTypeCardActive]}
                  >
                    <Text style={styles.accountTypeIcon}>🚘</Text>
                    <Text style={[styles.accountTypeTitle, accountType === 'driver' && styles.accountTypeTitleActive]}>Driver</Text>
                    <Text style={styles.accountTypeText}>Find fuel, mechanics, towing and manage your garage.</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setAccountType('business')}
                    style={[styles.accountTypeCard, accountType === 'business' && styles.accountTypeCardActive]}
                  >
                    <Text style={styles.accountTypeIcon}>🔧</Text>
                    <Text style={[styles.accountTypeTitle, accountType === 'business' && styles.accountTypeTitleActive]}>Business</Text>
                    <Text style={styles.accountTypeText}>Offer automotive services and receive matched leads.</Text>
                  </Pressable>
                </View>

                <Text style={[styles.label, { marginTop: 14 }]}>Your name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={accountType === 'business' ? 'Account owner name' : 'Your name'}
                  placeholderTextColor="#A1A39C"
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            ) : null}

            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#A1A39C"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#A1A39C"
                  style={styles.passwordInput}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                />
                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  style={({ pressed }) => [styles.eyeButton, pressed && { opacity: 0.55 }]}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '◉' : '👁'}</Text>
                </Pressable>
              </View>
            </View>

            {mode === 'signup' && accountType === 'business' ? (
              <View style={styles.businessNote}>
                <Text style={styles.businessNoteTitle}>Business verification</Text>
                <Text style={styles.businessNoteText}>Your business will start as Pending. You can complete the profile and services immediately, but leads begin after admin approval.</Text>
              </View>
            ) : null}

            <Pressable
              disabled={working}
              onPress={submit}
              style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }, working && { opacity: 0.7 }]}
            >
              {working
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>}
            </Pressable>
          </View>

          <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={styles.switchButton}>
            <Text style={styles.switchText}>
              {mode === 'signin' ? "New to Gas Car's? " : 'Already have an account? '}
              <Text style={styles.switchStrong}>{mode === 'signin' ? 'Create one' : 'Sign in'}</Text>
            </Text>
          </Pressable>

          <Text style={styles.legal}>
            By continuing, users will eventually agree to the production Terms of Service and Privacy Policy before launch.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  keyboardArea: { flex: 1 },
  content: { flexGrow: 1, padding: 22, paddingBottom: 120 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 16 },
  backText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  brandMark: { marginTop: 26, width: 58, height: 58, borderRadius: 19, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontWeight: '950', fontSize: 17 },
  kicker: { marginTop: 20, color: colors.coral, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 6, color: colors.ink, fontSize: 35, lineHeight: 38, fontWeight: '950', letterSpacing: -1.4 },
  subtitle: { marginTop: 9, color: colors.muted, fontSize: 13, lineHeight: 20, maxWidth: 420 },
  devNotice: { marginTop: 18, backgroundColor: colors.violetSoft, borderWidth: 1, borderColor: '#D8CFF7', borderRadius: 17, padding: 13 },
  devNoticeTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  devNoticeText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  verifiedNotice: { marginTop: 18, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D7E9B1', borderRadius: 17, padding: 13 },
  verifiedTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  verifiedText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  setupNotice: { marginTop: 18, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#EBD99C', borderRadius: 17, padding: 13 },
  setupTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  setupText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  form: { gap: 14, marginTop: 24 },
  accountTypeRow: { flexDirection: 'row', gap: 9 },
  accountTypeCard: { flex: 1, minHeight: 132, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, padding: 13 },
  accountTypeCardActive: { borderColor: colors.coral, backgroundColor: '#FFF7F3' },
  accountTypeIcon: { fontSize: 23 },
  accountTypeTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 8 },
  accountTypeTitleActive: { color: colors.coral },
  accountTypeText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  businessNote: { borderRadius: 15, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#E9D793', padding: 12 },
  businessNoteTitle: { color: colors.ink, fontSize: 10.5, fontWeight: '900' },
  businessNoteText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  label: { color: colors.ink, fontSize: 11, fontWeight: '900', marginBottom: 7 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 15, color: colors.ink, fontSize: 14 },
  passwordWrap: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingLeft: 15,
    paddingRight: 6,
    color: colors.ink,
    fontSize: 14,
  },
  eyeButton: {
    width: 52,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    color: colors.muted,
    fontSize: 21,
  },
  submit: { marginTop: 4, minHeight: 54, borderRadius: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  switchButton: { alignSelf: 'center', paddingVertical: 20, paddingHorizontal: 12 },
  switchText: { color: colors.muted, fontSize: 12 },
  switchStrong: { color: colors.coral, fontWeight: '900' },
  legal: { marginTop: 10, color: '#93958E', fontSize: 9.5, lineHeight: 15, textAlign: 'center' },
});
