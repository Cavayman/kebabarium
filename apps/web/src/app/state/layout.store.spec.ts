import { TestBed } from '@angular/core/testing';
import { LayoutStore } from './layout.store';

function setWidth(px: number) {
  window.matchMedia = ((q: string) => ({
    matches: /max-width:\s*560px/.test(q) && px <= 560,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('LayoutStore', () => {
  beforeEach(() => localStorage.clear());

  it('remembers dragged positions and resets them', () => {
    setWidth(1280);
    const s = TestBed.inject(LayoutStore);
    s.savePosition('lb', { x: 300, y: 200 });
    expect(TestBed.runInInjectionContext(() => new LayoutStore()).position('lb')).toEqual({ x: 300, y: 200 });
    expect(s.hasCustomLayout()).toBe(true);
    s.reset();
    expect(s.position('lb')).toBeNull();
    expect(s.hasCustomLayout()).toBe(false);
    expect(localStorage.getItem('kb.pos.lb')).toBeNull();
  });

  it('starts with panels collapsed on phones and opens one sheet at a time', () => {
    setWidth(375);
    const s = TestBed.inject(LayoutStore);
    expect(s.isOpen('lb')).toBe(false);
    expect(s.isOpen('feed')).toBe(false);
    s.open('lb');
    s.open('feed');
    expect(s.isOpen('feed')).toBe(true);
    expect(s.isOpen('lb')).toBe(false);
  });

  it('keeps several windows open on desktop', () => {
    setWidth(1280);
    const s = TestBed.inject(LayoutStore);
    expect(s.isOpen('lb')).toBe(true);
    s.open('near');
    expect(s.isOpen('lb')).toBe(true);
    expect(s.isOpen('near')).toBe(true);
    s.collapse('lb');
    expect(s.isOpen('lb')).toBe(false);
    expect(s.collapsedPills()).toContain('lb');
  });
});
