import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { Me } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import { AccountComponent } from './account.component';
import { AuthDialogsComponent } from './auth-dialogs.component';
import { AuthUiStore } from './auth-ui.store';
import { AuthStore } from './auth.store';

const me = (role: 'user' | 'admin' = 'user'): Me => ({
  id: 7, nickname: 'taras', displayName: 'taras', firstName: 'Taras', lastName: 'S', avatarUrl: null, role,
  showRealName: false, hideFromLeaderboard: false, lang: null,
});

describe('AccountComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideTestI18n()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('opens sign-in outside the navbar (no overlay inside the transformed/blurred pill)', () => {
    const f = TestBed.createComponent(AccountComponent);
    f.detectChanges();
    (f.nativeElement.querySelector('.chip') as HTMLElement).click();
    f.detectChanges();
    expect(TestBed.inject(AuthUiStore).loginOpen()).toBe(true);
    expect(f.nativeElement.querySelector('.bg')).toBeNull();
  });

  it('signs in with the Google credential and asks for a nickname on first login', async () => {
    const f = TestBed.createComponent(AuthDialogsComponent);
    f.detectChanges();
    f.componentInstance.onCredential('google-jwt');
    const req = http.expectOne('/api/auth/google');
    expect(req.request.body).toEqual({ credential: 'google-jwt' });
    req.flush({ me: { ...me(), nickname: null }, needsNickname: true, suggestedNickname: 'taras' });
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    const input = f.nativeElement.querySelector('input[name=nickname]') as HTMLInputElement;
    expect(input.value).toBe('taras');
  });

  it('reports a taken nickname', async () => {
    TestBed.inject(AuthStore).me.set({ ...me(), nickname: null });
    const f = TestBed.createComponent(AuthDialogsComponent);
    f.componentInstance.ui.nicknameOpen.set(true);
    f.componentInstance.nick.set('oleg');
    f.detectChanges();
    f.nativeElement.querySelector('.save').click();
    http.expectOne('/api/me').flush({ error: { code: 'nickname_taken', message: '' } }, { status: 409, statusText: 'Conflict' });
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Такий нікнейм уже зайнятий');
  });

  it('switches the UI to English and remembers it', async () => {
    TestBed.inject(AuthStore).me.set(me());
    const f = TestBed.createComponent(AccountComponent);
    f.componentInstance.menuOpen.set(true);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Вийти');
    (f.nativeElement.querySelector('[data-lang=en]') as HTMLElement).click();
    http.expectOne('/api/me').flush({ ...me(), lang: 'en' });
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(localStorage.getItem('kb.lang')).toBe('en');
    expect(f.nativeElement.textContent).toContain('Log out');
  });

  it('shows the admin link only to admins', () => {
    const store = TestBed.inject(AuthStore);
    store.me.set(me());
    const f = TestBed.createComponent(AccountComponent);
    f.componentInstance.menuOpen.set(true);
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Адмінка');
    store.me.set(me('admin'));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Адмінка');
  });
});
