// DEV ONLY map engine (OpenFreeMap tiles). Production always uses GoogleMapProvider — Google content may only be shown on a Google map.
import { columnHeight, DEAD_COLOR, NO_SCORE_COLOR, ratingStops, ZOOM_STOPS, zoomFactor, type City, type PlaceSummary } from '@kebabarium/shared';
import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from 'maplibre-gl';
import { metersPerPixel, type LngLat, type MapProvider } from './map-provider';

const DIM_COLOR = '#2f2f33';
const HALF_SIDE_DEG = 0.0003;

export class MapLibreMapProvider implements MapProvider {
  private map!: MlMap;
  private places: PlaceSummary[] = [];
  private dimmed = new Set<number>();
  private grow = 0;
  private placeCb?: (id: number) => void;
  private mapCb?: (c: LngLat) => void;

  async init(el: HTMLElement, city: City): Promise<void> {
    const ml = await import('maplibre-gl');
    ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    this.map = new ml.Map({
      container: el,
      center: [city.center.lng, city.center.lat],
      zoom: city.zoom,
      pitch: 58,
      bearing: -18,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
          bars: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0c' } },
          { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#121216' } },
          { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#0f1410' } },
          this.road('minor', ['minor', 'service', 'track'], '#2c2c32', 0.3, 1.2),
          this.road('mid', ['tertiary', 'secondary'], '#55555e', 0.6, 2),
          this.road('major', ['primary', 'trunk', 'motorway'], '#9a9aa4', 1, 3),
          {
            id: 'bars',
            type: 'fill-extrusion',
            source: 'bars',
            paint: { 'fill-extrusion-color': this.colorExpr(), 'fill-extrusion-height': this.heightExpr(), 'fill-extrusion-opacity': 0.95 },
          },
        ],
      },
    });
    this.map.on('click', (e: MapMouseEvent) => {
      const hit = this.map.queryRenderedFeatures(e.point, { layers: ['bars'] })[0];
      if (hit) this.placeCb?.(Number(hit.properties['id']));
      else this.mapCb?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    this.map.on('mouseenter', 'bars', () => (this.map.getCanvas().style.cursor = 'pointer'));
    this.map.on('mouseleave', 'bars', () => (this.map.getCanvas().style.cursor = ''));
    await new Promise<void>((resolve) => this.map.once('load', () => resolve()));
    this.push();
  }

  private road(id: string, classes: string[], color: string, w11: number, w15: number) {
    return {
      id,
      type: 'line' as const,
      source: 'omt',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', classes]] as never,
      paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, w11, 15, w15] as never },
    };
  }

  private colorExpr() {
    return [
      'case',
      ['get', 'dead'], DEAD_COLOR,
      ['get', 'dim'], DIM_COLOR,
      ['==', ['get', 'r'], -1], NO_SCORE_COLOR,
      ['interpolate', ['linear'], ['get', 'r'], ...ratingStops().flat()],
    ] as never;
  }

  private heightExpr() {
    const g = this.grow;
    const stops = ZOOM_STOPS.flatMap(([z, f]) => [z, ['*', ['get', 'h'], f * g]]);
    return ['interpolate', ['exponential', 2], ['zoom'], ...stops] as never;
  }

  private push(): void {
    const src = this.map?.getSource('bars') as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: this.places.map((p) => {
        const k = HALF_SIDE_DEG / Math.cos((p.lat * Math.PI) / 180);
        const d = HALF_SIDE_DEG * 0.66;
        return {
          type: 'Feature',
          properties: {
            id: p.id,
            r: p.score ?? -1,
            dead: p.status === 'dead',
            dim: this.dimmed.has(p.id),
            h: columnHeight(p.score, p.status === 'dead'),
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[[p.lng - k, p.lat - d], [p.lng + k, p.lat - d], [p.lng + k, p.lat + d], [p.lng - k, p.lat + d], [p.lng - k, p.lat - d]]],
          },
        };
      }),
    });
  }

  setPlaces(places: PlaceSummary[], opts: { dimmedIds?: Set<number> } = {}): void {
    this.places = places;
    this.dimmed = opts.dimmedIds ?? new Set();
    this.push();
  }

  growColumns(): void {
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1600);
      this.grow = 1 - Math.pow(1 - k, 3);
      this.map.setPaintProperty('bars', 'fill-extrusion-height', this.heightExpr());
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  flyTo(c: LngLat, zoom: number, pitch?: number): Promise<void> {
    return new Promise((resolve) => {
      this.map.once('moveend', () => resolve());
      this.map.flyTo({ center: [c.lng, c.lat], zoom, pitch: pitch ?? this.map.getPitch(), duration: 1800, essential: true });
    });
  }

  onPlaceClick(cb: (id: number) => void): void {
    this.placeCb = cb;
  }
  onMapClick(cb: (c: LngLat) => void): void {
    this.mapCb = cb;
  }
  onMove(cb: () => void): () => void {
    this.map.on('move', cb);
    return () => this.map.off('move', cb);
  }
  project(c: LngLat) {
    const p = this.map.project([c.lng, c.lat]);
    return { x: p.x, y: p.y };
  }
  metersToPixels(m: number, at: LngLat): number {
    return m / metersPerPixel(at.lat, this.map.getZoom());
  }
  columnHeightPx(p: PlaceSummary): number {
    const meters = columnHeight(p.score, p.status === 'dead') * zoomFactor(this.map.getZoom()) * this.grow;
    return this.metersToPixels(meters, p) * Math.sin((this.map.getPitch() * Math.PI) / 180);
  }
  zoom(): number {
    return this.map.getZoom();
  }
  pitch(): number {
    return this.map.getPitch();
  }
  destroy(): void {
    this.map?.remove();
  }
}
