import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { useAuth } from '@/providers/auth';

type Vehicle = {
  id: string;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  fuel_type: string | null;
  is_primary: boolean;
};

function vehicleTitle(vehicle: Vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

export default function GarageScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [mileage, setMileage] = useState('');
  const [fuelType, setFuelType] = useState('Regular');

  const loadVehicles = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setVehicles([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await getSupabaseClient()
        .from('gascars_vehicles')
        .select('id,year,make,model,trim,mileage,fuel_type,is_primary')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setVehicles((data ?? []) as Vehicle[]);
    } catch (error) {
      Alert.alert('Could not load your garage', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const primaryVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.is_primary) ?? vehicles[0] ?? null,
    [vehicles],
  );

  async function addVehicle() {
    if (!user || saving) return;

    if (!make.trim() || !model.trim()) {
      Alert.alert('Vehicle details needed', 'Add at least the make and model.');
      return;
    }

    const parsedYear = year.trim() ? Number(year) : null;
    const parsedMileage = mileage.trim() ? Number(mileage.replace(/,/g, '')) : null;

    if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > new Date().getFullYear() + 1)) {
      Alert.alert('Check the year', 'Enter a valid vehicle year.');
      return;
    }

    if (parsedMileage !== null && (!Number.isFinite(parsedMileage) || parsedMileage < 0)) {
      Alert.alert('Check the mileage', 'Enter a valid mileage.');
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('gascars_vehicles').insert({
        user_id: user.id,
        year: parsedYear,
        make: make.trim(),
        model: model.trim(),
        trim: trim.trim() || null,
        mileage: parsedMileage == null ? null : Math.round(parsedMileage),
        fuel_type: fuelType.trim() || null,
        is_primary: vehicles.length === 0,
      });

      if (error) throw error;

      setShowAdd(false);
      setYear('');
      setMake('');
      setModel('');
      setTrim('');
      setMileage('');
      setFuelType('Regular');
      await loadVehicles();
    } catch (error) {
      Alert.alert('Could not add vehicle', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(vehicleId: string) {
    if (!user || !isSupabaseConfigured) return;
    try {
      const supabase = getSupabaseClient();
      const { error: clearError } = await supabase
        .from('gascars_vehicles')
        .update({ is_primary: false })
        .eq('user_id', user.id)
        .neq('id', vehicleId);
      if (clearError) throw clearError;

      const { error: setError } = await supabase
        .from('gascars_vehicles')
        .update({ is_primary: true })
        .eq('user_id', user.id)
        .eq('id', vehicleId);
      if (setError) throw setError;

      await loadVehicles();
    } catch (error) {
      Alert.alert('Could not change primary vehicle', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>MY GARAGE</Text>
            <Text style={styles.title}>Your vehicles</Text>
            <Text style={styles.subtitle}>Choose a vehicle once and Gas Car's can reuse it in service requests.</Text>
          </View>
          <Pressable onPress={() => user ? setShowAdd(true) : router.push('/auth')} style={styles.addButton}>
            <Text style={styles.addButtonText}>＋</Text>
          </Pressable>
        </View>

        {!user ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sign in to build your garage</Text>
            <Text style={styles.emptyText}>Your saved vehicles stay connected to your account.</Text>
            <View style={styles.emptyAction}>
              <PrimaryButton label="Sign in" accent onPress={() => router.push('/auth')} />
            </View>
          </Card>
        ) : loading ? (
          <Card style={styles.emptyCard}><Text style={styles.emptyText}>Loading your garage…</Text></Card>
        ) : vehicles.length ? (
          <>
            {vehicles.map((vehicle) => (
              <Pressable
                key={vehicle.id}
                onPress={() => void makePrimary(vehicle.id)}
                style={[styles.carCard, vehicle.is_primary && styles.carCardPrimary]}
              >
                <View style={styles.carTop}>
                  <Text style={styles.carEmoji}>🚘</Text>
                  <View style={[styles.activePill, !vehicle.is_primary && styles.secondaryPill]}>
                    <Text style={styles.activeText}>{vehicle.is_primary ? 'PRIMARY' : 'MAKE PRIMARY'}</Text>
                  </View>
                </View>
                <Text style={styles.vehicleLabel}>{vehicle.trim || 'Saved vehicle'}</Text>
                <Text style={styles.vehicleName}>{vehicleTitle(vehicle)}</Text>
                <View style={styles.vehicleMetaRow}>
                  <Text style={styles.vehicleMeta}>
                    {vehicle.mileage != null ? vehicle.mileage.toLocaleString() + ' mi' : 'Mileage not set'}
                  </Text>
                  <Text style={styles.vehicleMeta}>·</Text>
                  <Text style={styles.vehicleMeta}>{vehicle.fuel_type || 'Fuel not set'}</Text>
                </View>
              </Pressable>
            ))}

            {primaryVehicle ? (
              <PrimaryButton
                label={'Request service for ' + [primaryVehicle.make, primaryVehicle.model].join(' ')}
                accent
                onPress={() => router.push({
                  pathname: '/(tabs)/request',
                  params: { vehicleId: primaryVehicle.id },
                })}
              />
            ) : null}
          </>
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🚘</Text>
            <Text style={styles.emptyTitle}>Add your first vehicle</Text>
            <Text style={styles.emptyText}>Gas Car's will automatically attach it to future service requests.</Text>
            <View style={styles.emptyAction}>
              <PrimaryButton label="Add vehicle" accent onPress={() => setShowAdd(true)} />
            </View>
          </Card>
        )}

        {vehicles.length ? (
          <View style={styles.tipWrap}>
            <SectionTitle title="How Garage helps" />
            <Card style={styles.tipCard}>
              <Text style={styles.tipTitle}>Faster service requests</Text>
              <Text style={styles.tipText}>Year, make and model are sent with the request so the provider knows which vehicle needs help.</Text>
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalKicker}>GARAGE</Text>
                <Text style={styles.modalTitle}>Add vehicle</Text>
              </View>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={10}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.twoCol}>
                <View style={{ flex: 0.8 }}>
                  <Text style={styles.label}>Year</Text>
                  <TextInput value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2019" placeholderTextColor="#9B9E96" style={styles.input} />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.label}>Make</Text>
                  <TextInput value={make} onChangeText={setMake} placeholder="Toyota" placeholderTextColor="#9B9E96" style={styles.input} autoCapitalize="words" />
                </View>
              </View>

              <Text style={styles.label}>Model</Text>
              <TextInput value={model} onChangeText={setModel} placeholder="Camry" placeholderTextColor="#9B9E96" style={styles.input} autoCapitalize="words" />

              <Text style={styles.label}>Trim</Text>
              <TextInput value={trim} onChangeText={setTrim} placeholder="SE (optional)" placeholderTextColor="#9B9E96" style={styles.input} />

              <Text style={styles.label}>Mileage</Text>
              <TextInput value={mileage} onChangeText={setMileage} keyboardType="number-pad" placeholder="67420" placeholderTextColor="#9B9E96" style={styles.input} />

              <Text style={styles.label}>Fuel</Text>
              <View style={styles.fuelRow}>
                {['Regular', 'Premium', 'Diesel', 'Electric'].map((fuel) => (
                  <Pressable
                    key={fuel}
                    onPress={() => setFuelType(fuel)}
                    style={[styles.fuelChip, fuelType === fuel && styles.fuelChipActive]}
                  >
                    <Text style={[styles.fuelChipText, fuelType === fuel && styles.fuelChipTextActive]}>{fuel}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.saveWrap}>
                <PrimaryButton label={saving ? 'Saving…' : 'Save vehicle'} accent onPress={saving ? undefined : addVehicle} />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 110 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 18 },
  kicker: { color: colors.violet, fontSize: 11, fontWeight: '950', letterSpacing: 1.6 },
  title: { marginTop: 5, color: colors.ink, fontSize: 30, fontWeight: '950', letterSpacing: -1.1 },
  subtitle: { color: colors.muted, marginTop: 5, fontSize: 10.5, lineHeight: 15, maxWidth: 300 },
  addButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: colors.lime, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  carCard: { marginBottom: 10, backgroundColor: colors.white, borderRadius: 24, padding: 18, minHeight: 164, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.line },
  carCardPrimary: { backgroundColor: colors.violetSoft, borderColor: '#D8CDF8' },
  carTop: { position: 'absolute', left: 18, right: 18, top: 16, flexDirection: 'row', justifyContent: 'space-between' },
  carEmoji: { fontSize: 38 },
  activePill: { alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  secondaryPill: { backgroundColor: '#F2F0E9' },
  activeText: { color: colors.ink, fontSize: 7.5, fontWeight: '950', letterSpacing: 0.4 },
  vehicleLabel: { color: colors.muted, fontSize: 9.5, fontWeight: '800' },
  vehicleName: { marginTop: 4, color: colors.ink, fontSize: 23, fontWeight: '950', letterSpacing: -0.5 },
  vehicleMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  vehicleMeta: { color: colors.muted, fontSize: 9.5 },
  emptyCard: { alignItems: 'center', paddingVertical: 24, marginTop: 6 },
  emptyIcon: { fontSize: 38, marginBottom: 8 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '950', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5, maxWidth: 310 },
  emptyAction: { width: '100%', marginTop: 16 },
  tipWrap: { marginTop: 24 },
  tipCard: { backgroundColor: colors.limeSoft },
  tipTitle: { color: colors.ink, fontSize: 11.5, fontWeight: '950' },
  tipText: { color: colors.muted, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(24,26,22,0.45)', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '88%', backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  modalKicker: { color: colors.coral, fontSize: 8.5, fontWeight: '950', letterSpacing: 1.1 },
  modalTitle: { color: colors.ink, fontSize: 25, fontWeight: '950', marginTop: 3 },
  close: { color: colors.muted, fontSize: 28, lineHeight: 30 },
  twoCol: { flexDirection: 'row', gap: 9 },
  label: { color: colors.ink, fontSize: 10.5, fontWeight: '900', marginTop: 10, marginBottom: 5 },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, color: colors.ink, fontSize: 12 },
  fuelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fuelChip: { borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 11, paddingVertical: 8 },
  fuelChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  fuelChipText: { color: colors.ink, fontSize: 9, fontWeight: '900' },
  fuelChipTextActive: { color: colors.lime },
  saveWrap: { marginTop: 20 },
});
