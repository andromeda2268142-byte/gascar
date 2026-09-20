import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export default function Index() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<'driver' | 'business' | 'admin' | null>(null);
  const [checkingRole, setCheckingRole] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user || !isSupabaseConfigured) {
      setRole(null);
      setCheckingRole(false);
      return;
    }

    let active = true;
    setCheckingRole(true);

    getSupabaseClient()
      .from('gascars_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (active) setRole((data?.role as 'driver' | 'business' | 'admin' | undefined) ?? null);
      })
      .finally(() => {
        if (active) setCheckingRole(false);
      });

    return () => {
      active = false;
    };
  }, [user, loading]);

  if (loading || checkingRole) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  if (user && role === 'admin') {
    return <Redirect href="/admin" />;
  }

  if (user && role === 'business') {
    return <Redirect href="/business" />;
  }

  return <Redirect href="/(tabs)" />;
}
