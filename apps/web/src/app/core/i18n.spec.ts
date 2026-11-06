import { detectLang } from './i18n';

describe('detectLang', () => {
  it('uses English for English browsers', () => expect(detectLang('en-US', null)).toBe('en'));
  it('defaults to Ukrainian for anything else', () => {
    expect(detectLang('uk-UA', null)).toBe('uk');
    expect(detectLang('pl-PL', null)).toBe('uk');
    expect(detectLang(undefined, null)).toBe('uk');
  });
  it('prefers a remembered choice', () => expect(detectLang('en-US', 'uk')).toBe('uk'));
  it('ignores garbage in storage', () => expect(detectLang('en-GB', 'de')).toBe('en'));
});
