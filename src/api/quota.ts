/**
 * Optional server-authoritative quota sync (GET /api/quota).
 * Falls back to local AsyncStorage until the web API is deployed — see server-reference/.
 */
import { api } from '@/lib/config';
import { applyServerQuota, type CreateAllowance } from '@/lib/createQuota';
import { quotaRequestHeaders } from '@/api/quotaHeaders';
import { debugLog } from '@/lib/debug-log';

export async function fetchServerQuota(): Promise<CreateAllowance | null> {
  try {
    const res = await fetch(api('/api/quota'), {
      headers: await quotaRequestHeaders(),
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      debugLog('warn', 'quota', `GET /api/quota ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { quota?: CreateAllowance };
    if (!data.quota || typeof data.quota.remaining !== 'number') return null;
    return applyServerQuota(data.quota);
  } catch (e) {
    debugLog('warn', 'quota', 'fetch failed', String(e));
    return null;
  }
}

export type { CreateAllowance };
