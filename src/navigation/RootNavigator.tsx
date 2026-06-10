import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { getClientId } from '@/lib/client-id';
import { parseGameIdFromLink } from '@/api/client';
import { debugLog } from '@/lib/debug-log';
import { HomeScreen } from '@/screens/HomeScreen';
import { GameScreen } from '@/screens/GameScreen';
import { DebugScreen } from '@/screens/DebugScreen';
import { colors } from '@/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'streamquiz://'],
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
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            title: 'StreamQuiz',
            headerRight: __DEV__
              ? () => (
                  <Pressable
                    onPress={() => navigation.navigate('Debug')}
                    style={{ paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: '#8b9aab', fontSize: 12 }}>Logs</Text>
                  </Pressable>
                )
              : undefined,
          })}
        />
        <Stack.Screen
          name="Debug"
          component={DebugScreen}
          options={{ title: 'Debug logs' }}
        />
        <Stack.Screen name="Game" options={{ title: 'Game' }}>
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
