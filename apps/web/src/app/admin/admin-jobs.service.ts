import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';

/**
 * Long admin jobs that run as a loop of server chunks (a full city scan, Google ratings for every place).
 * Root-scoped so the progress survives switching admin tabs.
 */
@Injectable({ providedIn: 'root' })
export class AdminJobs {
  private readonly api = inject(ApiService);

  readonly scanning = signal(false);
  readonly scanCity = signal<string | null>(null);
  readonly scanDone = signal(0);
  readonly scanTotal = signal(0);
  readonly scanAdded = signal(0);
  readonly scanError = signal<string | null>(null);

  readonly rating = signal(false);
  readonly ratingDone = signal(0);
  readonly ratingTotal = signal(0);
  readonly ratingError = signal<string | null>(null);

  /** One full pass over a city: the server does a chunk per request, we keep asking until every pair is covered. */
  async scanAll(city: string): Promise<void> {
    if (this.scanning()) return;
    this.scanning.set(true);
    this.scanCity.set(city);
    this.scanDone.set(0);
    this.scanTotal.set(0);
    this.scanAdded.set(0);
    this.scanError.set(null);
    try {
      for (;;) {
        const r = await firstValueFrom(this.api.admin.scan(city));
        this.scanTotal.set(r.total);
        this.scanDone.update((d) => Math.min(r.total, d + r.done));
        this.scanAdded.update((a) => a + r.placesAdded);
        if (r.done === 0) {
          this.scanError.set(r.error || r.notes.join(', ') || 'no progress');
          break;
        }
        if (this.scanDone() >= r.total) break;
      }
    } catch (e) {
      this.scanError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.scanning.set(false);
    }
  }

  /** Google ratings + reviews for every never-rated place (all cities), one server chunk per request. */
  async pullRatings(): Promise<void> {
    if (this.rating()) return;
    this.rating.set(true);
    this.ratingDone.set(0);
    this.ratingTotal.set(0);
    this.ratingError.set(null);
    try {
      for (;;) {
        const r = await firstValueFrom(this.api.admin.ratings());
        this.ratingDone.update((d) => d + r.done);
        this.ratingTotal.set(this.ratingDone() + r.remaining);
        if (r.remaining === 0) break;
        if (r.done === 0) {
          this.ratingError.set(r.error || r.notes.join(', ') || 'no progress');
          break;
        }
      }
    } catch (e) {
      this.ratingError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.rating.set(false);
    }
  }
}
