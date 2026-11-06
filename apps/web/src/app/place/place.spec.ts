import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PlaceDetail } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import { monogram } from './logo-tile.component';
import { PlaceCardComponent } from './place-card.component';

const detail = (extra: Partial<PlaceDetail> = {}): PlaceDetail => ({
  id: 3, name: 'Кебаб-Шеф Сихів', lat: 49.79, lng: 24.05, district: 'Сихівський', address: 'просп. 1', status: 'open', deadReason: null,
  movedToPlaceId: null, chainId: 1, chainName: 'Кебаб-Шеф', logoUrl: null, score: 4.5, ourScore: 4.6, ourCount: 5, googleRating: 4.4,
  googleRatingCount: 388, googleAttribution: true, reviewCount: 393, chainScore: 4.4, chainSpots: 2, movedFrom: [], movedTo: null,
  reviews: [
    { id: 'r1', source: 'ours', author: 'marta_k', stars: 5, text: '<b>x</b> о 2 ночі рятує', placeId: 3, placeName: 'Кебаб-Шеф Сихів', createdAt: '2026-11-06T10:00:00Z' },
    { id: 'e1', source: 'google', author: 'Taras', authorUrl: 'https://maps.google.com/u', stars: 4, text: 'ok', placeId: 3, placeName: 'Кебаб-Шеф Сихів', createdAt: '2026-11-05T10:00:00Z' },
  ],
  ...extra,
});

describe('logo monogram', () => {
  it('uses the brand initials, skipping generic words', () => {
    expect(monogram('Кебаб-Шеф Сихів')).toBe('ШС');
    expect(monogram('Шаурма на Коновальця')).toBe('К');
    expect(monogram('Doner')).toBe('D');
  });
});

describe('PlaceCardComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('shows scores, chain, source badges and renders review text as plain text', () => {
    const f = TestBed.createComponent(PlaceCardComponent);
    f.componentRef.setInput('placeId', 3);
    f.detectChanges();
    http.expectOne('/api/places/3').flush(detail());
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('h3')!.textContent).toContain('Кебаб-Шеф Сихів');
    expect(el.textContent).toContain('Кебаб-Шеф · мережа 4.4 (2 точок)');
    expect(el.querySelector('.rv p')!.textContent).toContain('<b>x</b>');
    expect(el.querySelector('.rv p b')).toBeNull();
    expect(el.querySelector('.src-google')!.textContent).toContain('Google');
    expect(el.querySelector('.logo')!.textContent!.trim()).toBe('ШС');
  });

  it('shows where a closed place moved to', () => {
    const f = TestBed.createComponent(PlaceCardComponent);
    f.componentRef.setInput('placeId', 12);
    f.detectChanges();
    http.expectOne('/api/places/12').flush(detail({ id: 12, status: 'dead', deadReason: 'moved', movedTo: { id: 1, name: 'Шаурма на Коновальця' } }));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.status')!.textContent).toContain('переїхали: Шаурма на Коновальця');
    expect(f.nativeElement.querySelector('.rate')).toBeNull();
  });
});
