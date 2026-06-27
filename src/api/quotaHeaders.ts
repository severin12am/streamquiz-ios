import { getQuotaKey } from '@/lib/quotaIdentity';

/** Headers sent to create-game / generate-questions / quota API routes. */
export async function quotaRequestHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const key = await getQuotaKey();
  return {
    ...extra,
    'X-Quota-Key': key,
  };
}
