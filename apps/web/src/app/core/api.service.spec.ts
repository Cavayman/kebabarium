import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { apiInterceptor } from './api.interceptor';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads city places with the SPA marker header', async () => {
    const p = firstValueFrom(api.places('lviv'));
    const req = http.expectOne('/api/cities/lviv/places');
    expect(req.request.headers.get('X-Requested-With')).toBe('kebabarium');
    req.flush([]);
    expect(await p).toEqual([]);
  });

  it('passes feed filters as query params', () => {
    api.feed('lviv', { source: 'google', since: '2026-11-06T10:00:00.000Z' }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/cities/lviv/feed');
    expect(req.request.params.get('source')).toBe('google');
    expect(req.request.params.get('since')).toBe('2026-11-06T10:00:00.000Z');
    req.flush({ items: [], threadsStatus: 'ok', now: '' });
  });

  it('omits r for the default nearby search', () => {
    api.near(49.8, 24.0).subscribe();
    const req = http.expectOne((r) => r.url === '/api/places/near');
    expect(req.request.params.has('r')).toBe(false);
    req.flush({ radiusKm: 1, autoWidened: false, items: [] });
  });
});
