import type { City, PlaceSummary } from '@kebabarium/shared';
import type { LngLat, MapProvider } from './map-provider';

/** In-memory MapProvider for unit tests: 1 m = `scale` px, projection is a flat grid around the city centre. */
export class FakeMapProvider implements MapProvider {
  places: PlaceSummary[] = [];
  dimmed = new Set<number>();
  grown = false;
  scale = 0.1;
  z = 12.4;
  p = 58;
  flights: Array<{ c: LngLat; zoom: number }> = [];
  private placeCb?: (id: number) => void;
  private mapCb?: (c: LngLat) => void;
  private moveCbs: Array<() => void> = [];

  async init(_el: HTMLElement, _city: City): Promise<void> {}
  setPlaces(p: PlaceSummary[], opts: { dimmedIds?: Set<number> } = {}): void {
    this.places = p;
    this.dimmed = opts.dimmedIds ?? new Set();
  }
  growColumns(): void {
    this.grown = true;
  }
  async flyTo(c: LngLat, zoom: number): Promise<void> {
    this.flights.push({ c, zoom });
    this.z = zoom;
    this.fireMove();
  }
  onPlaceClick(cb: (id: number) => void): void {
    this.placeCb = cb;
  }
  onMapClick(cb: (c: LngLat) => void): void {
    this.mapCb = cb;
  }
  onMove(cb: () => void): () => void {
    this.moveCbs.push(cb);
    return () => (this.moveCbs = this.moveCbs.filter((x) => x !== cb));
  }
  project(c: LngLat) {
    return { x: (c.lng - 24) * 10000, y: (50 - c.lat) * 10000 };
  }
  metersToPixels(m: number): number {
    return m * this.scale;
  }
  zoom(): number {
    return this.z;
  }
  pitch(): number {
    return this.p;
  }
  columnHeightPx(): number {
    return 0;
  }
  destroy(): void {}

  // test helpers
  clickPlace(id: number) {
    this.placeCb?.(id);
  }
  clickMap(c: LngLat) {
    this.mapCb?.(c);
  }
  fireMove() {
    this.moveCbs.forEach((cb) => cb());
  }
}
