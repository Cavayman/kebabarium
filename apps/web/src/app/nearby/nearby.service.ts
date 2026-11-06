import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { NearResponse } from '@kebabarium/shared';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ConfigStore } from '../core/config.store';
import type { LngLat } from '../map/map-provider';
import type { Radar } from '../map/radar';
import { ToastService } from '../ui/toast';

export type Radius = 1 | 2 | 5;
export type NearPhase = 'idle' | 'locating' | 'pick' | 'scanning' | 'done';

/** What the nearby flow needs from the page that owns the map. */
export interface NearbyHost {
  flyTo(c: LngLat, zoom: number, pitch?: number): Promise<void>;
  radar(): Radar | null;
  /** Only these columns stay lit; null = all lit. */
  setLit(ids: Set<number> | null): void;
}

const ZOOM: Record<Radius, number> = { 1: 14.2, 2: 13.4, 5: 12.2 };
const SCAN_MS = 2500;
const GPS_TIMEOUT_MS = 8000;

/** "Поруч": GPS → fly → radar scan → nearby list; manual point when GPS is unavailable (spec §2). */
@Injectable()
export class NearbyService {
  private readonly api = inject(ApiService);
  private readonly cfg = inject(ConfigStore);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private host: NearbyHost | null = null;
  private run = 0;

  readonly phase = signal<NearPhase>('idle');
  readonly center = signal<LngLat | null>(null);
  readonly result = signal<NearResponse | null>(null);

  attach(host: NearbyHost): void {
    this.host = host;
  }

  async start(): Promise<void> {
    this.close();
    this.phase.set('locating');
    this.toast.show(this.t.translate('near.locating'), 2500);
    const pos = await this.locate();
    if (!pos || !this.inSomeCity(pos)) {
      this.phase.set('pick');
      this.toast.show(this.t.translate('near.noGps'), 6000);
      return;
    }
    await this.scan(pos);
  }

  /** In pick mode the next map click becomes the search point. Returns true when consumed. */
  mapClicked(c: LngLat): boolean {
    if (this.phase() !== 'pick') return false;
    void this.scan(c);
    return true;
  }

  setRadius(r: Radius): Promise<void> {
    const c = this.center();
    return c ? this.scan(c, r) : Promise.resolve();
  }

  close(): void {
    this.run++;
    this.host?.radar()?.hide();
    this.host?.setLit(null);
    this.result.set(null);
    this.phase.set('idle');
  }

  private async scan(c: LngLat, r?: Radius): Promise<void> {
    const run = ++this.run;
    this.center.set(c);
    this.phase.set('scanning');
    const started = Date.now();
    const [res] = await Promise.all([
      firstValueFrom(this.api.near(c.lat, c.lng, r)).catch(() => null),
      this.host?.flyTo(c, ZOOM[r ?? 1], 45),
    ]);
    if (run !== this.run) return;
    const km = (res?.radiusKm ?? r ?? 1) as Radius;
    if (!r && km !== 1) await this.host?.flyTo(c, ZOOM[km], 45);
    this.host?.radar()?.show(c, km);
    const rest = SCAN_MS - (Date.now() - started);
    if (rest > 0) await new Promise((ok) => setTimeout(ok, rest));
    if (run !== this.run) return;
    this.host?.radar()?.finish();
    const result = res ?? { radiusKm: km, autoWidened: false, items: [] };
    this.host?.setLit(new Set(result.items.map((i) => i.id)));
    this.result.set(result);
    this.phase.set('done');
  }

  private inSomeCity(p: LngLat): boolean {
    return this.cfg.cities().some((c) => p.lng >= c.bbox[0] && p.lat >= c.bbox[1] && p.lng <= c.bbox[2] && p.lat <= c.bbox[3]);
  }

  private locate(): Promise<LngLat | null> {
    if (!('geolocation' in navigator)) return Promise.resolve(null);
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 },
      ),
    );
  }
}
