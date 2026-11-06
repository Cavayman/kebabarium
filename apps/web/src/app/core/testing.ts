import { importProvidersFrom } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../public/i18n/en.json';
import uk from '../../../public/i18n/uk.json';

/** Real translations, loaded synchronously, for component tests. */
export function provideTestI18n(lang: 'uk' | 'en' = 'uk') {
  return importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { uk, en },
      translocoConfig: { availableLangs: ['uk', 'en'], defaultLang: lang, reRenderOnLangChange: true },
      preloadLangs: true,
    }),
  );
}
