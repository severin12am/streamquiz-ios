import type { Locale } from '../types';
import { messages, type MessageKey } from './messages';

export type { MessageKey };
export type TranslateFn = (key: MessageKey) => string;

export function t(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages.en[key] ?? key;
}

const SPEECH_LANG: Record<Locale, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  es: 'es-ES',
  ar: 'ar-SA',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
};

export function speechLangFor(locale: Locale): string {
  return SPEECH_LANG[locale];
}

export function defaultLocaleFromDevice(languageTag?: string): Locale {
  const tag = languageTag?.toLowerCase() ?? '';
  if (tag.startsWith('ru')) return 'ru';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('ar')) return 'ar';
  if (tag.startsWith('fr')) return 'fr';
  if (tag.startsWith('de')) return 'de';
  if (tag.startsWith('ja')) return 'ja';
  return 'en';
}
