import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { City, NearResponse } from '@kebabarium/shared';
import { ConfigStore } from '../core/config.store';
import { provideTestI18n } from '../core/testing';
import { ToastService } from '../ui/toast';
import { NearbyPanel } from './nearby.panel';
import { NearbyService, type NearbyHost } from './nearby.service';

const lviv: City = { id: 1, slug: 'lviv', name: 'Львів', nameEn: 'Lviv', center: { lat: 49.832, lng: 24.022 }, zoom: 12.4, bbox: [23.9, 49.76, 24.13, 49.9], spots: 13 };
const empty: NearResponse = { radiusKm: 1, autoWidened: false, items: [] };

function geolocation(result: { lat: number; lng: number } | 'denied') {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        result === 'denied'
          ? fail({ code: 1, message: 'denied' } as GeolocationPositionError)
          : ok({ coords: { latitude: result.lat, longitude: result.lng } } as GeolocationPosition),
    },
  });
}

describe('NearbyService', () => {
  let http: HttpTestingController;
  let svc: NearbyService;
  let host: NearbyHost & { flights: unknown[]; dimmed: Set<number> | null };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [NearbyService, provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
    TestBed.inject(ConfigStore).cities.set([lviv]);
    http = TestBed.inject(HttpTestingController);
    svc = TestBed.inject(NearbyService);
    host = {
      flights: [],
      dimmed: null,
      flyTo: async (c, zoom) => void host.flights.push({ c, zoom }),
      radar: () => null,
      setLit: (ids) => (host.dimmed = ids),
    };
    svc.attach(host);
  });
  afterEach(() => vi.useRealTimers());

  it('falls back to picking a point on the map when GPS is denied', async () => {
    geolocation('denied');
    await svc.start();
    expect(svc.phase()).toBe('pick');
    expect(TestBed.inject(ToastService).message()).toContain('Тицьни на мапі');
    svc.mapClicked({ lat: 49.84, lng: 24.03 });
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne((r) => r.url === '/api/places/near' && r.params.get('lat') === '49.84').flush(empty);
  });

  it('treats a position outside every city as unknown', async () => {
    geolocation({ lat: 50.45, lng: 30.52 });
    await svc.start();
    expect(svc.phase()).toBe('pick');
    http.expectNone(() => true);
  });

  it('scans around the user, dims everything else and shows the result', async () => {
    geolocation({ lat: 49.8375, lng: 24.0245 });
    const started = svc.start();
    await vi.advanceTimersByTimeAsync(0);
    const req = http.expectOne((r) => r.url === '/api/places/near');
    expect(req.request.params.has('r')).toBe(false);
    req.flush({ radiusKm: 5, autoWidened: true, items: [{ id: 3 }, { id: 10 }] } as unknown as NearResponse);
    await vi.advanceTimersByTimeAsync(2600);
    expect(svc.phase()).toBe('done');
    expect(svc.result()?.autoWidened).toBe(true);
    expect([...host.dimmed!]).toEqual([3, 10]);
    await started;
  });

  it('re-queries with an explicit radius when a chip is chosen', async () => {
    geolocation({ lat: 49.8375, lng: 24.0245 });
    const started = svc.start();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(() => true).flush(empty);
    await vi.advanceTimersByTimeAsync(2600);
    void svc.setRadius(2);
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne((r) => r.params.get('r') === '2').flush({ ...empty, radiusKm: 2 });
    await vi.advanceTimersByTimeAsync(2600);
    await started;
  });
});

describe('NearbyPanel', () => {
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
  });

  it('shows the widened note and emits a radius from a real chip click inside the draggable header', () => {
    const f = TestBed.createComponent(NearbyPanel);
    f.componentRef.setInput('result', { radiusKm: 5, autoWidened: true, items: [] });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('розширив пошук до 5 км');
    const picked: number[] = [];
    f.componentInstance.radius.subscribe((r) => picked.push(r));
    const chip = [...f.nativeElement.querySelectorAll('.rads button')].find((b: HTMLElement) => b.textContent?.includes('2')) as HTMLElement;
    chip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    chip.click();
    expect(picked).toEqual([2]);
  });
});
