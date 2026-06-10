import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@/context/LocaleProvider';
import { RootNavigator } from '@/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
