import { InjectionToken } from '@angular/core';
import type { City, PlaceSummary, RuntimeConfig } from '@kebabarium/shared';

export interface LngLat {
  lat: number;
  lng: number;
}

/** What the app needs from a map engine. Google (production) and MapLibre (dev only) implement it. */
export interface MapProvider {
  init(el: HTMLElement, city: City): Promise<void>;
  /** Columns start flat; `growColumns()` animates them up (after the boot screen fades). */
  setPlaces(places: PlaceSummary[], opts?: { dimmedIds?: Set<number> }): void;
  growColumns(): void;
  flyTo(c: LngLat, zoom: number, pitch?: number): Promise<void>;
  onPlaceClick(cb: (id: number) => void): void;
  onMapClick(cb: (c: LngLat) => void): void;
  /** Fires on every camera change; returns an unsubscribe function. */
  onMove(cb: () => void): () => void;
  /** Container pixel of a ground point. */
  project(c: LngLat): { x: number; y: number };
  metersToPixels(m: number, at: LngLat): number;
  /** Screen height (px) of a place's column top above its base, at the current camera. */
  columnHeightPx(place: PlaceSummary): number;
  zoom(): number;
  pitch(): number;
  destroy(): void;
}

export type MapProviderFactory = (kind: RuntimeConfig['mapProvider'], config: RuntimeConfig | null) => Promise<MapProvider>;

/** Lazy-loads the engine so neither Google nor MapLibre code lands in the initial bundle. */
export const MAP_PROVIDER_FACTORY = new InjectionToken<MapProviderFactory>('MAP_PROVIDER_FACTORY', {
  providedIn: 'root',
  factory: () => async (kind, config) => {
    if (kind === 'google') {
      const { GoogleMapProvider } = await import('./google-map.provider');
      return new GoogleMapProvider(config);
    }
    const { MapLibreMapProvider } = await import('./maplibre-map.provider');
    return new MapLibreMapProvider();
  },
});

/** Metres per pixel at a latitude/zoom for 512px web-mercator tiles (MapLibre) — Google uses 256 at zoom+1, same scale. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
}
