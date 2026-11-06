import { Radar } from './radar';
import { dropEmoji } from './emoji-drop';
import { FakeMapProvider } from './testing';

describe('Radar overlay', () => {
  it('is drawn to the real radius and rescales when the map moves', async () => {
    const host = document.createElement('div');
    const map = new FakeMapProvider();
    const radar = new Radar(map, host);
    radar.show({ lat: 49.83, lng: 24.02 }, 1);
    const disc = host.querySelector<HTMLElement>('.radar-area')!;
    expect(disc.style.width).toBe('200px');

    map.scale = 0.05;
    map.fireMove();
    map.fireMove(); // several camera events in one frame → one re-measure
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(disc.style.width).toBe('100px');
    expect(host.querySelector<HTMLElement>('.radar-ring')!.style.width).toBe('100px');

    radar.finish();
    expect(host.querySelector('.radar')!.classList.contains('done')).toBe(true);
    radar.hide();
    expect(host.querySelector('.radar')).toBeNull();
  });
});

describe('emoji drop', () => {
  it('shows the rating emoji with a caption above the place and removes it afterwards', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const map = new FakeMapProvider();
    dropEmoji(map, host, { lat: 49.83, lng: 24.02, heightPx: 40 }, 5, 'oleg поставив 5★');
    const el = host.querySelector<HTMLElement>('.drop')!;
    expect(el.querySelector('.e')!.textContent).toBe('🤤');
    expect(el.querySelector('.cap')!.textContent).toBe('oleg поставив 5★');
    vi.advanceTimersByTime(3000);
    expect(host.querySelector('.drop')).toBeNull();
    vi.useRealTimers();
  });

  it('renders the caption as text, never HTML', () => {
    const host = document.createElement('div');
    dropEmoji(new FakeMapProvider(), host, { lat: 49.83, lng: 24.02, heightPx: 0 }, 1, '<img src=x onerror=alert(1)>');
    expect(host.querySelector('img')).toBeNull();
  });
});
