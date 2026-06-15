/** Globe + current language code; tap opens floating locale menu (web home parity). */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { LOCALE_OPTIONS } from '@/lib/locales';
import type { Locale } from '@/lib/types';
import { colors } from '@/theme';

const SHORT: Record<Locale, string> = {
  en: 'EN',
  ru: 'RU',
  es: 'ES',
  ar: 'AR',
  fr: 'FR',
  de: 'DE',
  ja: 'JA',
};

interface Props {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function LanguagePicker({ locale, onLocaleChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.btn} onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={styles.globe}>🌐</Text>
        <Text style={styles.code}>{SHORT[locale]}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            {LOCALE_OPTIONS.map(({ code, label }) => (
              <Pressable
                key={code}
                style={[styles.item, locale === code && styles.itemActive]}
                onPress={() => {
                  onLocaleChange(code);
                  setOpen(false);
                }}
              >
                <Text style={styles.itemShort}>{SHORT[code]}</Text>
                <Text style={styles.itemLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  globe: { fontSize: 16 },
  code: { color: colors.text, fontSize: 14, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: 16,
  },
  menu: {
    minWidth: 180,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemActive: { backgroundColor: '#d8ebe8' },
  itemShort: { color: colors.accentBright, fontWeight: '700', width: 28 },
  itemLabel: { color: colors.text, fontSize: 15 },
});
