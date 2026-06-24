/**
 * Local "create a quiz" quota — gates game creation only (joining is always free).
 *
 *  - free       → FREE_TRIAL_CREATES (5) quizzes ever, then a hard paywall.
 *  - limited    → LIMITED_MONTHLY_GAMES (30) quizzes per calendar month.
 *  - unlimited  → no limit.
 *
 * There is no account system in this app (anonymous, link-based), so usage is
 * tracked per-install in AsyncStorage. Subscription state itself is owned by
 * StoreKit/RevenueCat (cross-device, restorable); only the counters live here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FREE_TRIAL_CREATES, LIMITED_MONTHLY_GAMES, type Tier } from '@/lib/purchases';

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
  /** Quizzes used in the current window (free: ever; limited: this month). */
  used: number;
  /** Window cap (Infinity for unlimited). */
  limit: number;
  /** Quizzes left before the paywall (Infinity for unlimited). */
  remaining: number;
}

/** Whether the user may create another quiz right now, with usage details. */
export async function getCreateAllowance(tier: Tier): Promise<CreateAllowance> {
  if (tier === 'unlimited') {
    return { allowed: true, tier, used: 0, limit: Infinity, remaining: Infinity };
  }
  if (tier === 'limited') {
    const { count } = await readMonthly();
    const remaining = Math.max(0, LIMITED_MONTHLY_GAMES - count);
    return {
      allowed: remaining > 0,
      tier,
      used: count,
      limit: LIMITED_MONTHLY_GAMES,
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
  if (tier === 'unlimited') return;
  if (tier === 'limited') {
    const { month, count } = await readMonthly();
    const next: MonthlyRecord = { month, count: count + 1 };
    await AsyncStorage.setItem(MONTHLY_CREATES_KEY, JSON.stringify(next));
    return;
  }
  const used = await readInt(FREE_CREATES_KEY);
  await AsyncStorage.setItem(FREE_CREATES_KEY, String(used + 1));
}
