import { act, renderHook } from '@testing-library/react';
import { hrefFor, parseRoute, useRoute } from './route';

describe('parseRoute', () => {
  it.each([
    ['', { page: 'home' }],
    ['#/', { page: 'home' }],
    ['#/galleries/streets', { page: 'gallery', slug: 'streets' }],
    ['#/about', { page: 'about' }],
    ['#/contact', { page: 'contact' }],
    ['#/account', { page: 'account' }],
    ['#/galleries', { page: 'not-found' }],
    ['#/galleries/a/b', { page: 'not-found' }],
    ['#/about/extra', { page: 'not-found' }],
    ['#/nope', { page: 'not-found' }],
  ])('%s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });
});

describe('hrefFor', () => {
  it('round-trips every page', () => {
    expect(hrefFor({ page: 'home' })).toBe('#/');
    expect(hrefFor({ page: 'gallery', slug: 'faces' })).toBe('#/galleries/faces');
    expect(hrefFor({ page: 'about' })).toBe('#/about');
    expect(hrefFor({ page: 'not-found' })).toBe('#/');
  });
});

describe('useRoute', () => {
  it('follows hash changes and scrolls to top', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    window.location.hash = '#/';
    const { result, unmount } = renderHook(() => useRoute());
    expect(result.current).toEqual({ page: 'home' });
    act(() => {
      window.location.hash = '#/about';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toEqual({ page: 'about' });
    expect(scroll).toHaveBeenCalledWith(0, 0);
    unmount();
    scroll.mockRestore();
  });
});
