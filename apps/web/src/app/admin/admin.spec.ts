import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestI18n } from '../core/testing';
import type { AdminPlace, AdminReview } from '../core/api.service';
import { ModerationTab } from './moderation.tab';
import { PlacesTab } from './places.tab';
import { SyncTab } from './sync.tab';

const review = (id: number): AdminReview => ({
  id, placeId: 2, placeName: 'Doner біля Ринку', stars: 1, text: 'жах', nickname: null, userId: null, userNickname: null,
  reasons: ['hater'], createdAt: '2026-11-06T10:00:00Z', anonymous: true, identity: { network: 'abcd1234', ip: 'ef567890', device: '00aa11bb' },
});
const place = (id: number, name: string): AdminPlace => ({
  id, name, address: null, district: null, chainId: null, chainName: null, logoUrl: null, status: 'open', deadReason: null,
  deadCandidate: false, movedToPlaceId: null, googleRating: null, lat: 0, lng: 0,
});

describe('admin', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
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

  it('moves a place into another one', () => {
    const f = TestBed.createComponent(PlacesTab);
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/admin/places').flush({ items: [place(12, 'Патона'), place(1, 'Коновальця')], total: 2, page: 1 });
    http.expectOne((r) => r.url === '/api/admin/chains').flush([]);
    f.detectChanges();
    f.componentInstance.moveFrom.set(12);
    f.componentInstance.moveTo.set(1);
    f.componentInstance.doMove();
    http.expectOne('/api/admin/places/12/move-to/1').flush({});
    http.expectOne((r) => r.url === '/api/admin/places').flush({ items: [], total: 0, page: 1 });
  });

  it('shows API budget usage against the caps', () => {
    const f = TestBed.createComponent(SyncTab);
    f.detectChanges();
    http.expectOne('/api/admin/sync-runs').flush([]);
    http.expectOne('/api/admin/budget').flush({ month: '2026-11', usage: [{ sku: 'places.text_search_pro', used: 450, cap: 4500 }] });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('450 / 4500');
    expect((f.nativeElement.querySelector('.bar i') as HTMLElement).style.width).toBe('10%');
  });

  describe('full city scan', () => {
    const tick = () => new Promise((r) => setTimeout(r));
    const chunk = (c: { done: number; placesAdded: number; notes?: string[]; error?: string | null }) =>
      ({ runId: 1, total: 60, cursor: 0, callsUsed: 40, error: null, notes: [], ...c });

    function open() {
      const f = TestBed.createComponent(SyncTab);
      f.detectChanges();
      http.expectOne('/api/admin/sync-runs').flush([]);
      http.expectOne('/api/admin/budget').flush({ month: '2026-11', usage: [] });
      return f;
    }

    it('asks for chunks until the whole city is covered and shows the progress', async () => {
      const f = open();
      const run = f.componentInstance.scanAll();
      for (const c of [chunk({ done: 30, placesAdded: 12 }), chunk({ done: 30, placesAdded: 5 })]) {
        await tick();
        const req = http.expectOne('/api/admin/scan');
        expect(req.request.body).toEqual({ city: 'lviv' });
        req.flush(c);
      }
      await run;
      http.expectNone('/api/admin/scan');
      http.expectOne('/api/admin/sync-runs').flush([]);
      http.expectOne('/api/admin/budget').flush({ month: '2026-11', usage: [] });
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('60 / 60');
      expect(f.nativeElement.textContent).toContain('+17');
    });

    it('stops and says why when a chunk makes no progress', async () => {
      const f = open();
      const run = f.componentInstance.scanAll();
      await tick();
      http.expectOne('/api/admin/scan').flush(chunk({ done: 0, placesAdded: 0, notes: ['budget_exhausted:places.details_pro'] }));
      await run;
      http.expectOne('/api/admin/sync-runs').flush([]);
      http.expectOne('/api/admin/budget').flush({ month: '2026-11', usage: [] });
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('budget_exhausted:places.details_pro');
      expect((f.nativeElement.querySelector('[data-scan]') as HTMLButtonElement).disabled).toBe(false);
    });

    it('pulls Google ratings chunk by chunk until no place is left unrated', async () => {
      const f = open();
      const run = f.componentInstance.pullRatings();
      for (const c of [{ done: 40, remaining: 10 }, { done: 10, remaining: 0 }]) {
        await tick();
        http.expectOne('/api/admin/ratings').flush({ runId: 2, externalAdded: 0, error: null, notes: [], ...c });
      }
      await run;
      http.expectNone('/api/admin/ratings');
      http.expectOne('/api/admin/sync-runs').flush([]);
      http.expectOne('/api/admin/budget').flush({ month: '2026-11', usage: [] });
      f.detectChanges();
      expect(f.nativeElement.querySelector('[data-ratings-progress]').textContent).toContain('50 / 50');
    });
  });
});
