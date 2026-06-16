import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, View } from 'react-native';
import { getLocales } from 'expo-localization';
import { getSavedLocale, saveLocale } from '@/lib/client-id';
import { defaultLocaleFromDevice, t as translate } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/types';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  isRtl: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyRtl(locale: Locale) {
  const rtl = locale === 'ar';
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(rtl);
  }
  return rtl;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [isRtl, setIsRtl] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getSavedLocale();
      const initial = saved ?? defaultLocaleFromDevice(getLocales()[0]?.languageTag);
      setLocaleState(initial);
      setIsRtl(applyRtl(initial));
      setReady(true);
    })();
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setIsRtl(applyRtl(next));
    void saveLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey) => translate(locale, key),
      isRtl,
    }),
    [locale, setLocale, isRtl],
  );

  if (!ready) return null;

  return (
    <LocaleContext.Provider value={value}>
      <View style={{ flex: 1, direction: isRtl ? 'rtl' : 'ltr' }}>{children}</View>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
