import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { colors } from '@/constants/theme';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

const icon = (symbol: string, active: boolean) => (
  <Text style={{ fontSize: 19, opacity: active ? 1 : 0.58, color: active ? colors.lime : '#A5A79F' }}>{symbol}</Text>
);

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<'driver' | 'business' | 'admin' | null>(null);
  const [checking, setChecking] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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

  useEffect(() => {
    if (!user || role !== 'driver' || !isSupabaseConfigured) {
      setUnreadCount(0);
      return;
    }

    const supabase = getSupabaseClient();

    const loadUnread = async () => {
      const { count } = await supabase
        .from('gascars_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);

      setUnreadCount(count ?? 0);
    };

    void loadUnread();

    const channel = supabase
      .channel('driver-tab-notifications-' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gascars_notifications', filter: 'user_id=eq.' + user.id },
        () => void loadUnread(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, user]);

  if (loading || checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  if (role === 'admin') return <Redirect href="/admin" />;
  if (role === 'business') return <Redirect href="/business" />;

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
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800' },
        tabBarItemStyle: { borderRadius: 16 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: ({ focused }) => icon('⌖', focused) }} />
      <Tabs.Screen
        name="request"
        options={{
          title: 'Solicitar',
          tabBarIcon: ({ focused }) => icon('＋', focused),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.coral,
            color: colors.white,
            fontSize: 8,
            fontWeight: '900',
          },
        }}
      />
      <Tabs.Screen name="garage" options={{ title: 'Garaje', tabBarIcon: ({ focused }) => icon('▰', focused) }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi cuenta', tabBarIcon: ({ focused }) => icon('●', focused) }} />
    </Tabs>
  );
}
