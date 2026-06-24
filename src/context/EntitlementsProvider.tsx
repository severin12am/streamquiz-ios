/**
 * App-wide subscription + create-quota state.
 *
 * Combines the StoreKit/RevenueCat subscription tier (purchases.ts) with the
 * local create quota (createQuota.ts) so screens can ask one question:
 * "can this user create another quiz, and how many are left?".
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchTier,
  initPurchases,
  onTierChange,
  type Tier,
} from '@/lib/purchases';
import {
  getCreateAllowance,
  recordCreate,
  type CreateAllowance,
} from '@/lib/createQuota';

interface EntitlementsContextValue {
  tier: Tier;
  /** Latest computed allowance; null until first load. */
  allowance: CreateAllowance | null;
  loading: boolean;
  /** Re-read subscription tier + quota (e.g. after a purchase or returning to Home). */
  refresh: () => Promise<CreateAllowance>;
  /** Record a successful create against the quota, then refresh. */
  noteCreated: () => Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<Tier>('free');
  const [allowance, setAllowance] = useState<CreateAllowance | null>(null);
  const [loading, setLoading] = useState(true);
  const tierRef = useRef<Tier>('free');

  const refreshWith = useCallback(async (t: Tier): Promise<CreateAllowance> => {
    tierRef.current = t;
    setTier(t);
    const next = await getCreateAllowance(t);
    setAllowance(next);
    return next;
  }, []);

  const refresh = useCallback(async (): Promise<CreateAllowance> => {
    const t = await fetchTier();
    return refreshWith(t);
  }, [refreshWith]);

  const noteCreated = useCallback(async () => {
    await recordCreate(tierRef.current);
    await refreshWith(tierRef.current);
  }, [refreshWith]);

  useEffect(() => {
    let active = true;
    (async () => {
      await initPurchases();
      const t = await fetchTier();
      if (!active) return;
      await refreshWith(t);
      setLoading(false);
    })();

    const unsubscribe = onTierChange((t) => {
      void refreshWith(t);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshWith]);

  const value = useMemo<EntitlementsContextValue>(
    () => ({ tier, allowance, loading, refresh, noteCreated }),
    [tier, allowance, loading, refresh, noteCreated],
  );

  return (
    <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementsProvider');
  return ctx;
}
