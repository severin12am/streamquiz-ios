/**
 * RevenueCat (StoreKit) integration for the creator paywall.
 *
 * Joining a quiz is always free; creating a quiz or rematching (fresh AI questions) is gated.
 * Apple requires In-App Purchase for unlocking app functionality, so subscriptions go through
 * StoreKit via RevenueCat (react-native-purchases).
 *
 * The native module is loaded lazily and every call is guarded, so the app keeps
 * running before a native rebuild, inside Jest, or when no RevenueCat key is set.
 * In those cases the user simply stays on the free trial.
 *
 * App Store Connect / RevenueCat setup (see SETUP.md → Monetization):
 *  - Entitlements:  `basic` (30 games / month) and `premium` (300 games / month).
 *  - Products mapped into a single offering with these package identifiers:
 *      BASIC_MONTHLY, BASIC_ANNUAL, PREMIUM_MONTHLY, PREMIUM_ANNUAL.
 */
import { NativeModules, Platform } from 'react-native';
import { REVENUECAT_IOS_KEY, isBillingConfigured } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';

/** Subscription tier resolved from active RevenueCat entitlements. */
export type Tier = 'free' | 'basic' | 'premium';

/** Billing period for a purchasable package. */
export type BillingPeriod = 'monthly' | 'annual';

export const ENTITLEMENT_BASIC = 'basic';
export const ENTITLEMENT_PREMIUM = 'premium';

/** Games a `basic` subscriber can create per calendar month. */
export const BASIC_MONTHLY_GAMES = 30;
/** Games a `premium` subscriber can create per calendar month. */
export const PREMIUM_MONTHLY_GAMES = 300;
/** Free quizzes a brand-new user can create before the hard paywall. */
export const FREE_TRIAL_CREATES = 5;

/** Monthly create cap for a paid tier, or null for the free trial tier. */
export function monthlyCreateLimit(tier: Tier): number | null {
  if (tier === 'basic') return BASIC_MONTHLY_GAMES;
  if (tier === 'premium') return PREMIUM_MONTHLY_GAMES;
  return null;
}

/**
 * A purchasable option shown on the paywall. `price` is the StoreKit-localized
 * string (e.g. "$12.99"); `fallbackPrice` is used only when offerings can't load.
 */
export interface PaywallOption {
  tier: Exclude<Tier, 'free'>;
  period: BillingPeriod;
  /** RevenueCat package identifier. */
  packageId: string;
  /** StoreKit-localized price string, or the fallback when unavailable. */
  price: string;
  /** Whether this price came from a real StoreKit product. */
  available: boolean;
  /** Opaque RevenueCat package (passed back to purchaseOption). */
  raw?: unknown;
}

/** Fallback prices (USD) used when StoreKit offerings are unavailable. */
const FALLBACK_PRICES: Record<string, string> = {
  BASIC_MONTHLY: '$12.99',
  BASIC_ANNUAL: '$124.99',
  PREMIUM_MONTHLY: '$32.99',
  PREMIUM_ANNUAL: '$316.99',
};

const PACKAGE_TIER: Record<string, Exclude<Tier, 'free'>> = {
  BASIC_MONTHLY: 'basic',
  BASIC_ANNUAL: 'basic',
  PREMIUM_MONTHLY: 'premium',
  PREMIUM_ANNUAL: 'premium',
};

const PACKAGE_PERIOD: Record<string, BillingPeriod> = {
  BASIC_MONTHLY: 'monthly',
  BASIC_ANNUAL: 'annual',
  PREMIUM_MONTHLY: 'monthly',
  PREMIUM_ANNUAL: 'annual',
};

/** Order options appear on the paywall. */
const PACKAGE_ORDER = ['BASIC_MONTHLY', 'BASIC_ANNUAL', 'PREMIUM_MONTHLY', 'PREMIUM_ANNUAL'];

type PurchasesModule = typeof import('react-native-purchases').default;

let purchasesModule: PurchasesModule | null | undefined;
let configured = false;

/** True when the native RevenueCat module is linked in this dev/production build. */
function nativePurchasesLinked(): boolean {
  if (Platform.OS !== 'ios') return false;
  // Avoid require('react-native-purchases') when native isn't in the binary — loading
  // the JS module alone crashes (NativeJSLogger) on older dev clients.
  return Boolean(
    NativeModules.RNPurchases ??
      NativeModules.RNPurchasesModule ??
      NativeModules.Purchases,
  );
}

/** Lazily resolve the native module; returns null if unavailable. */
function getPurchases(): PurchasesModule | null {
  if (purchasesModule !== undefined) return purchasesModule;
  if (!nativePurchasesLinked()) {
    purchasesModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    purchasesModule = require('react-native-purchases').default as PurchasesModule;
  } catch {
    purchasesModule = null;
  }
  return purchasesModule;
}

/** True when StoreKit purchases can actually run on this device/build. */
export function billingAvailable(): boolean {
  return Platform.OS === 'ios' && isBillingConfigured() && getPurchases() != null;
}

