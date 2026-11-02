import {
  type CollectionLinkRects,
  type CollectionLinks,
  collectionLinksFromRects,
  type LinkRect,
} from './collection-links';

/** DOM boundary for Connector Links; guards required elements and measures only linked cards. */
export function readCollectionLinkRects(
  root: Element,
  hoveredBundle: string | null,
  linkedNames: ReadonlySet<string>,
  collectionNames: readonly string[],
): CollectionLinkRects | undefined {
  if (hoveredBundle === null) return undefined;
  const split = root.querySelector('.split');
  const column = split?.querySelector('.bundles-col');
  const target = Array.from(split?.querySelectorAll('[data-bundle]') ?? []).find(
    (element) => element.getAttribute('data-bundle') === hoveredBundle,
  );
  if (!split || !column || !target) return undefined;

  const collectionElements = new Map<string, Element>();
  for (const element of Array.from(split.querySelectorAll('[data-collection]'))) {
    const name = element.getAttribute('data-collection');
    if (name !== null && linkedNames.has(name) && !collectionElements.has(name)) collectionElements.set(name, element);
  }
  const collections = new Map<string, LinkRect>();
  for (const name of collectionNames) {
    const element = collectionElements.get(name);
    if (element && !collections.has(name)) collections.set(name, element.getBoundingClientRect());
  }
  return {
    container: split.getBoundingClientRect(),
    column: column.getBoundingClientRect(),
    bundle: { name: hoveredBundle, rect: target.getBoundingClientRect() },
    collections,
  };
}

/** Measure the current DOM and return the connector paths and port rendered by the component. */
export function measureCollectionLinks(
  root: Element,
  hoveredBundle: string | null,
  linkedNames: ReadonlySet<string>,
  collectionNames: readonly string[],
): CollectionLinks {
  return collectionLinksFromRects(
    readCollectionLinkRects(root, hoveredBundle, linkedNames, collectionNames),
    collectionNames,
  );
}
