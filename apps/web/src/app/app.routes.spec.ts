import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { provideTestI18n } from './core/testing';

describe('routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), provideTestI18n()],
    });
  });

  it('renders the not-found page for unknown URLs', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/this/does/not/exist');
    expect(harness.routeNativeElement?.textContent).toContain('404');
  });

  it('renders the privacy page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/privacy');
    expect(harness.routeNativeElement?.querySelector('h1')).not.toBeNull();
  });
});
