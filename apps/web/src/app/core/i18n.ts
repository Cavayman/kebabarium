import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode, type EnvironmentProviders, type Provider } from '@angular/core';
import { provideTransloco, TranslocoService, type Translation, type TranslocoLoader } from '@jsverse/transloco';

export type Lang = 'uk' | 'en';
export const LANGS: Lang[] = ['uk', 'en'];
const STORAGE_KEY = 'kb.lang';

/** Remembered choice wins; otherwise English for English browsers, Ukrainian for everyone else. */
export function detectLang(browser: string | undefined, stored: string | null): Lang {
  if (stored === 'uk' || stored === 'en') return stored;
  return browser?.toLowerCase().startsWith('en') ? 'en' : 'uk';
}

@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

export function provideI18n(): Array<Provider | EnvironmentProviders> {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return provideTransloco({
    config: {
      availableLangs: LANGS,
      defaultLang: detectLang(typeof navigator !== 'undefined' ? navigator.language : undefined, stored),
      fallbackLang: 'uk',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: { useFallbackTranslation: true },
    },
    loader: HttpTranslationLoader,
  });
}

@Injectable({ providedIn: 'root' })
export class LangService {
  private readonly transloco = inject(TranslocoService);
  readonly current = () => this.transloco.getActiveLang() as Lang;
  set(lang: Lang): void {
    this.transloco.setActiveLang(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }
}
