import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { City, PlaceSummary } from '@kebabarium/shared';
import { MapComponent } from './map.component';
import { MAP_PROVIDER_FACTORY } from './map-provider';
import { FakeMapProvider } from './testing';

const city: City = { id: 1, slug: 'lviv', name: 'Львів', nameEn: 'Lviv', center: { lat: 49.832, lng: 24.022 }, zoom: 12.4, bbox: [23.9, 49.76, 24.13, 49.9], spots: 2 };
const place = (id: number, score: number | null, extra: Partial<PlaceSummary> = {}): PlaceSummary => ({
  id, name: `P${id}`, lat: 49.83, lng: 24.02, district: null, address: null, status: 'open', deadReason: null, movedToPlaceId: null,
  chainId: null, chainName: null, logoUrl: null, score, ourScore: null, ourCount: 0, googleRating: null, googleRatingCount: null,
  googleAttribution: false, reviewCount: 0, ...extra,
});

describe('MapComponent', () => {
  let fixture: ComponentFixture<MapComponent>;
  let fake: FakeMapProvider;

  beforeEach(async () => {
    fake = new FakeMapProvider();
    TestBed.configureTestingModule({ providers: [{ provide: MAP_PROVIDER_FACTORY, useValue: async () => fake }] });
    fixture = TestBed.createComponent(MapComponent);
    fixture.componentRef.setInput('city', city);
    fixture.componentRef.setInput('places', [place(1, 4.8), place(2, 3.1), place(3, null)]);
    fixture.componentRef.setInput('providerKind', 'maplibre');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('hands the places and the dimmed set to the provider', async () => {
    expect(fake.places.map((p) => p.id)).toEqual([1, 2, 3]);
    fixture.componentRef.setInput('dimmed', new Set([2]));
    fixture.detectChanges();
    await fixture.whenStable();
    expect([...fake.dimmed]).toEqual([2]);
  });

  it('emits placeClick and mapClick', () => {
    const placeSpy = vi.fn();
    const mapSpy = vi.fn();
    fixture.componentInstance.placeClick.subscribe(placeSpy);
    fixture.componentInstance.mapClick.subscribe(mapSpy);
    fake.clickPlace(2);
    fake.clickMap({ lat: 1, lng: 2 });
    expect(placeSpy).toHaveBeenCalledWith(2);
    expect(mapSpy).toHaveBeenCalledWith({ lat: 1, lng: 2 });
  });

  it('labels the top three scored spots', () => {
    fixture.componentInstance.refreshLabels();
    const labels = [...fixture.nativeElement.querySelectorAll('.tag')].map((e: HTMLElement) => e.textContent?.trim());
    expect(labels).toEqual(['4.8 P1', '3.1 P2']);
  });

  it('starts columns only when asked to grow', () => {
    expect(fake.grown).toBe(false);
    fixture.componentInstance.grow();
    expect(fake.grown).toBe(true);
  });
});
