import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

const icon = (symbol: string, active: boolean) => (
  <Text style={{ fontSize: 18, opacity: active ? 1 : 0.55, color: active ? colors.lime : '#A5A79F' }}>{symbol}</Text>
);

export default function ProviderTabsLayout() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<'driver' | 'business' | 'admin' | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user || !isSupabaseConfigured) {
      setRole(null);
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);

    getSupabaseClient()
      .from('gascars_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (active) setRole((data?.role as 'driver' | 'business' | 'admin' | undefined) ?? null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [user, loading]);

  if (loading || checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  if (!user) return <Redirect href="/auth" />;
  if (role === 'admin') return <Redirect href="/admin" />;
  if (role !== 'business') return <Redirect href="/(tabs)" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.lime,
        tabBarInactiveTintColor: '#A5A79F',
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: '#20231E',
          borderTopWidth: 0,
          marginHorizontal: 12,
          marginBottom: 10,
          borderRadius: 22,
          position: 'absolute',
        },
        tabBarLabelStyle: { fontSize: 9.5, fontWeight: '800' },
        tabBarItemStyle: { borderRadius: 16 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Portal', tabBarIcon: ({ focused }) => icon('⌂', focused) }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarIcon: ({ focused }) => icon('↗', focused) }} />
      <Tabs.Screen name="services" options={{ title: 'Servicios', tabBarIcon: ({ focused }) => icon('⚙', focused) }} />
      <Tabs.Screen name="credits" options={{ title: 'Créditos', tabBarIcon: ({ focused }) => icon('$', focused) }} />
      <Tabs.Screen name="account" options={{ title: 'Cuenta', tabBarIcon: ({ focused }) => icon('●', focused) }} />
    </Tabs>
  );
}
