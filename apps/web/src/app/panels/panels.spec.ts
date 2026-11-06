import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ratingColor, type FeedItem } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import { FeedPanel } from './feed.panel';
import { LeaderboardPanel } from './leaderboard.panel';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

describe('panels', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('colours leaderboard scores with the rating scale and ellipsises long names', async () => {
    const f = TestBed.createComponent(LeaderboardPanel);
    f.componentRef.setInput('city', 'lviv');
    f.componentRef.setInput('cityName', 'Львова');
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/cities/lviv/leaderboard' && r.params.get('kind') === 'spots').flush([
      { rank: 1, id: 1, name: 'Шаурма на Коновальця з дуже-дуже довгою назвою, яка не влазить', value: 4.8, kind: 'spots' },
      { rank: 2, id: 2, name: 'Doner біля Ринку', value: 4.6, kind: 'spots' },
    ]);
    f.detectChanges();
    await f.whenStable();
    const value = f.nativeElement.querySelector('.row .v') as HTMLElement;
    expect(value.style.color).toBe(rgb(ratingColor(4.8)));
    expect(f.nativeElement.querySelector('.row .nm').getAttribute('title')).toContain('дуже-дуже');
    expect(f.nativeElement.querySelector('.rank-1')).not.toBeNull();
  });

  it('asks the API for Google-only items when the Google filter is chosen', () => {
    vi.useFakeTimers();
    const f = TestBed.createComponent(FeedPanel);
    f.componentRef.setInput('city', 'lviv');
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/cities/lviv/feed' && r.params.get('source') === 'all').flush({ items: [], threadsStatus: 'ok', now: '' });
    const google = [...f.nativeElement.querySelectorAll('.seg button')].find((b: HTMLElement) => b.textContent?.includes('Google')) as HTMLElement;
    google.click();
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/cities/lviv/feed' && r.params.get('source') === 'google').flush({ items: [], threadsStatus: 'ok', now: '' });
    vi.useRealTimers();
  });

  it('types new items in one by one and announces drops for places', async () => {
    vi.useFakeTimers();
    const f = TestBed.createComponent(FeedPanel);
    const drops: unknown[] = [];
    f.componentInstance.drop.subscribe((d) => drops.push(d));
    f.componentRef.setInput('city', 'lviv');
    f.detectChanges();
    const item = (id: string, stars: number, placeId: number | null): FeedItem => ({
      id, source: 'ours', author: 'oleg', stars, text: 'смачно', placeId, placeName: 'P', createdAt: '2026-11-06T10:00:00.000Z', emoji: '🤤',
    });
    http.expectOne(() => true).flush({ items: [], threadsStatus: 'ok', now: '2026-11-06T09:00:00.000Z' });
    vi.advanceTimersByTime(15000);
    http.expectOne((r) => r.params.get('since') === '2026-11-06T09:00:00.000Z').flush({ items: [item('r2', 5, 1), item('r1', 2, null)], threadsStatus: 'ok', now: '' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.typing')).not.toBeNull();
    vi.advanceTimersByTime(1200);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.msg:not(.typing)').length).toBe(1);
    vi.advanceTimersByTime(5000);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.msg:not(.typing)').length).toBe(2);
    expect(drops).toEqual([{ placeId: 1, stars: 5, caption: 'oleg поставив 5★' }]);
    vi.useRealTimers();
  });
});
