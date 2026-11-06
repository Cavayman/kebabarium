import { columnHeight, DEAD_COLOR, NO_SCORE_COLOR, ratingColor, zoomFactor, type City, type PlaceSummary, type RuntimeConfig } from '@kebabarium/shared';
import type { Layer } from '@deck.gl/core';
import type { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { metersPerPixel, type LngLat, type MapProvider } from './map-provider';

type Rgba = [number, number, number, number];
const DIM: Rgba = [47, 47, 51, 235];
const rgba = (hex: string, a = 245): Rgba => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface DeckViewport {
  project(xyz: number[]): number[];
}

/**
 * Production map: Google vector map (cloud-styled via Map ID — import map-style/google-dark-lineart.json)
 * with deck.gl columns. Google ratings/reviews may only be shown on a Google map (spec §11).
 */
export class GoogleMapProvider implements MapProvider {
  private map!: google.maps.Map;
  private overlay!: GoogleMapsOverlay;
  private ColumnLayer!: typeof import('@deck.gl/layers').ColumnLayer;
  private places: PlaceSummary[] = [];
  private dimmed = new Set<number>();
  private grow = 0;
  private placeCb?: (id: number) => void;
  private mapCb?: (c: LngLat) => void;
  private lastPick = 0;
  private moveCbs = new Set<() => void>();

  constructor(private readonly config: RuntimeConfig | null) {}

  async init(el: HTMLElement, city: City): Promise<void> {
    if (!this.config?.mapsBrowserKey) throw new Error('Google Maps key is not configured');
    const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');
    setOptions({ key: this.config.mapsBrowserKey, v: 'weekly', language: document.documentElement.lang || 'uk' });
    const [{ Map, RenderingType }, deckGm, layers] = await Promise.all([
      importLibrary('maps'),
      import('@deck.gl/google-maps'),
      import('@deck.gl/layers'),
    ]);
    this.ColumnLayer = layers.ColumnLayer;
    this.map = new Map(el, {
      mapId: this.config.mapId ?? undefined,
      center: city.center,
      zoom: city.zoom + 1, // Google zoom levels are one step "closer" than MapLibre's 512px tiles
      tilt: 58,
      heading: -18,
      renderingType: RenderingType.VECTOR,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      keyboardShortcuts: true,
      backgroundColor: '#0a0a0c',
    });
    this.overlay = new deckGm.GoogleMapsOverlay({ interleaved: true, layers: [] });
    this.overlay.setMap(this.map);

    const fire = () => this.moveCbs.forEach((cb) => cb());
    for (const ev of ['bounds_changed', 'tilt_changed', 'heading_changed', 'zoom_changed']) this.map.addListener(ev, fire);
    this.map.addListener('zoom_changed', () => this.render());
    this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      // deck's pick handler runs in the same tick; let it win
      setTimeout(() => {
        if (Date.now() - this.lastPick < 120 || !e.latLng) return;
        this.mapCb?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }, 0);
    });
    await new Promise<void>((resolve) => google.maps.event.addListenerOnce(this.map, 'idle', () => resolve()));
    this.render();
  }

  private layer(): Layer {
    const z = this.zoom();
    return new this.ColumnLayer<PlaceSummary>({
      id: 'columns',
      data: this.places,
      diskResolution: 4,
      angle: 45,
      radius: 38,
      extruded: true,
      pickable: true,
      getPosition: (p) => [p.lng, p.lat],
      getElevation: (p) => columnHeight(p.score, p.status === 'dead'),
      elevationScale: zoomFactor(z - 1) * this.grow,
      getFillColor: (p) =>
        p.status === 'dead' ? rgba(DEAD_COLOR) : this.dimmed.has(p.id) ? DIM : p.score == null ? rgba(NO_SCORE_COLOR) : rgba(ratingColor(p.score)),
      material: { ambient: 0.55, diffuse: 0.55, shininess: 12, specularColor: [40, 40, 40] },
      onClick: (info) => {
        if (!info.object) return false;
        this.lastPick = Date.now();
        this.placeCb?.(info.object.id);
        return true;
      },
      updateTriggers: { getFillColor: [this.dimmed] },
    });
  }

  private render(): void {
    this.overlay?.setProps({ layers: [this.layer()] });
  }

  setPlaces(places: PlaceSummary[], opts: { dimmedIds?: Set<number> } = {}): void {
    this.places = places;
    this.dimmed = new Set(opts.dimmedIds ?? []);
    this.render();
  }

  growColumns(): void {
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1600);
      this.grow = 1 - Math.pow(1 - k, 3);
      this.render();
      this.moveCbs.forEach((cb) => cb());
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Google has no fly-to: interpolate the camera ourselves. MapLibre-style zoom is converted (+1). */
  flyTo(c: LngLat, zoom: number, pitch?: number): Promise<void> {
    const from = { lat: this.map.getCenter()!.lat(), lng: this.map.getCenter()!.lng(), zoom: this.map.getZoom()!, tilt: this.map.getTilt()! };
    const to = { ...c, zoom: zoom + 1, tilt: pitch ?? from.tilt };
    const start = performance.now();
    const dur = 1600;
    return new Promise((resolve) => {
      const step = (now: number) => {
        const k = easeInOut(Math.min(1, (now - start) / dur));
        this.map.moveCamera({
          center: { lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k },
          zoom: from.zoom + (to.zoom - from.zoom) * k,
          tilt: from.tilt + (to.tilt - from.tilt) * k,
        });
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  onPlaceClick(cb: (id: number) => void): void {
    this.placeCb = cb;
  }
  onMapClick(cb: (c: LngLat) => void): void {
    this.mapCb = cb;
  }
  onMove(cb: () => void): () => void {
    this.moveCbs.add(cb);
    return () => this.moveCbs.delete(cb);
  }

  /** deck.gl keeps a viewport in sync with the tilted/rotated Google camera; use it for exact projection. */
  private viewport(): DeckViewport | null {
    const deck = (this.overlay as unknown as { _deck?: { getViewports(): DeckViewport[] } })._deck;
    return deck?.getViewports()?.[0] ?? null;
  }

  project(c: LngLat) {
    const vp = this.viewport();
    if (vp) {
      const [x, y] = vp.project([c.lng, c.lat, 0]);
      return { x: x!, y: y! };
    }
    return { x: -9999, y: -9999 };
  }

  metersToPixels(m: number, at: LngLat): number {
    return m / metersPerPixel(at.lat, this.zoom() - 1);
  }

  columnHeightPx(p: PlaceSummary): number {
    const vp = this.viewport();
    if (!vp) return 0;
    const h = columnHeight(p.score, p.status === 'dead') * zoomFactor(this.zoom() - 1) * this.grow;
    const base = vp.project([p.lng, p.lat, 0]);
    const top = vp.project([p.lng, p.lat, h]);
    return Math.max(0, base[1]! - top[1]!);
  }

  zoom(): number {
    return this.map?.getZoom() ?? 13;
  }
  pitch(): number {
    return this.map?.getTilt() ?? 58;
  }
  destroy(): void {
    this.overlay?.finalize();
  }
}
