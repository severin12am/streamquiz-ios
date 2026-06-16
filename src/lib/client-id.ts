/**
 * Stable per-install identity (replaces web localStorage).
 * Keys match web: whosmarter-client-id, whosmarter-player-name, whosmarter-locale.
 * client_id survives app restart — same seat reattaches via joinGame().
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isLocale } from '@/lib/locales';
import type { Locale } from '@/lib/types';

const CLIENT_ID_KEY = 'whosmarter-client-id';
const PLAYER_NAME_KEY = 'whosmarter-player-name';
const LOCALE_KEY = 'whosmarter-locale';

const LEGACY_KEYS: Record<string, string> = {
  [CLIENT_ID_KEY]: 'streamquiz-client-id',
  [PLAYER_NAME_KEY]: 'streamquiz-player-name',
  [LOCALE_KEY]: 'streamquiz-locale',
};

async function getWithLegacy(key: string): Promise<string | null> {
  const value = await AsyncStorage.getItem(key);
  if (value) return value;
  const legacy = LEGACY_KEYS[key];
  if (!legacy) return null;
  const old = await AsyncStorage.getItem(legacy);
  if (old) await AsyncStorage.setItem(key, old);
  return old;
}

export async function getClientId(): Promise<string> {
  const existing = await getWithLegacy(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export async function getSavedName(): Promise<string> {
  return (await getWithLegacy(PLAYER_NAME_KEY)) ?? '';
}

export async function saveName(name: string): Promise<void> {
  await AsyncStorage.setItem(PLAYER_NAME_KEY, name.trim());
}

export async function getSavedLocale(): Promise<Locale | null> {
  const v = await getWithLegacy(LOCALE_KEY);
  return v && isLocale(v) ? v : null;
}

export async function saveLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_KEY, locale);
}
