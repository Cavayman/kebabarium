import { inject, Injectable, signal } from '@angular/core';
import type { City, RuntimeConfig } from '@kebabarium/shared';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

/** Runtime config + city list, loaded once per page load. */
@Injectable({ providedIn: 'root' })
export class ConfigStore {
  private readonly api = inject(ApiService);
  readonly config = signal<RuntimeConfig | null>(null);
  readonly cities = signal<City[]>([]);
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.loading ??= Promise.all([firstValueFrom(this.api.config()), firstValueFrom(this.api.cities())]).then(([cfg, cities]) => {
      this.config.set(cfg);
      this.cities.set(cities);
    });
    return this.loading;
  }
}

/** Genitive city names for "Топ Львова" (uk); English uses nameEn. */
const GENITIVE: Record<string, string> = { lviv: 'Львова', kyiv: 'Києва', warsaw: 'Варшави', odesa: 'Одеси', kharkiv: 'Харкова' };
export const cityTitle = (c: City, lang: string) => (lang === 'en' ? (c.nameEn ?? c.name) : (GENITIVE[c.slug] ?? c.name));
