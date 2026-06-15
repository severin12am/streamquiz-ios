/** App root: SafeArea + i18n + navigation. Entry: index.ts → expo-router main. */
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@/context/LocaleProvider';
import { RootNavigator } from '@/navigation/RootNavigator';
import { initSounds } from '@/lib/sounds';

export default function App() {
  useEffect(() => {
    void initSounds();
  }, []);

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
