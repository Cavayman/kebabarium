import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { City } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import type { AdminOverview, AdminPlace, AdminReview } from '../core/api.service';
import { AdminPage } from './admin.page';
import { AdminJobsComponent } from './jobs.component';
import { ModerationTab } from './moderation.tab';
import { OverviewTab } from './overview.tab';
import { PlacesTab } from './places.tab';
import { SyncTab } from './sync.tab';

const lviv: City = { id: 1, slug: 'lviv', name: 'Львів', nameEn: 'Lviv', center: { lat: 49.832, lng: 24.022 }, zoom: 12.4, bbox: [23.9, 49.76, 24.13, 49.9], spots: 244 };
const sumy: City = { id: 2, slug: 'sumy', name: 'Суми', nameEn: 'Sumy', center: { lat: 50.9077, lng: 34.7981 }, zoom: 12.6, bbox: [34.7, 50.85, 34.9, 50.96], spots: 63 };

const review = (id: number): AdminReview => ({
  id, placeId: 2, placeName: 'Doner біля Ринку', stars: 1, text: 'жах', nickname: null, userId: null, userNickname: null,
  reasons: ['hater'], createdAt: '2026-11-06T10:00:00Z', anonymous: true, identity: { network: 'abcd1234', ip: 'ef567890', device: '00aa11bb' },
});
const place = (id: number, name: string, extra: Partial<AdminPlace> = {}): AdminPlace => ({
  id, name, address: null, district: null, chainId: null, chainName: null, logoUrl: null, status: 'open', deadReason: null,
  deadCandidate: false, movedToPlaceId: null, googleRating: null, googleRatingCount: null, googlePlaceId: null, lastSeenAt: null, lat: 0, lng: 0, ...extra,
});
const overview: AdminOverview = {
  city: { slug: 'lviv', name: 'Львів' },
  places: { total: 250, open: 240, closedTemp: 2, dead: 1, hidden: 7, unrated: 6, deadCandidates: 3 },
  reviews: { published: 12, pending: 1, held: 4, google: 1137, threads: 0 },
  lastSyncAt: '2026-11-07T00:00:00Z',
  lastScanAt: null,
};
const tick = () => new Promise((r) => setTimeout(r));

