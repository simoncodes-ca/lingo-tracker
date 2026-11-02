import { describe, expect, it } from 'vitest';
import { type CollectionLinkLayout, type CollectionLinks, collectionLinks, type LinkRect } from './collection-links';

const rect = (left: number, top: number, right: number, bottom: number): LinkRect => ({
  left,
  top,
  right,
  bottom,
  height: bottom - top,
});

interface Scenario {
  name: string;
  input: CollectionLinkLayout;
  expected: CollectionLinks;
}

// Expected paths and endpoints were captured from CollectionsManager.#measureLinks before extraction.
const scenarios: readonly Scenario[] = [
  {
    name: 'side-by-side columns',
    input: {
      container: rect(100, 50, 1000, 700),
      bundlesColumn: rect(620, 80, 970, 650),
      collections: [{ name: 'alpha', rect: rect(140, 100, 540, 200) }],
      bundles: [{ name: 'main', rect: rect(650, 130, 900, 210), collectionNames: new Set(['alpha']) }],
      hoveredBundle: 'main',
    },
    expected: {
      links: [{ name: 'alpha', x: 445, y: 100, path: 'M 440 100 C 489.5 100, 500.5 115, 550 115' }],
      port: { x: 545, y: 115 },
    },
  },
  {
    name: 'stacked narrow columns',
    input: {
      container: rect(100, 50, 500, 1000),
      bundlesColumn: rect(100.5, 510, 490, 970),
      collections: [{ name: 'alpha', rect: rect(120, 100, 460, 200) }],
      bundles: [{ name: 'main', rect: rect(120, 540, 470, 620), collectionNames: new Set(['alpha']) }],
      hoveredBundle: 'main',
    },
    expected: { links: [], port: null },
  },
  {
    name: 'port clamped to the bottom edge of the bundle column',
    input: {
      container: rect(100, 50, 1000, 700),
      bundlesColumn: rect(620, 80, 970, 400),
      collections: [{ name: 'alpha', rect: rect(140, 100, 540, 200) }],
      bundles: [{ name: 'main', rect: rect(650, 390, 900, 470), collectionNames: new Set(['alpha']) }],
      hoveredBundle: 'main',
    },
    expected: {
      links: [{ name: 'alpha', x: 445, y: 100, path: 'M 440 100 C 489.5 100, 500.5 340, 550 340' }],
      port: { x: 545, y: 340 },
    },
  },
  {
    name: 'one bundle linked to several collections with rounded and short-span paths',
    input: {
      container: rect(100.2, 50.4, 1000, 700),
      bundlesColumn: rect(620, 80, 970, 650),
      collections: [
        { name: 'alpha', rect: rect(140, 100.1, 540.4, 200.1) },
        { name: 'Bravo', rect: rect(140, 220.3, 560.2, 320.3) },
        { name: 'zulu', rect: rect(140, 340.5, 625.4, 440.5) },
        { name: 'unused', rect: rect(140, 460, 540, 560) },
      ],
      bundles: [
        { name: 'other', rect: rect(650, 90, 900, 170), collectionNames: new Set(['unused']) },
        { name: 'main', rect: rect(650.6, 180.2, 900, 260), collectionNames: new Set(['alpha', 'Bravo', 'zulu']) },
      ],
      hoveredBundle: 'main',
    },
    expected: {
      links: [
        { name: 'alpha', x: 445.2, y: 99.7, path: 'M 440.2 99.7 C 489.8 99.7, 500.8 164.8, 550.4 164.8' },
        { name: 'Bravo', x: 465, y: 219.9, path: 'M 460 219.9 C 500.7 219.9, 509.7 164.8, 550.4 164.8' },
        { name: 'zulu', x: 530.2, y: 340.1, path: 'M 525.2 340.1 C 537.8 340.1, 537.8 164.8, 550.4 164.8' },
      ],
      port: { x: 545.4, y: 164.8 },
    },
  },
  {
    name: 'bundle without matching collection cards',
    input: {
      container: rect(100, 50, 1000, 700),
      bundlesColumn: rect(620, 80, 970, 650),
      collections: [{ name: 'alpha', rect: rect(140, 100, 540, 200) }],
      bundles: [{ name: 'main', rect: rect(650, 130, 900, 210), collectionNames: new Set<string>() }],
      hoveredBundle: 'main',
    },
    expected: { links: [], port: null },
  },
];

describe('collectionLinks', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      expect(collectionLinks(scenario.input)).toEqual(scenario.expected);
    });
  }
});
