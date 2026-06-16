/**
 * Env config from .env / app.config.ts extra. All three vars required (isConfigured).
 * api() builds absolute URLs — required for RN (relative /api/... fails on device).
 */
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const SUPABASE_URL =
  (extra.supabaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  '';

export const SUPABASE_ANON_KEY =
  (extra.supabaseAnonKey as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

export const API_BASE_URL = (
  (extra.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  ''
).replace(/\/$/, '');

export function api(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && API_BASE_URL);
}
