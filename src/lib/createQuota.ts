/**
 * Local "create a quiz" quota — gates hosting only (joining is always free).
 * Each new game and each rematch (fresh AI questions) counts as one create.
 *
 *  - free       → FREE_TRIAL_CREATES (5) quizzes ever, then a hard paywall.
 *  - basic      → BASIC_MONTHLY_GAMES (30) quizzes per calendar month.
 *  - premium    → PREMIUM_MONTHLY_GAMES (300) quizzes per calendar month.
 *
 * There is no account system in this app (anonymous, link-based), so usage is
 * tracked per-install in AsyncStorage. Subscription state itself is owned by
 * StoreKit/RevenueCat (cross-device, restorable); only the counters live here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FREE_TRIAL_CREATES, monthlyCreateLimit, type Tier } from '@/lib/purchases';

const FREE_CREATES_KEY = 'whosmarter-free-creates';
const MONTHLY_CREATES_KEY = 'whosmarter-monthly-creates';

/** Current calendar month as `YYYY-MM` (local time). */
function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function readInt(key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface MonthlyRecord {
  month: string;
  count: number;
}

async function readMonthly(): Promise<MonthlyRecord> {
  const raw = await AsyncStorage.getItem(MONTHLY_CREATES_KEY);
  const month = currentMonth();
  if (!raw) return { month, count: 0 };
  try {
    const parsed = JSON.parse(raw) as MonthlyRecord;
    if (parsed.month !== month) return { month, count: 0 };
    return { month, count: parsed.count > 0 ? parsed.count : 0 };
  } catch {
    return { month, count: 0 };
  }
}

export interface CreateAllowance {
  allowed: boolean;
  tier: Tier;
  /** Quizzes used in the current window (free: ever; paid: this month). */
  used: number;
  /** Window cap for the current tier. */
  limit: number;
  /** Quizzes left before the paywall. */
  remaining: number;
}

/** Last quota snapshot returned by the server (authoritative when set). */
let serverSnapshot: CreateAllowance | null = null;

/** Apply quota from a create-game / generate-questions / GET /api/quota response. */
export function applyServerQuota(snapshot: CreateAllowance): CreateAllowance {
  serverSnapshot = snapshot;
  void syncLocalFromSnapshot(snapshot);
  return snapshot;
}

export function clearServerQuotaCache(): void {
  serverSnapshot = null;
}

async function syncLocalFromSnapshot(snapshot: CreateAllowance): Promise<void> {
  const month = currentMonth();
  if (snapshot.tier === 'free') {
    await AsyncStorage.setItem(FREE_CREATES_KEY, String(snapshot.used));
    return;
  }
  await AsyncStorage.setItem(
    MONTHLY_CREATES_KEY,
    JSON.stringify({ month, count: snapshot.used } satisfies MonthlyRecord),
  );
}

/** Whether the user may create another quiz right now, with usage details. */
export async function getCreateAllowance(tier: Tier): Promise<CreateAllowance> {
  if (serverSnapshot) return serverSnapshot;

  const monthlyLimit = monthlyCreateLimit(tier);
  if (monthlyLimit != null) {
    const { count } = await readMonthly();
    const remaining = Math.max(0, monthlyLimit - count);
    return {
      allowed: remaining > 0,
      tier,
      used: count,
      limit: monthlyLimit,
      remaining,
    };
  }
  const used = await readInt(FREE_CREATES_KEY);
  const remaining = Math.max(0, FREE_TRIAL_CREATES - used);
  return { allowed: remaining > 0, tier, used, limit: FREE_TRIAL_CREATES, remaining };
}

/**
 * Record one successful game creation against the current tier's quota.
 * Call only after the game row is actually created.
 */
export async function recordCreate(tier: Tier): Promise<void> {
  if (monthlyCreateLimit(tier) != null) {
    const { month, count } = await readMonthly();
    const next: MonthlyRecord = { month, count: count + 1 };
    await AsyncStorage.setItem(MONTHLY_CREATES_KEY, JSON.stringify(next));
    return;
  }
  const used = await readInt(FREE_CREATES_KEY);
  await AsyncStorage.setItem(FREE_CREATES_KEY, String(used + 1));
}

/** __DEV__ only — clears local create counters so you can host again. */
export async function resetCreateQuota(): Promise<void> {
  serverSnapshot = null;
  await AsyncStorage.multiRemove([FREE_CREATES_KEY, MONTHLY_CREATES_KEY]);
}
