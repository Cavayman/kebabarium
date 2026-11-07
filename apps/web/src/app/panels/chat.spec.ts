import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ChatMessage } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import { LayoutStore } from '../state/layout.store';
import { ChatPanel } from './chat.panel';

const msg = (id: number, author: string, text: string, own = false): ChatMessage => ({ id, author, text, own, createdAt: new Date().toISOString() });

describe('ChatPanel', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestI18n(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => vi.useRealTimers());

  function open(canPost: boolean, items: ChatMessage[] = [msg(1, 'taras', 'Де смачно?'), msg(2, 'olena', 'Кебаб Шеф')]) {
    const f = TestBed.createComponent(ChatPanel);
    f.componentRef.setInput('city', 'lviv');
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/cities/lviv/chat' && !r.params.has('after')).flush({ items, canPost });
    f.detectChanges();
    return f;
  }

  it('shows the room to everyone, and tells visitors to sign in to write', () => {
    const f = open(false);
    const el: HTMLElement = f.nativeElement;
    expect([...el.querySelectorAll('.cm b')].map((b) => b.textContent!.trim())).toEqual(['taras', 'olena']);
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('.signin')!.textContent).toContain('увійди через Google');
  });

  it('sends a message with Enter and shows it as own', () => {
    const f = open(true);
    const box = f.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    box.value = 'Шаурма на Ринку топ';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/cities/lviv/chat');
    expect(req.request.body).toEqual({ text: 'Шаурма на Ринку топ' });
    req.flush(msg(3, 'me', 'Шаурма на Ринку топ', true), { status: 201, statusText: 'Created' });
    f.detectChanges();
    expect(box.value).toBe('');
    const last = [...f.nativeElement.querySelectorAll('.cm')].at(-1) as HTMLElement;
    expect(last.classList).toContain('own');
    expect(last.textContent).toContain('Шаурма на Ринку топ');
  });

  it('explains why a message was refused', () => {
    const f = open(true);
    const box = f.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    box.value = 'ще';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    http.expectOne((r) => r.method === 'POST').flush({ error: { code: 'chat_cooldown', retryAfterSec: 3 } }, { status: 429, statusText: 'Too Many Requests' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.err')!.textContent).toContain('повільніше');
    expect(box.value).toBe('ще');
  });

  it('polls for newer messages only', async () => {
    vi.useFakeTimers();
    const f = open(false);
    vi.advanceTimersByTime(5000);
    const req = http.expectOne((r) => r.url === '/api/cities/lviv/chat' && r.params.get('after') === '2');
    req.flush({ items: [msg(3, 'ira', 'нове')], canPost: false });
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.cm').length).toBe(3);
  });

  it('lives in the dock as a collapsed pill until opened', () => {
    const layout = TestBed.inject(LayoutStore);
    expect(layout.isOpen('chat')).toBe(false);
    expect(layout.collapsedPills()).toContain('chat');
  });
});
