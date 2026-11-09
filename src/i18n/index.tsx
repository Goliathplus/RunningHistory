import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import hant from './zh-Hant.json';
import en from './en.json';
import type { Lang } from '../lib/years';

export type MessageKey = keyof typeof hant;
type Vars = Record<string, string | number>;

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'en', label: 'English' },
];

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { 'zh-Hant': hant, en };
const STORAGE_KEY = 'borders-lang';
const isLang = (v: string | null): v is Lang => LANGUAGES.some((l) => l.code === v);

export function initialLang(): Lang {
  const param = new URLSearchParams(location.search).get('lang');
  if (isLang(param)) return param;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLang(stored)) return stored;
  return /^en\b/i.test(navigator.language) ? 'en' : 'zh-Hant';
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(initialLang);
  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${MESSAGES[lang].title} · 3D`;
  }, [lang]);
  const value = useMemo<I18n>(() => ({
    lang,
    setLang,
    t: (key, vars) => MESSAGES[lang][key].replace(/\{(\w+)\}/g, (_, v: string) => String(vars?.[v] ?? '')),
  }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n 必須在 I18nProvider 內使用');
  return v;
}
