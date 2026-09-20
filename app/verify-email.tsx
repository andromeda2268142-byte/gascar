import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = useMemo(() => (params.email ?? '').trim().toLowerCase(), [params.email]);

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function verify() {
    if (!email) {
      Alert.alert('Missing email', 'Go back and create your account again.');
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Enter the 6-digit code', 'Use the verification code from your Gas Car\'s email.');
      return;
    }

    setVerifying(true);
    try {
      const { data, error } = await getSupabaseClient().auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });

      if (error) throw error;
      if (!data.session) {
        throw new Error('Email verified, but no session was created. Please sign in.');
      }

      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Could not verify email',
        error instanceof Error ? error.message : 'Check the code and try again.',
      );
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (!email || cooldown > 0) return;

    setResending(true);
    try {
      const { error } = await getSupabaseClient().auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;

      setCooldown(60);
      Alert.alert('Code sent', 'Check your inbox for a new Gas Car\'s verification code.');
    } catch (error) {
      Alert.alert(
        'Could not resend code',
        error instanceof Error ? error.message : 'Please try again shortly.',
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <View style={styles.iconWrap}>
            <Text style={styles.icon}>✉</Text>
          </View>

          <Text style={styles.kicker}>VERIFY YOUR EMAIL</Text>
          <Text style={styles.title}>Check your inbox.</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to
          </Text>
          <Text style={styles.email}>{email || 'your email address'}</Text>

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>VERIFICATION CODE</Text>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="000000"
              placeholderTextColor="#C3C3BB"
              style={styles.codeInput}
              onSubmitEditing={() => void verify()}
            />
          </View>

          <Pressable
            disabled={verifying}
            onPress={verify}
            style={({ pressed }) => [
              styles.verifyButton,
              pressed && { opacity: 0.85 },
              verifying && { opacity: 0.65 },
            ]}
          >
            {verifying
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.verifyButtonText}>Verify account</Text>}
          </Pressable>

          <Pressable
            disabled={resending || cooldown > 0}
            onPress={resend}
            style={styles.resendButton}
          >
            <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
              {resending
                ? 'Sending…'
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : 'Resend verification code'}
            </Text>
          </Pressable>

          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Already confirmed using an email link?</Text>
            <Text style={styles.tipText}>
              Your account may already be verified. Go back and sign in with your email and password.
            </Text>
          </View>

          <Pressable onPress={() => router.replace('/auth')} style={styles.signInButton}>
            <Text style={styles.signInText}>Back to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 6 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingRight: 18 },
  backText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  iconWrap: {
    marginTop: 34,
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 28 },
  kicker: {
    marginTop: 24,
    color: colors.coral,
    fontSize: 11,
    fontWeight: '950',
    letterSpacing: 1.7,
  },
  title: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '950',
    letterSpacing: -1.5,
  },
  subtitle: {
    marginTop: 13,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  email: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  codeCard: {
    marginTop: 30,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    padding: 18,
  },
  codeLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  codeInput: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 34,
    fontWeight: '950',
    letterSpacing: 11,
    paddingVertical: 8,
  },
  verifyButton: {
    marginTop: 16,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '950',
  },
  resendButton: {
    alignSelf: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  resendText: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: '900',
  },
  resendDisabled: { color: colors.muted },
  tip: {
    marginTop: 12,
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: '#DAE9B8',
    borderRadius: 18,
    padding: 14,
  },
  tipTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '900',
  },
  tipText: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 4,
  },
  signInButton: {
    alignSelf: 'center',
    padding: 16,
  },
  signInText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '900',
  },
});
