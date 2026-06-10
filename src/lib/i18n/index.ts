import type { Locale } from '../types';
import { messages, type MessageKey } from './messages';

export type { MessageKey };
export type TranslateFn = (key: MessageKey) => string;

export function t(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages.en[key] ?? key;
}

export function speechLangFor(locale: Locale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US';
}

export function defaultLocaleFromDevice(languageTag?: string): Locale {
  if (languageTag?.toLowerCase().startsWith('ru')) return 'ru';
  return 'en';
}
