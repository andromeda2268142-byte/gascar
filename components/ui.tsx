import { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';

export function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right ? <Text style={styles.sectionRight}>{right}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ children, active = false }: PropsWithChildren<{ active?: boolean }>) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, accent = false, icon }: { label: string; onPress?: () => void; accent?: boolean; icon?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, accent && styles.buttonAccent, pressed && { opacity: 0.82 }]}>
      {icon}
      <Text style={[styles.buttonText, accent && styles.buttonTextAccent]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: colors.ink, letterSpacing: -0.4 },
  sectionRight: { fontSize: 12, fontWeight: '700', color: colors.muted },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 16 },
  pill: { paddingHorizontal: 13, height: 36, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontSize: 12, fontWeight: '800', color: colors.muted },
  pillTextActive: { color: colors.white },
  button: { minHeight: 50, borderRadius: 16, paddingHorizontal: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonAccent: { backgroundColor: colors.coral },
  buttonText: { color: colors.white, fontWeight: '900', fontSize: 14 },
  buttonTextAccent: { color: colors.white },
});
