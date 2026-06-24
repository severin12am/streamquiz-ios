/**
 * App navigation + deep links.
 *
 * Routes: Home | Game(gameId, asHost) | Debug (dev only)
 * Prefixes: whosmarter://, streamquiz:// (legacy), EXPO_PUBLIC_API_BASE_URL, expo dev URL.
 * clientId from AsyncStorage — loaded before rendering (required for join reattach).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { getClientId } from '@/lib/client-id';
import { parseGameIdFromLink } from '@/api/client';
import { API_BASE_URL } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';
import { HomeScreen } from '@/screens/HomeScreen';
import { GameScreen } from '@/screens/GameScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { DebugScreen } from '@/screens/DebugScreen';
import { useLocale } from '@/context/LocaleProvider';
import { colors } from '@/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Universal Links: https://your-domain/game/{uuid} opens as guest (parity with web join URL).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'whosmarter://',
    'streamquiz://',
    ...(API_BASE_URL ? [API_BASE_URL] : []),
  ],
  config: {
    screens: {
      Home: '',
      Game: {
        path: 'game/:gameId',
        parse: { asHost: () => false },
      },
    },
  },
};

export function RootNavigator() {
  const { t } = useLocale();
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    void getClientId().then((id) => {
      setClientId(id);
      debugLog('info', 'app', 'client_id ready', { id: id.slice(0, 8) + '…' });
    });
  }, []);

  if (!clientId) return null;

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgCard },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
          // Show only the chevron, not the English word "Back".
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            title: t('pageTitle'),
            headerRight: __DEV__
              ? () => (
                  <Pressable
                    onPress={() => navigation.navigate('Debug')}
                    style={{ paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Logs</Text>
                  </Pressable>
                )
              : undefined,
          })}
        />
        <Stack.Screen
          name="Paywall"
          component={PaywallScreen}
          options={{ title: t('paywallTitle'), presentation: 'modal' }}
        />
        <Stack.Screen
          name="Debug"
          component={DebugScreen}
          options={{ title: 'Debug logs' }}
        />
        <Stack.Screen name="Game" options={{ title: t('gameTitle') }}>
          {(props) => {
            const { gameId, asHost } = props.route.params;
            return <GameScreen gameId={gameId} clientId={clientId} asHost={asHost} />;
          }}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export function parseDeepLink(url: string): { gameId: string; asHost: boolean } | null {
  const id = parseGameIdFromLink(url);
  if (!id) return null;
  const asHost = url.includes('role=host');
  return { gameId: id, asHost };
}
