import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
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

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  async function resend() {
    if (!email || resending || cooldown) return;

    setResending(true);
    try {
      const { error } = await getSupabaseClient().auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;

      setCooldown(true);
      setTimeout(() => setCooldown(false), 60000);
      Alert.alert(
        'Confirmation email sent',
        'Open the new email from Supabase Auth and tap “Confirm email address”.',
      );
    } catch (error) {
      Alert.alert(
        'Could not resend email',
        error instanceof Error ? error.message : 'Please try again shortly.',
      );
    } finally {
      setResending(false);
    }
  }

  function continueToSignIn() {
    if (!email) {
      router.replace('/auth');
      return;
    }

    router.replace({
      pathname: '/auth',
      params: {
        email,
        mode: 'signin',
        verified: '1',
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
          We sent a confirmation email to
        </Text>
        <Text style={styles.email}>{email || 'your email address'}</Text>

        <View style={styles.instructionsCard}>
          <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>Open the email</Text>
              <Text style={styles.stepText}>Look for the message titled “Confirm your email address”.</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>Tap “Confirm email address”</Text>
              <Text style={styles.stepText}>That verifies the account with Supabase.</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>Come back to Gas Car’s</Text>
              <Text style={styles.stepText}>Then sign in with the email and password you just created.</Text>
            </View>
          </View>
        </View>

        <Pressable onPress={continueToSignIn} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>I confirmed my email</Text>
        </Pressable>

        <Pressable
          disabled={resending || cooldown}
          onPress={() => void resend()}
          style={styles.resendButton}
        >
          {resending ? (
            <ActivityIndicator color={colors.coral} />
          ) : (
            <Text style={[styles.resendText, cooldown && styles.resendDisabled]}>
              {cooldown ? 'Email sent — wait 60 seconds' : 'Resend confirmation email'}
            </Text>
          )}
        </Pressable>

        <View style={styles.note}>
          <Text style={styles.noteTitle}>Why no 6-digit code?</Text>
          <Text style={styles.noteText}>
            This Supabase project currently verifies new accounts with a confirmation link. The app now matches the email you actually receive.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 6 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingRight: 18 },
  backText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  iconWrap: {
    marginTop: 28,
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
  instructionsCard: {
    marginTop: 26,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    padding: 16,
  },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: colors.coral, fontSize: 12, fontWeight: '950' },
  stepTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  stepText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 13 },
  primaryButton: {
    marginTop: 18,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '950' },
  resendButton: {
    alignSelf: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: { color: colors.coral, fontSize: 12, fontWeight: '900' },
  resendDisabled: { color: colors.muted },
  note: {
    marginTop: 8,
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: '#DAE9B8',
    borderRadius: 18,
    padding: 14,
  },
  noteTitle: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  noteText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
});
