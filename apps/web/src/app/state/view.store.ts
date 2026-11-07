import { Injectable, signal } from '@angular/core';

export type View = 'map' | 'dash';
const KEY = 'kb.view';

/** Main view: the 3D map (default) or the dashboard for people who'd rather read than fly. Remembered per browser. */
@Injectable({ providedIn: 'root' })
export class ViewStore {
  readonly view = signal<View>(read());

  set(v: View): void {
    this.view.set(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* private mode: just don't remember */
    }
  }
}

function read(): View {
  try {
    return localStorage.getItem(KEY) === 'dash' ? 'dash' : 'map';
  } catch {
    return 'map';
  }
}
