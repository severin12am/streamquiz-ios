import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const CLIENT_ID_KEY = 'streamquiz-client-id';
const PLAYER_NAME_KEY = 'streamquiz-player-name';
const LOCALE_KEY = 'streamquiz-locale';

export async function getClientId(): Promise<string> {
  const existing = await AsyncStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export async function getSavedName(): Promise<string> {
  return (await AsyncStorage.getItem(PLAYER_NAME_KEY)) ?? '';
}

export async function saveName(name: string): Promise<void> {
  await AsyncStorage.setItem(PLAYER_NAME_KEY, name.trim());
}

export async function getSavedLocale(): Promise<'en' | 'ru' | null> {
  const v = await AsyncStorage.getItem(LOCALE_KEY);
  if (v === 'en' || v === 'ru') return v;
  return null;
}

export async function saveLocale(locale: 'en' | 'ru'): Promise<void> {
  await AsyncStorage.setItem(LOCALE_KEY, locale);
}