/** Configure RevenueCat once. Safe to call repeatedly; no-op if not available. */
export async function initPurchases(): Promise<void> {
  if (configured || !billingAvailable()) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });
    configured = true;
    debugLog('info', 'billing', 'RevenueCat configured');
  } catch (e) {
    debugLog('error', 'billing', 'configure failed', String(e));
  }
}

type CustomerInfoLike = {
  entitlements?: { active?: Record<string, unknown> };
};

/** Map a RevenueCat CustomerInfo to our tier (highest entitlement wins). */
export function tierFromCustomerInfo(info: CustomerInfoLike | null | undefined): Tier {
  const active = info?.entitlements?.active ?? {};
  if (active[ENTITLEMENT_PREMIUM]) return 'premium';
  if (active[ENTITLEMENT_BASIC]) return 'basic';
  return 'free';
}

/** Fetch the current subscription tier. Returns 'free' when billing is off. */
export async function fetchTier(): Promise<Tier> {
  if (!billingAvailable()) return 'free';
  await initPurchases();
  const Purchases = getPurchases();
  if (!Purchases) return 'free';
  try {
    const info = await Purchases.getCustomerInfo();
    return tierFromCustomerInfo(info as CustomerInfoLike);
  } catch (e) {
    debugLog('error', 'billing', 'getCustomerInfo failed', String(e));
    return 'free';
  }
}

/** Subscribe to entitlement changes. Returns an unsubscribe fn (no-op if off). */
export function onTierChange(cb: (tier: Tier) => void): () => void {
  if (!billingAvailable()) return () => {};
  const Purchases = getPurchases();
  if (!Purchases) return () => {};
  const listener = (info: unknown) => cb(tierFromCustomerInfo(info as CustomerInfoLike));
  try {
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(listener);
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}

/** Build the paywall option list, using StoreKit prices when available. */
export async function fetchPaywallOptions(): Promise<PaywallOption[]> {
  const fallback = (): PaywallOption[] =>
    PACKAGE_ORDER.map((packageId) => ({
      tier: PACKAGE_TIER[packageId],
      period: PACKAGE_PERIOD[packageId],
      packageId,
      price: FALLBACK_PRICES[packageId],
      available: false,
    }));

  if (!billingAvailable()) return fallback();
  await initPurchases();
  const Purchases = getPurchases();
  if (!Purchases) return fallback();

  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return fallback();

    const byId = new Map<string, unknown>();
    for (const pkg of current.availablePackages) {
      byId.set(pkg.identifier, pkg);
    }

    return PACKAGE_ORDER.map((packageId) => {
      const pkg = byId.get(packageId) as
        | { product?: { priceString?: string } }
        | undefined;
      const priceString = pkg?.product?.priceString;
      return {
        tier: PACKAGE_TIER[packageId],
        period: PACKAGE_PERIOD[packageId],
        packageId,
        price: priceString ?? FALLBACK_PRICES[packageId],
        available: Boolean(pkg),
        raw: pkg,
      };
    });
  } catch (e) {
    debugLog('error', 'billing', 'getOfferings failed', String(e));
    return fallback();
  }
}

export interface PurchaseResult {
  ok: boolean;
  tier: Tier;
  /** True when the user simply cancelled the StoreKit sheet (not an error). */
  cancelled?: boolean;
  error?: string;
}

/** Run the StoreKit purchase for a paywall option. */
export async function purchaseOption(option: PaywallOption): Promise<PurchaseResult> {
  if (!billingAvailable() || !option.raw) {
    return { ok: false, tier: 'free', error: 'Billing is not available on this build.' };
  }
  const Purchases = getPurchases();
  if (!Purchases) return { ok: false, tier: 'free', error: 'Billing unavailable.' };

  try {
    const { customerInfo } = await Purchases.purchasePackage(option.raw as never);
    return { ok: true, tier: tierFromCustomerInfo(customerInfo as CustomerInfoLike) };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) return { ok: false, tier: 'free', cancelled: true };
    debugLog('error', 'billing', 'purchase failed', String(err?.message ?? e));
    return { ok: false, tier: 'free', error: err?.message ?? 'Purchase failed.' };
  }
}

/** Restore prior purchases (App Store requirement). Returns resulting tier. */
export async function restore(): Promise<PurchaseResult> {
  if (!billingAvailable()) {
    return { ok: false, tier: 'free', error: 'Billing is not available on this build.' };
  }
  const Purchases = getPurchases();
  if (!Purchases) return { ok: false, tier: 'free', error: 'Billing unavailable.' };
  try {
    const info = await Purchases.restorePurchases();
    return { ok: true, tier: tierFromCustomerInfo(info as CustomerInfoLike) };
  } catch (e) {
    debugLog('error', 'billing', 'restore failed', String(e));
    return { ok: false, tier: 'free', error: (e as Error)?.message ?? 'Restore failed.' };
  }
}
