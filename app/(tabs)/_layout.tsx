import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/constants/theme';

const icon = (symbol: string, active: boolean) => (
  <Text style={{ fontSize: 19, opacity: active ? 1 : 0.58, color: active ? colors.lime : '#A5A79F' }}>{symbol}</Text>
);

export default function TabsLayout() {
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
      <Tabs.Screen name="request" options={{ title: 'Solicitar', tabBarIcon: ({ focused }) => icon('＋', focused) }} />
      <Tabs.Screen name="garage" options={{ title: 'Garaje', tabBarIcon: ({ focused }) => icon('▰', focused) }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi cuenta', tabBarIcon: ({ focused }) => icon('●', focused) }} />
    </Tabs>
  );
}
