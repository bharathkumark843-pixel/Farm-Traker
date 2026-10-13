import { useEffect, useState } from 'react';
import { en, Strings } from './en';
import { te } from './te';
import type { Lang } from '../db/types';
import { getProfile, saveProfile } from '../db/database';

let lang: Lang = 'en';

export function syncLang(next: Lang): void {
  lang = next;
}

export function t(key: keyof Strings): string {
  return (lang === 'te' ? te[key] : en[key]) ?? en[key];
}

// Single shared bilingual helper — selected language goes big, other small.
// Replaces the 7 local `pick()` / `pickGroup()` copies across screens.
export function pickLang(current: Lang, enText: string, teText: string): { primary: string; secondary: string } {
  return current === 'te'
    ? { primary: teText || enText, secondary: enText }
    : { primary: enText, secondary: teText };
}

export function getLang(): Lang {
  return lang;
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => Promise<void> } {
  const [l, setL] = useState<Lang>(lang);
  useEffect(() => {
    getProfile().then((p) => {
      lang = p.lang;
      setL(p.lang);
    });
  }, []);
  async function setLang(next: Lang) {
    lang = next;
    setL(next);
    const p = await getProfile();
    await saveProfile({ ...p, lang: next });
  }
  return { lang: l, setLang };
}
