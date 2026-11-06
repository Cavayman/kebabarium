import { TestBed } from '@angular/core/testing';
import type { CityStats } from '@kebabarium/shared';
import { provideTestI18n } from '../core/testing';
import { BootScreenComponent } from './boot-screen.component';
import { BOOT_HARD_MAX_MS, bootFrame, bootTimeline } from './boot-timeline';

const stats: CityStats = { city: 'Львів', spots: 312, reviews: 4812, open: 295, dead: 17, lastSyncAt: null };

describe('boot timeline', () => {
  const steps = bootTimeline('lviv', 'ready. смачного!');

  it('starts by typing the command', () => {
    const f = bootFrame(steps, 120, stats);
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]!.text.length).toBeGreaterThan(0);
    expect('kebabarium --city lviv --hungry'.startsWith(f.lines[0]!.text)).toBe(true);
    expect(f.lines[0]!.caret).toBe(true);
  });

  it('shows real numbers from the stats', () => {
    const all = bootFrame(steps, 99_999, stats).lines;
    const values = all.map((l) => l.value).filter(Boolean);
    expect(values).toEqual(['Львів', '312 spots', '4 812', '295 open · 17 dead', '230°C']);
    expect(all.at(-1)).toMatchObject({ kind: 'ready', text: 'ready. смачного!' });
    expect(bootFrame(steps, 99_999, stats).finished).toBe(true);
  });

  it('spins while a step is in progress', () => {
    const cmdEnd = steps[1]!.t;
    const f = bootFrame(steps, cmdEnd + 50, stats);
    expect(f.lines[1]).toMatchObject({ kind: 'step', spinning: true });
  });
});

describe('BootScreenComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
  });
  afterEach(() => vi.useRealTimers());

  it('never stays longer than the hard maximum, even if the map never becomes ready', () => {
    const f = TestBed.createComponent(BootScreenComponent);
    f.componentRef.setInput('stats', stats);
    f.componentRef.setInput('ready', false);
    const done = vi.fn();
    f.componentInstance.done.subscribe(done);
    f.detectChanges();
    vi.advanceTimersByTime(BOOT_HARD_MAX_MS + 1000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('shows everything at once for reduced motion', () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    const f = TestBed.createComponent(BootScreenComponent);
    f.componentRef.setInput('stats', stats);
    f.componentRef.setInput('ready', true);
    f.detectChanges();
    vi.advanceTimersByTime(20);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('312 spots');
    expect(f.nativeElement.textContent).toContain('ready. смачного!');
  });

  it('can be skipped with a tap', () => {
    const f = TestBed.createComponent(BootScreenComponent);
    f.componentRef.setInput('stats', stats);
    const done = vi.fn();
    f.componentInstance.done.subscribe(done);
    f.detectChanges();
    (f.nativeElement.querySelector('.boot') as HTMLElement).click();
    vi.advanceTimersByTime(700);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
