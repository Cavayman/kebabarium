import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PlaceSummary } from '@kebabarium/shared';
import { AuthStore } from '../auth/auth.store';
import { provideTestI18n } from '../core/testing';
import { ReviewModalComponent } from './review-modal.component';

const place = (id: number, name: string, status: PlaceSummary['status'] = 'open'): PlaceSummary => ({
  id, name, lat: 0, lng: 0, district: null, address: null, status, deadReason: null, movedToPlaceId: null, chainId: null, chainName: null,
  logoUrl: null, score: 4, ourScore: null, ourCount: 0, googleRating: null, googleRatingCount: null, googleAttribution: false, reviewCount: 0,
});

describe('ReviewModalComponent', () => {
  let http: HttpTestingController;

  function open(preselect: number | null = 2) {
    const f = TestBed.createComponent(ReviewModalComponent);
    f.componentRef.setInput('places', [place(1, 'Шаурма на Коновальця'), place(2, 'Doner біля Ринку'), place(12, 'Патона', 'dead')]);
    f.componentRef.setInput('placeId', preselect);
    f.detectChanges();
    return f;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('requires stars before sending', () => {
    const f = open();
    f.nativeElement.querySelector('.send').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.err').textContent).toContain('Постав оцінку зірками');
    http.expectNone(() => true);
  });

  it('autocompletes only open places', () => {
    const f = open(null);
    f.componentInstance.query.set('ша');
    f.detectChanges();
    expect(f.componentInstance.suggestions().map((p) => p.id)).toEqual([1]);
  });

  it('posts the review and reports a cooldown in days', () => {
    const f = open();
    f.componentInstance.stars.set(5);
    f.componentInstance.text.set('топ');
    f.nativeElement.querySelector('.send').click();
    const req = http.expectOne('/api/places/2/reviews');
    expect(req.request.body).toMatchObject({ stars: 5, text: 'топ' });
    req.flush({ error: { code: 'cooldown', message: '', retryAfterSec: 3 * 86400 + 5 } }, { status: 429, statusText: 'Too Many' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.err').textContent).toContain('через 4 дн.');
  });

  it('hides the nickname field for logged-in users', () => {
    TestBed.inject(AuthStore).me.set({ id: 1, nickname: 'oleg', displayName: 'oleg', firstName: null, lastName: null, avatarUrl: null, role: 'user', showRealName: false, hideFromLeaderboard: false, lang: null });
    const f = open();
    expect(f.nativeElement.querySelector('input[name=nickname]')).toBeNull();
    expect(f.nativeElement.querySelector('.hint')).toBeNull();
  });
});
