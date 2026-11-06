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
});
