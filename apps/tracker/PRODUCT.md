# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: an application developer, mid-feature, who has just written UI and needs to add,
find, or verify translation keys and get back to coding. They already know the codebase and
the key they are looking for. Interruption cost is the dominant concern.

Secondary (real, must not be blocked):

- Translators and reviewers working through `new` / `stale` entries a locale at a time,
  judging wording rather than moving fast.
- The i18n owner, accountable for translation health across collections before a release —
  hunting gaps, stale entries, and protected-term violations.

## Product Purpose

LingoTracker manages translation resources for apps using the Transloco library. The Tracker
web UI is its visual surface: browse a collection's folder tree, search across keys and
values, filter by locale and status, edit translations, and trigger auto-translation.

Success is a developer resolving a translation question in the UI faster than they could by
hand-editing JSON — and a release going out with no `new` or `stale` entries left behind.

## Positioning

Translations live as plain JSON files in the user's own repository, next to the code, with
metadata (MD5 checksums, status) in sibling files. There is no hosted service and no
database: every change is a Git diff a teammate can review in a normal pull request. The
UI is a lens onto those files, not a system of record that owns them.

## Operating Context

- Launched locally via `npx lingo-tracker-app`; the API (default port 3030) serves the UI and
  reads and writes the developer's working tree.
- The UI is one of three interfaces over the same core library, alongside a CLI (used
  interactively and in CI/CD) and a REST API. Behavior must not contradict the CLI.
- Work is organized into **collections** — resources grouped by team, feature, or domain.
  Some collections are **read-only** (e.g. component-library translations vendored under
  `node_modules`).
- Routes: `/collections` (manager), `/browser/:collectionName` (the main working surface),
  `/settings`.

## Capabilities and Constraints

Confirmed capabilities in the UI:

- Folder-tree sidebar over dot-delimited resource keys (`apps.common.buttons.ok`).
- Search across keys and values; filter by locale and by status.
- Compact / expanded density modes; view preferences persisted per collection.
- Translation editor dialog with similar-translation suggestions as you type.
- One-click auto-translation (Google Translate), preserving ICU placeholders and Transloco
  variables.
- Collection create/edit; read-only collections are protected across CLI, API, and UI.
- Settings page manages the protected-terms list: an alphabetical list with inline rename,
  staged add/remove, and an explicit save, backed by a standalone JSON file.
- Comment and tag popovers; indexing overlay during long operations.

Constraints:

- **Local-first, no accounts.** Single machine, single user. No auth, no multi-user
  presence, no remote sync state to design around.
- **Read-only collections must always be unmistakable** in the UI.
- **The Tracker UI is itself fully localized** with Transloco and dogfoods LingoTracker.
  Every user-visible string goes through the resource workflow — no hardcoded copy. Shipped
  UI locales: `en`, `de`, `es`, `fr-ca`, `ja`, `ru`. Layouts must survive long German and
  Russian strings and Japanese line-breaking.
- Angular 20 standalone components, Angular Material, NgRx Signals, OnPush change detection.
- Terminology is domain vocabulary and is not up for renaming: collection, resource, key,
  locale, base locale, bundle, glossary, protected term, and the status lifecycle
  `new` → `translated` → `stale` → `verified`.

## Brand Commitments

- Name: **LingoTracker**. Tagline: "Effortlessly Track, Validate, and Manage Your
  Translations."
- The **watercolor visual identity is binding**, not placeholder: warm parchment
  backgrounds, coral/vermillion primary, deep sky-blue secondary, and the watercolor accent
  palette in `src/styles/tokens.scss`. Nunito for all text; Grechen Fuemen reserved for the
  LingoTracker brand title only.
- Logo assets: `src/assets/logo.png`, `src/assets/logo-dark.png`,
  `src/assets/lingo-tracker-favicon-cropped.png`.
- Light and dark themes both ship.

## Evidence on Hand

- Real product docs: repo `README.md`, `ROADMAP.md`, `docs/` (auto-translation, glossary,
  protected terms, validate, bundle type generation), and a docs site under `docs-site/`.
- Real translation data: the Tracker's own `src/assets/i18n/*.json` across six locales.
- The project is described as stable and "currently being validated in an enterprise
  application." There are **no** named customers, testimonials, logos, benchmarks, pricing,
  or usage numbers — future work must not invent any.

## Product Principles

1. **The files are the truth.** The UI never becomes a source of state the repository cannot
   reproduce; every action ends as a reviewable Git diff.
2. **Don't break the developer's flow.** The primary user arrived with a key in mind and
   wants to leave; the shortest path from landing to that key wins over browsing elegance.
3. **Status is the spine.** `new` / `translated` / `stale` / `verified` is how every user
   decides what to touch next, and it must be legible at a glance at any density.
4. **Never let a destructive or locked state be a surprise.** Read-only collections,
   protected terms, and deletions announce themselves before the fact.
5. **Practice what it preaches.** The UI is localized, ICU-correct, and layout-safe in every
   locale it ships — it is its own reference implementation.

## Accessibility & Inclusion

No product-specific standard has been established yet — recorded as undecided. Existing code
shows deliberate `aria-labelledby` use on settings sections, so the incumbent baseline is
Angular Material semantics plus explicit landmark labeling; future work should not regress
below that.
