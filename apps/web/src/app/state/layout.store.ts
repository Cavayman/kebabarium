import { computed, Injectable, signal } from '@angular/core';

export type PanelId = 'lb' | 'feed' | 'near' | 'chat';
export interface Pos {
  x: number;
  y: number;
}

const MOBILE_QUERY = '(max-width: 560px)';
const KEY = (id: string) => `kb.pos.${id}`;
const DOCKABLE: PanelId[] = ['lb', 'feed', 'chat'];
/** Open on desktop at start; the chat waits in the dock as a pill. */
const OPEN_AT_START: PanelId[] = ['lb', 'feed'];

/**
 * Window layout: desktop panels are draggable (positions remembered) and collapsible into pills;
 * on phones they start collapsed and open as bottom sheets one at a time (spec §5).
 */
@Injectable({ providedIn: 'root' })
export class LayoutStore {
  readonly mobile = signal(matchMedia(MOBILE_QUERY).matches);
  private readonly positions = signal<Record<string, Pos>>(this.load());
  private readonly openSet = signal<Set<PanelId>>(new Set(this.mobile() ? [] : OPEN_AT_START));

  readonly hasCustomLayout = computed(() => Object.keys(this.positions()).length > 0);
  readonly collapsedPills = computed(() => DOCKABLE.filter((id) => !this.openSet().has(id)));

  constructor() {
    const mq = matchMedia(MOBILE_QUERY);
    mq.addEventListener?.('change', (e) => {
      this.mobile.set(e.matches);
      this.openSet.set(new Set(e.matches ? [] : OPEN_AT_START));
    });
  }

  private load(): Record<string, Pos> {
    const out: Record<string, Pos> = {};
    for (const id of ['lb', 'feed', 'near', 'chat']) {
      try {
        const v = JSON.parse(localStorage.getItem(KEY(id)) ?? 'null');
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) out[id] = { x: v.x, y: v.y };
      } catch {
        /* ignore corrupt values */
      }
    }
    return out;
  }

  position(id: PanelId): Pos | null {
    return this.mobile() ? null : (this.positions()[id] ?? null);
  }

  savePosition(id: PanelId, p: Pos): void {
    localStorage.setItem(KEY(id), JSON.stringify(p));
    this.positions.update((all) => ({ ...all, [id]: p }));
  }

  reset(): void {
    for (const id of Object.keys(this.positions())) localStorage.removeItem(KEY(id));
    this.positions.set({});
  }

  isOpen(id: PanelId): boolean {
    return this.openSet().has(id);
  }

  open(id: PanelId): void {
    this.openSet.update((s) => (this.mobile() ? new Set([id]) : new Set([...s, id])));
  }

  collapse(id: PanelId): void {
    this.openSet.update((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  /** Phones: tapping empty map closes every sheet. */
  closeSheets(): void {
    if (this.mobile()) this.openSet.set(new Set());
  }
}
