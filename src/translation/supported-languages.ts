export const SUPPORTED_LANGUAGES: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
};

export const DEFAULT_LANGUAGE = 'vi';

export function isSupportedLanguage(code: string): boolean {
  return Boolean(Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, code));
}
