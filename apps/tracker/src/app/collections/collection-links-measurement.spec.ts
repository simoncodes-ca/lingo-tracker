import { describe, expect, it, vi } from 'vitest';
import { type CollectionLinkRects, collectionLinksFromRects, type LinkRect } from './collection-links';
import { measureCollectionLinks, readCollectionLinkRects } from './collection-links-measurement';

const rect = (left: number, top: number, right: number, bottom: number): LinkRect => ({
  left,
  top,
  right,
  bottom,
  height: bottom - top,
});

const container = rect(100, 50, 1000, 700);
const column = rect(620, 80, 970, 650);
const bundle = rect(650, 130, 900, 210);
const alpha = rect(140, 100, 540, 200);
const bravo = rect(140, 220, 540, 320);

function rects(
  collections: ReadonlyMap<string, LinkRect> = new Map([
    ['alpha', alpha],
    ['Bravo', bravo],
  ]),
): CollectionLinkRects {
  return { container, column, bundle: { name: 'main', rect: bundle }, collections };
}

describe('collectionLinksFromRects', () => {
  it('skips a missing linked collection while keeping the remaining connection', () => {
    expect(collectionLinksFromRects(rects(new Map([['alpha', alpha]])), ['Bravo', 'alpha'])).toEqual({
      links: [{ name: 'alpha', x: 445, y: 100, path: 'M 440 100 C 489.5 100, 500.5 115, 550 115' }],
      port: { x: 545, y: 115 },
    });
  });

  it('connects several linked collections in template order rather than linked-name order', () => {
    expect(
      collectionLinksFromRects(
        rects(
          new Map([
            ['Bravo', bravo],
            ['alpha', alpha],
          ]),
        ),
        ['alpha', 'Bravo'],
      ),
    ).toEqual({
      links: [
        { name: 'alpha', x: 445, y: 100, path: 'M 440 100 C 489.5 100, 500.5 115, 550 115' },
        { name: 'Bravo', x: 445, y: 220, path: 'M 440 220 C 489.5 220, 500.5 115, 550 115' },
      ],
      port: { x: 545, y: 115 },
    });
  });

  it('ignores linked collections absent from the current template order', () => {
    expect(collectionLinksFromRects(rects(new Map([['alpha', alpha]])), ['Bravo'])).toEqual({
      links: [],
      port: null,
    });
  });

  it('delegates stacked-column suppression to the geometry function', () => {
    expect(collectionLinksFromRects({ ...rects(), column: rect(100, 510, 490, 970) }, ['alpha'])).toEqual({
      links: [],
      port: null,
    });
  });
});

describe('measureCollectionLinks', () => {
  it('returns no links without a hover and does not read rectangles', () => {
    const root = document.createElement('div');
    const query = vi.spyOn(root, 'querySelector');
    expect(measureCollectionLinks(root, null, new Set(['alpha']), ['alpha'])).toEqual({ links: [], port: null });
    expect(query).not.toHaveBeenCalled();
  });

  for (const missing of ['container', 'bundles-column', 'bundle:main']) {
    it(`returns no links when the ${missing} element is missing`, () => {
      const root = document.createElement('div');
      root.innerHTML = '<div class="split"><div class="bundles-col"></div><div data-bundle="main"></div></div>';
      const selector =
        missing === 'container' ? '.split' : missing === 'bundles-column' ? '.bundles-col' : '[data-bundle]';
      root.querySelector(selector)?.remove();
      const measured = readCollectionLinkRects(root, 'main', new Set(['alpha']), ['alpha']);
      expect(measured).toBeUndefined();
      expect(collectionLinksFromRects(measured, ['alpha'])).toEqual({ links: [], port: null });
    });
  }

  it('does not read or draw an unlinked collection', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="split"><div class="bundles-col"></div>
      <div data-bundle="main"></div><div data-collection="alpha"></div></div>`;
    const collection = root.querySelector('[data-collection]');
    if (!collection) throw new Error('Expected collection card');
    const measure = vi.spyOn(collection, 'getBoundingClientRect');
    const measured = readCollectionLinkRects(root, 'main', new Set(['missing']), ['alpha', 'missing']);
    expect(measured?.collections.size).toBe(0);
    expect(collectionLinksFromRects(measured, ['alpha', 'missing'])).toEqual({ links: [], port: null });
    expect(measure).not.toHaveBeenCalled();
  });

  it('returns no links and measures no cards when the bundles column is missing', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="split"><div data-bundle="main"></div><div data-collection="alpha"></div></div>';
    const measures = Array.from(root.querySelectorAll('*')).map((element) =>
      vi.spyOn(element, 'getBoundingClientRect'),
    );
    expect(measureCollectionLinks(root, 'main', new Set(['alpha']), ['alpha'])).toEqual({ links: [], port: null });
    for (const measure of measures) expect(measure).not.toHaveBeenCalled();
  });

  it('returns no links and measures no cards when the hovered bundle target is missing', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="split"><div class="bundles-col"></div>
      <div data-bundle="other"></div><div data-collection="alpha"></div></div>`;
    const measures = Array.from(root.querySelectorAll('*')).map((element) =>
      vi.spyOn(element, 'getBoundingClientRect'),
    );
    expect(measureCollectionLinks(root, 'main', new Set(['alpha']), ['alpha'])).toEqual({ links: [], port: null });
    for (const measure of measures) expect(measure).not.toHaveBeenCalled();
  });

  it('uses the first matching elements and supports names with selector punctuation', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="split"><div class="bundles-col"></div>
      <div data-bundle='main"[]'></div><div data-bundle='main"[]'></div>
      <div data-collection='alpha"[]'></div><div data-collection='alpha"[]'></div>
      <div data-collection="unused"></div></div>`;
    const split = root.querySelector('.split');
    const bundlesColumn = root.querySelector('.bundles-col');
    const bundles = root.querySelectorAll('[data-bundle]');
    const collections = root.querySelectorAll('[data-collection]');
    if (!split || !bundlesColumn || !bundles[0] || !collections[0]) throw new Error('Expected connector elements');
    const domRect = (value: LinkRect): DOMRect =>
      new DOMRect(value.left, value.top, value.right - value.left, value.height);
    vi.spyOn(split, 'getBoundingClientRect').mockReturnValue(domRect(container));
    vi.spyOn(bundlesColumn, 'getBoundingClientRect').mockReturnValue(domRect(column));
    const bundleMeasurement = vi.spyOn(bundles[0], 'getBoundingClientRect').mockReturnValue(domRect(bundle));
    const collectionMeasurement = vi.spyOn(collections[0], 'getBoundingClientRect').mockReturnValue(domRect(alpha));
    for (const element of [...Array.from(bundles).slice(1), ...Array.from(collections).slice(1)]) {
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
        throw new Error('Only the first matching linked card should be measured');
      });
    }

    expect(measureCollectionLinks(root, 'main"[]', new Set(['alpha"[]']), ['alpha"[]'])).toEqual({
      links: [{ name: 'alpha"[]', x: 445, y: 100, path: 'M 440 100 C 489.5 100, 500.5 115, 550 115' }],
      port: { x: 545, y: 115 },
    });
    expect(bundleMeasurement).toHaveBeenCalledTimes(1);
    expect(collectionMeasurement).toHaveBeenCalledTimes(1);
  });

  it('returns no links when the root has no split container', () => {
    expect(measureCollectionLinks(document.createElement('div'), 'main', new Set(['alpha']), ['alpha'])).toEqual({
      links: [],
      port: null,
    });
  });
});
