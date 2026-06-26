/**
 * Creator paywall. Joining quizzes is always free; this screen sells the two
 * creation plans (Basic: 30 games / month, Premium: 300 games / month), each
 * with a monthly or annual (20% off) billing period.
 *
 * Reached from HomeScreen when the free trial (5 quizzes) is used up, or when a
 * paid subscriber hits their monthly cap. Purchases go through StoreKit
 * via RevenueCat (src/lib/purchases.ts); when billing isn't configured on the
 * build, the plans render with fallback prices and Subscribe is disabled.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLocale } from '@/context/LocaleProvider';
import { useEntitlements } from '@/context/EntitlementsProvider';
import { KeycapButton } from '@/components/KeycapButton';
import {
  billingAvailable,
  fetchPaywallOptions,
  purchaseOption,
  restore,
  type BillingPeriod,
  type PaywallOption,
  type Tier,
} from '@/lib/purchases';
import { playSound } from '@/lib/sounds';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

const PLAN_TIERS: Exclude<Tier, 'free'>[] = ['basic', 'premium'];

export function PaywallScreen({ navigation, route }: Props) {
  const { t } = useLocale();
  const { tier: currentTier, refresh } = useEntitlements();
  const reason = route.params?.reason;

  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [options, setOptions] = useState<PaywallOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const opts = await fetchPaywallOptions();
      if (!active) return;
      setOptions(opts);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const optionFor = (tier: Exclude<Tier, 'free'>): PaywallOption | undefined =>
    options.find((o) => o.tier === tier && o.period === period);

  const finishIfEntitled = async (resultTier: Tier) => {
    await refresh();
    if (resultTier !== 'free') {
      Alert.alert(t('paywallTitle'), t('purchaseSuccess'));
      navigation.goBack();
    }
  };

  const handleSubscribe = async (tier: Exclude<Tier, 'free'>) => {
    const option = optionFor(tier);
    if (!option) return;
    if (!billingAvailable()) {
      Alert.alert(t('paywallTitle'), t('billingUnavailable'));
      return;
    }
    playSound('click');
    setBusy(true);
    try {
      const res = await purchaseOption(option);
      if (res.cancelled) return;
      if (!res.ok) {
        Alert.alert(t('paywallTitle'), res.error ?? t('billingUnavailable'));
        return;
      }
      await finishIfEntitled(res.tier);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      const res = await restore();
      if (!res.ok) {
        Alert.alert(t('restorePurchases'), res.error ?? t('billingUnavailable'));
        return;
      }
      if (res.tier === 'free') {
        Alert.alert(t('restorePurchases'), t('restoreNone'));
        await refresh();
        return;
      }
      Alert.alert(t('restorePurchases'), t('restoreSuccess'));
      await finishIfEntitled(res.tier);
    } finally {
      setBusy(false);
    }
  };

  const headline =
    reason === 'monthly' ? t('paywallMonthlyReached') : t('paywallTrialEnded');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{headline}</Text>
      <Text style={styles.title}>{t('paywallTitle')}</Text>
      <Text style={styles.subtitle}>{t('paywallSubtitle')}</Text>

      <View style={styles.periodRow}>
        <PeriodTab
          label={t('billingMonthly')}
          active={period === 'monthly'}
          onPress={() => setPeriod('monthly')}
        />
        <PeriodTab
          label={t('billingAnnual')}
          badge={t('billingAnnualSave')}
          active={period === 'annual'}
          onPress={() => setPeriod('annual')}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        PLAN_TIERS.map((tier) => {
          const option = optionFor(tier);
          const isCurrent = currentTier === tier;
          const name = tier === 'basic' ? t('planBasic') : t('planPremium');
          const desc = tier === 'basic' ? t('planBasicDesc') : t('planPremiumDesc');
          const suffix = period === 'annual' ? t('perYear') : t('perMonth');
          return (
            <View key={tier} style={[styles.card, tier === 'premium' && styles.cardFeatured]}>
              <View style={styles.cardHeader}>
                <Text style={styles.planName}>{name}</Text>
                {tier === 'premium' ? (
                  <View style={styles.bestBadge}>
                    <Text style={styles.bestBadgeText}>★</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.planDesc}>{desc}</Text>
              <Text style={styles.price}>
                {option?.price ?? '—'}
                <Text style={styles.priceSuffix}> {suffix}</Text>
              </Text>
              {isCurrent ? (
                <View style={styles.currentPill}>
                  <Text style={styles.currentPillText}>{t('currentPlan')}</Text>
                </View>
              ) : (
                <KeycapButton
                  variant={tier === 'premium' ? 'primary' : 'secondary'}
                  disabled={busy}
                  onPress={() => handleSubscribe(tier)}
                >
                  {t('subscribe')}
                </KeycapButton>
              )}
            </View>
          );
        })
      )}

      {!billingAvailable() ? (
        <Text style={styles.notice}>{t('billingUnavailable')}</Text>
      ) : null}

      <KeycapButton
        variant="secondary"
        disabled={busy}
        onPress={handleRestore}
        style={styles.restoreBtn}
      >
        {busy ? <ActivityIndicator color={colors.text} /> : t('restorePurchases')}
      </KeycapButton>

      <Text style={styles.terms}>{t('paywallTerms')}</Text>
    </ScrollView>
  );
}

function PeriodTab({
  label,
  badge,
  active,
  onPress,
}: {
  label: string;
  badge?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <KeycapButton
      variant={active ? 'primary' : 'secondary'}
      onPress={onPress}
      style={styles.periodTab}
      contentStyle={styles.periodFace}
    >
      <View style={styles.periodInner}>
        <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>{label}</Text>
        {badge ? (
          <Text style={[styles.periodBadge, active && styles.periodBadgeActive]}>{badge}</Text>
        ) : null}
      </View>
    </KeycapButton>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 4,
  },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodTab: { flex: 1 },
  periodFace: { paddingVertical: 10 },
  periodInner: { alignItems: 'center', gap: 2 },
  periodLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  periodLabelActive: { color: colors.onPrimary },
  periodBadge: { color: colors.correct, fontSize: 11, fontWeight: '700' },
  periodBadgeActive: { color: colors.onPrimary },
  loader: { marginVertical: 40 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 8,
  },
  cardFeatured: { borderColor: colors.accent, borderWidth: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  bestBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestBadgeText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  planDesc: { color: colors.textSecondary, fontSize: 14, lineHeight: 19 },
  price: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 2 },
  priceSuffix: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  currentPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  currentPillText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  notice: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  restoreBtn: { marginTop: 4 },
  terms: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
});
