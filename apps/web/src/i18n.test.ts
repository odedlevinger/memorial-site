import type { Language } from './content';
import { BUILT_IN_LANGUAGE, makeI18n, storedLanguage, storeLanguage } from './i18n';

const lang = (code: string, labels: Record<string, string> = {}, isDefault = false): Language => ({ code, name: code, direction: 'ltr', isDefault, labels });

describe('makeI18n', () => {
  it('uses the chosen language, else the default, else built-in English', () => {
    const list = [lang('en', {}, true), lang('he')];
    expect(makeI18n(list, 'he', () => undefined).current.code).toBe('he');
    expect(makeI18n(list, 'xx', () => undefined).current.code).toBe('en');
    expect(makeI18n(list, null, () => undefined).current.code).toBe('en');
    expect(makeI18n([], 'he', () => undefined).current).toBe(BUILT_IN_LANGUAGE);
  });

  it('labels: override → built-in for the language → default’s override → default’s built-in', () => {
    const list = [lang('he', { 'nav.contact': 'דברו איתנו' }, true), lang('fr', { 'nav.about': 'À propos' }), lang('en', { 'nav.menu': 'More' })];
    const fr = makeI18n(list, 'fr', () => undefined);
    expect(fr.t('nav.about')).toBe('À propos');
    expect(fr.t('nav.contact')).toBe('דברו איתנו');
    expect(fr.t('nav.galleries')).toBe('גלריות');
    const en = makeI18n(list, 'en', () => undefined);
    expect(en.t('nav.menu')).toBe('More');
    expect(en.t('nav.galleries')).toBe('Galleries');
    expect(makeI18n([lang('fr', {}, true)], null, () => undefined).t('nav.about')).toBe('About'); // no built-in French
  });

  it('fills {placeholders} it has values for and leaves the rest', () => {
    const i18n = makeI18n([lang('en', { 'viewer.photoOf': '{n} / {count} {other}' }, true)], null, () => undefined);
    expect(i18n.t('viewer.photoOf', { n: 2, count: 5 })).toBe('2 / 5 {other}');
    expect(i18n.t('viewer.photoOf')).toBe('{n} / {count} {other}');
  });
});

describe('remembered language', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips through localStorage and survives blocked storage', () => {
    storeLanguage('he');
    expect(storedLanguage()).toBe('he');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(storedLanguage()).toBeNull();
    expect(() => storeLanguage('en')).not.toThrow();
  });
});
