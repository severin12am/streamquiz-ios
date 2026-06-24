/** App root: SafeArea + i18n + navigation. Entry: index.ts → expo-router main. */
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@/context/LocaleProvider';
import { EntitlementsProvider } from '@/context/EntitlementsProvider';
import { RootNavigator } from '@/navigation/RootNavigator';
import { initSounds } from '@/lib/sounds';
import { initPurchases } from '@/lib/purchases';

export default function App() {
  useEffect(() => {
    void initSounds();
    void initPurchases();
  }, []);

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <EntitlementsProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </EntitlementsProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
