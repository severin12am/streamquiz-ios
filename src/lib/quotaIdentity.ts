/**
 * Stable key for server-side create quota.
 * Prefer RevenueCat app user ID (survives reinstall when purchases restored);
 * fall back to per-install client ID prefixed with device:.
 */
import { getRevenueCatAppUserId } from '@/lib/purchases';

export async function getQuotaKey(): Promise<string> {
  const rcId = await getRevenueCatAppUserId();
  if (rcId) return rcId;
  const { getClientId } = await import('@/lib/client-id');
  return `device:${await getClientId()}`;
}