describe('admin', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.removeItem('kb.admin.city');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  it('approves a held review and removes it from the queue', () => {
    const f = TestBed.createComponent(ModerationTab);
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/admin/reviews' && r.params.get('status') === 'held').flush({ items: [review(5), review(6)], page: 1 });
    http.expectOne('/api/admin/bans').flush([]);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('ef567890');
    (f.nativeElement.querySelector('[data-approve="5"]') as HTMLElement).click();
    http.expectOne('/api/admin/reviews/5/approve').flush({ id: 5, status: 'published' });
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.rv').length).toBe(1);
  });

  describe('admin page', () => {
    it('opens on the overview of the first city and switches every tab to the chosen city', async () => {
      const f = TestBed.createComponent(AdminPage);
      f.detectChanges();
      http.expectOne('/api/config').flush({ mapsBrowserKey: null, mapId: null, turnstileSiteKey: null, googleClientId: null, mapProvider: 'maplibre' });
      http.expectOne('/api/cities').flush([lviv, sumy]);
      await tick(); // the city list arrives through a promise
      f.detectChanges();
      http.expectOne((r) => r.url === '/api/admin/overview' && r.params.get('city') === 'lviv').flush(overview);
      const select = f.nativeElement.querySelector('[data-city]') as HTMLSelectElement;
      select.value = 'sumy';
      select.dispatchEvent(new Event('change'));
      f.detectChanges();
      http.expectOne((r) => r.url === '/api/admin/overview' && r.params.get('city') === 'sumy').flush({ ...overview, city: { slug: 'sumy', name: 'Суми' } });
      expect(localStorage.getItem('kb.admin.city')).toBe('sumy');
      (f.nativeElement.querySelector('[data-tab="places"]') as HTMLElement).click();
      f.detectChanges();
      http.expectOne((r) => r.url === '/api/admin/places' && r.params.get('city') === 'sumy').flush({ items: [], total: 0, page: 1 });
      http.expectOne((r) => r.url === '/api/admin/chains' && r.params.get('city') === 'sumy').flush([]);
    });
  });

  describe('overview', () => {
    it('shows the numbers from the data and links to what needs attention', () => {
      const f = TestBed.createComponent(OverviewTab);
      f.componentRef.setInput('city', lviv);
      const opened: string[] = [];
      f.componentInstance.open.subscribe((t) => opened.push(t));
      f.detectChanges();
      http.expectOne((r) => r.url === '/api/admin/overview' && r.params.get('city') === 'lviv').flush(overview);
      f.detectChanges();
      const n = (k: string) => (f.nativeElement.querySelector(`[data-n="${k}"]`) as HTMLElement).textContent!.trim();
      expect(n('total')).toBe('250');
      expect(n('unrated')).toBe('6');
      expect(n('google')).toBe((1137).toLocaleString('uk'));
      (f.nativeElement.querySelector('[data-go="moderation"]') as HTMLElement).click();
      expect(opened).toEqual(['moderation']);
    });
  });

  describe('places', () => {
    function open(city: City = lviv) {
      const f = TestBed.createComponent(PlacesTab);
      f.componentRef.setInput('city', city);
      f.detectChanges();
      return f;
    }

    it('moves a place into another one', () => {
      const f = open();
      http.expectOne((r) => r.url === '/api/admin/places').flush({ items: [place(12, 'Патона'), place(1, 'Коновальця')], total: 2, page: 1 });
      http.expectOne((r) => r.url === '/api/admin/chains').flush([]);
      f.detectChanges();
      f.componentInstance.moveFrom.set(12);
      f.componentInstance.moveTo.set(1);
      f.componentInstance.doMove();
      http.expectOne('/api/admin/places/12/move-to/1').flush({});
      http.expectOne((r) => r.url === '/api/admin/places').flush({ items: [], total: 0, page: 1 });
    });

    it('lists the chosen city, sorts and pages', () => {
      const f = open(sumy);
      http.expectOne((r) => r.url === '/api/admin/places' && r.params.get('city') === 'sumy' && r.params.get('sort') === 'name' && r.params.get('page') === '1').flush({
        items: [place(12, 'Doner Sumy')],
        total: 120,
        page: 1,
      });
      http.expectOne((r) => r.url === '/api/admin/chains').flush([]);
      f.detectChanges();
      expect(f.nativeElement.querySelector('[data-pages]').textContent).toContain('1 / 3');
      const sort = f.nativeElement.querySelector('[data-sort]') as HTMLSelectElement;
      sort.value = 'reviews';
      sort.dispatchEvent(new Event('change'));
      http.expectOne((r) => r.params.get('sort') === 'reviews' && r.params.get('page') === '1').flush({ items: [], total: 120, page: 1 });
      f.detectChanges();
      (f.nativeElement.querySelector('[data-next]') as HTMLElement).click();
      http.expectOne((r) => r.params.get('sort') === 'reviews' && r.params.get('page') === '2').flush({ items: [], total: 120, page: 2 });
    });

    it('shows the Google rating with a link to the place on Google Maps, and hides a place in one click', () => {
      const f = open();
      http.expectOne((r) => r.url === '/api/admin/places').flush({
        items: [place(12, 'Tutta Pizza', { googleRating: 4.8, googleRatingCount: 270, googlePlaceId: 'gp-12' })],
        total: 1,
        page: 1,
      });
      http.expectOne((r) => r.url === '/api/admin/chains').flush([]);
      f.detectChanges();
      const row = f.nativeElement.querySelector('tbody tr') as HTMLElement;
      expect(row.textContent).toContain('4.8');
      expect(row.textContent).toContain('270');
      expect((row.querySelector('a[data-gmaps]') as HTMLAnchorElement).href).toContain('place_id:gp-12');
      (row.querySelector('[data-hide="12"]') as HTMLElement).click();
      const req = http.expectOne('/api/admin/places/12');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'hidden' });
      req.flush(place(12, 'Tutta Pizza', { status: 'hidden' }));
    });
  });

  it('shows API budget usage against the caps', () => {
    const f = TestBed.createComponent(SyncTab);
    f.componentRef.setInput('city', lviv);
    f.detectChanges();
    http.expectOne('/api/admin/sync-runs').flush([]);
    http.expectOne('/api/admin/budget').flush({ month: '2026-11', usage: [{ sku: 'places.details_pro', used: 480, cap: 4800 }] });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('480 / 4800');
    expect((f.nativeElement.querySelector('.bar i') as HTMLElement).style.width).toBe('10%');
  });

  describe('scan & ratings jobs', () => {
    const chunk = (c: { done: number; placesAdded: number; notes?: string[]; error?: string | null }) =>
      ({ runId: 1, total: 60, cursor: 0, callsUsed: 40, error: null, notes: [], ...c });

    function open(city: City = sumy) {
      const f = TestBed.createComponent(AdminJobsComponent);
      f.componentRef.setInput('city', city);
      f.detectChanges();
      return f;
    }

    it('scans the chosen city chunk by chunk until it is covered and shows the progress', async () => {
      const f = open();
      const finished: string[] = [];
      f.componentInstance.finished.subscribe(() => finished.push('done'));
      const run = f.componentInstance.jobs.scanAll(sumy.slug);
      for (const c of [chunk({ done: 30, placesAdded: 12 }), chunk({ done: 30, placesAdded: 5 })]) {
        await tick();
        const req = http.expectOne('/api/admin/scan');
        expect(req.request.body).toEqual({ city: 'sumy' });
        req.flush(c);
      }
      await run;
      http.expectNone('/api/admin/scan');
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('60 / 60');
      expect(f.nativeElement.textContent).toContain('+17');
    });

    it('stops and says why when a chunk makes no progress', async () => {
      const f = open();
      const run = f.componentInstance.jobs.scanAll(sumy.slug);
      await tick();
      http.expectOne('/api/admin/scan').flush(chunk({ done: 0, placesAdded: 0, notes: ['budget_exhausted:places.details_pro'] }));
      await run;
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('budget_exhausted:places.details_pro');
      expect((f.nativeElement.querySelector('[data-scan]') as HTMLButtonElement).disabled).toBe(false);
    });

    it('pulls Google ratings chunk by chunk until no place is left unrated', async () => {
      const f = open();
      const run = f.componentInstance.jobs.pullRatings();
      for (const c of [{ done: 40, remaining: 10 }, { done: 10, remaining: 0 }]) {
        await tick();
        http.expectOne('/api/admin/ratings').flush({ runId: 2, externalAdded: 0, error: null, notes: [], ...c });
      }
      await run;
      http.expectNone('/api/admin/ratings');
      f.detectChanges();
      expect(f.nativeElement.querySelector('[data-ratings-progress]').textContent).toContain('50 / 50');
    });
  });
});
