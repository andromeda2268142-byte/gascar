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

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: Mode; verified?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
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
          options: { data: { full_name: name.trim() || undefined } },
        });
        if (error) throw error;

        if (!data.session) {
          router.replace({
            pathname: '/verify-email',
            params: { email: email.trim().toLowerCase() },
          });
          return;
        }
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;

        const { data: profile } = await supabase
          .from('gascars_profiles')
          .select('role')
          .eq('id', signInData.user.id)
          .single();

        if (profile?.role === 'admin') {
          router.replace('/admin');
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
              ? 'Sign in to save vehicles, request help and keep your activity in one place.'
              : 'Start as a driver. Business access can be added to the same account later.'}
          </Text>

          {params.verified === '1' ? (
            <View style={styles.verifiedNotice}>
              <Text style={styles.verifiedTitle}>Email confirmed</Text>
              <Text style={styles.verifiedText}>Sign in with the password you created to continue.</Text>
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
                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
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
  verifiedNotice: { marginTop: 18, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: '#D7E9B1', borderRadius: 17, padding: 13 },
  verifiedTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  verifiedText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  setupNotice: { marginTop: 18, backgroundColor: colors.sunSoft, borderWidth: 1, borderColor: '#EBD99C', borderRadius: 17, padding: 13 },
  setupTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  setupText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  form: { gap: 14, marginTop: 24 },
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
