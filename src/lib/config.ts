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

/** Previous Netlify hostname — still accepted for Universal Links / pasted join URLs. */
export const LEGACY_API_BASE_URL = 'https://streamquiz.netlify.app';

/** RevenueCat public iOS SDK key. Empty → IAP disabled, free trial only. */
export const REVENUECAT_IOS_KEY = (
  (extra.revenueCatIosKey as string | undefined) ??
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ??
  ''
).trim();

/** True when a usable RevenueCat key is configured (ignores the placeholder). */
export function isBillingConfigured(): boolean {
  return Boolean(REVENUECAT_IOS_KEY) && !REVENUECAT_IOS_KEY.includes('REPLACE_WITH');
}

export function api(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && API_BASE_URL);
}
