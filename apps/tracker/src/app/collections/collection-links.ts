/** The rectangle fields used by connector geometry, in viewport coordinates. */
export interface LinkRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly height: number;
}

export interface CollectionLinkCard {
  readonly name: string;
  readonly rect: LinkRect;
}

export interface CollectionLinkBundle {
  readonly name: string;
  readonly rect: LinkRect;
  readonly collectionNames: ReadonlySet<string>;
}

export interface CollectionLinkLayout {
  readonly container: LinkRect;
  readonly bundlesColumn: LinkRect;
  readonly collections: readonly CollectionLinkCard[];
  readonly bundles: readonly CollectionLinkBundle[];
  readonly hoveredBundle: string | null;
}

/** One drawn connection from a collection card's right edge to the hovered bundle's port. */
export interface BundleLink {
  readonly name: string;
  readonly path: string;
  /** Centre of the plug dot, already standing off the collection card's right edge. */
  readonly x: number;
  readonly y: number;
}

/** Where every line of the current hover converges, in `.split` coordinates. */
export interface BundlePort {
  /** Centre of the socket ring, already standing off the bundle card's left edge. */
  readonly x: number;
  readonly y: number;
}

export interface CollectionLinks {
  readonly links: readonly BundleLink[];
  readonly port: BundlePort | null;
}

/** Measured viewport rectangles for the hovered bundle and its linked collection cards. */
export interface CollectionLinkRects {
  readonly container: LinkRect;
  readonly column: LinkRect;
  readonly bundle: CollectionLinkCard;
  readonly collections: ReadonlyMap<string, LinkRect>;
}

/** Order the measured cards for rendering and delegate their connector geometry. */
export function collectionLinksFromRects(
  rects: CollectionLinkRects | undefined,
  collectionNames: readonly string[],
): CollectionLinks {
  if (!rects) return { links: [], port: null };
  const collections: CollectionLinkCard[] = [];
  for (const name of collectionNames) {
    const rect = rects.collections.get(name);
    if (rect) collections.push({ name, rect });
  }
  return collectionLinks({
    container: rects.container,
    bundlesColumn: rects.column,
    collections,
    bundles: [{ ...rects.bundle, collectionNames: new Set(rects.collections.keys()) }],
    hoveredBundle: rects.bundle.name,
  });
}

/** Padding plus half the bundle card's identity tile, measured from its top edge. */
const BUNDLE_PORT_OFFSET = 35;
/** Keeps the port clear of the scrolling bundles column's rim. */
const PORT_EDGE_INSET = 10;
/** Opaque cards cover dots centred directly on their edges. */
const NODE_STANDOFF = 5;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Compute connector paths and dot centres from measured rectangles only. */
export function collectionLinks(layout: CollectionLinkLayout): CollectionLinks {
  const { container, bundlesColumn, collections } = layout;
  const bundle = layout.bundles.find((card) => card.name === layout.hoveredBundle);

  // The bundle column sits below the collections when the layout stacks.
  if (!bundle || bundlesColumn.left - container.left < 1) return { links: [], port: null };

  const portX = round(bundle.rect.left - container.left);
  const portY = round(
    clamp(
      bundle.rect.top - container.top + BUNDLE_PORT_OFFSET,
      bundlesColumn.top - container.top + PORT_EDGE_INSET,
      bundlesColumn.bottom - container.top - PORT_EDGE_INSET,
    ),
  );

  const links: BundleLink[] = [];
  for (const card of collections) {
    if (!bundle.collectionNames.has(card.name)) continue;

    const x = round(card.rect.right - container.left);
    const y = round(card.rect.top - container.top + card.rect.height / 2);
    // The half-span ceiling stops close control points from crossing and kinking the curve.
    const span = portX - x;
    const reach = Math.min(Math.max(span * 0.45, 20), span * 0.5);

    links.push({
      name: card.name,
      x: x + NODE_STANDOFF,
      y,
      path: `M ${x} ${y} C ${round(x + reach)} ${y}, ${round(portX - reach)} ${portY}, ${portX} ${portY}`,
    });
  }

  return { links, port: links.length > 0 ? { x: portX - NODE_STANDOFF, y: portY } : null };
}
