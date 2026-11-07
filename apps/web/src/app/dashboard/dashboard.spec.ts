import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CityStats, PlaceSummary } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import { NavbarComponent } from '../nav/navbar.component';
import { ViewStore } from '../state/view.store';
import { DashboardView } from './dashboard.view';

const place = (id: number, extra: Partial<PlaceSummary> = {}): PlaceSummary => ({
  id, name: `P${id}`, lat: 49.83, lng: 24.02, district: 'Галицький', address: null, status: 'open', deadReason: null, movedToPlaceId: null,
  chainId: null, chainName: null, logoUrl: null, score: 4.5, ourScore: null, ourCount: 0, googleRating: 4.5, googleRatingCount: 10,
  googleAttribution: true, reviewCount: 10, rank: null, ...extra,
});
const stats: CityStats = { city: 'Львів', spots: 3, reviews: 120, open: 3, dead: 0, lastSyncAt: new Date(Date.now() - 5 * 60e3).toISOString() };

describe('ViewStore', () => {
  beforeEach(() => localStorage.removeItem('kb.view'));

  it('starts on the 3D map and remembers the dashboard choice', () => {
    TestBed.configureTestingModule({});
    const v = TestBed.inject(ViewStore);
    expect(v.view()).toBe('map');
    v.set('dash');
    expect(localStorage.getItem('kb.view')).toBe('dash');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ViewStore).view()).toBe('dash');
  });
});

describe('navbar view switch', () => {
  beforeEach(() => localStorage.removeItem('kb.view'));

  it('switches between the 3D map and the dashboard', () => {
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
    const f = TestBed.createComponent(NavbarComponent);
    f.detectChanges();
    const btn = (v: string) => f.nativeElement.querySelector(`[data-view="${v}"]`) as HTMLButtonElement;
    expect(btn('map').getAttribute('aria-pressed')).toBe('true');
    btn('dash').click();
    f.detectChanges();
    expect(TestBed.inject(ViewStore).view()).toBe('dash');
    expect(btn('dash').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('DashboardView', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
    http = TestBed.inject(HttpTestingController);
  });

  function render(places: PlaceSummary[]) {
    const f = TestBed.createComponent(DashboardView);
    f.componentRef.setInput('city', 'lviv');
    f.componentRef.setInput('cityName', 'Львова');
    f.componentRef.setInput('places', places);
    f.componentRef.setInput('stats', stats);
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/cities/lviv/feed' && r.params.get('limit') === '6').flush({
      items: [{ id: 'g1', source: 'google', author: 'Ira', stars: 5, text: 'топ', placeId: 2, placeName: 'P2', createdAt: new Date().toISOString() }],
      threadsStatus: 'ok',
      now: new Date().toISOString(),
    });
    f.detectChanges();
    return f;
  }

  it('shows the headline numbers, the top in ranking order and the fresh reviews', () => {
    const f = render([place(1, { score: 5.0, reviewCount: 3, rank: 2 }), place(2, { score: 4.7, reviewCount: 900, rank: 1 }), place(3, { score: null })]);
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('[data-kpi="spots"]')!.textContent).toContain('3');
    expect(el.querySelector('[data-kpi="reviews"]')!.textContent!.replace(/\s/g, '')).toContain('913');
    expect([...el.querySelectorAll('.top li .nm')].map((e) => e.textContent!.trim())).toEqual(['P2', 'P1']);
    expect(el.querySelector('.fresh')!.textContent).toContain('топ');
  });

  it('opens a place from the top list', () => {
    const f = render([place(2, { score: 4.7, reviewCount: 900, rank: 1 })]);
    const picked: number[] = [];
    f.componentInstance.pick.subscribe((id) => picked.push(id));
    (f.nativeElement.querySelector('.top li') as HTMLElement).click();
    expect(picked).toEqual([2]);
  });

  it('draws one histogram bar per score band, with the count in its tooltip', () => {
    const f = render([place(1, { score: 4.8, rank: 1 }), place(2, { score: 4.9, rank: 2 }), place(3, { score: 3.1, rank: 3 })]);
    const bars = [...f.nativeElement.querySelectorAll('.hist .bar')] as HTMLElement[];
    expect(bars.length).toBe(7);
    expect(bars.at(-1)!.getAttribute('title')).toContain('2');
  });
});
