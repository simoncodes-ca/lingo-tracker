# Monorepo Structure

LingoTracker is an Nx 24.0.2 monorepo containing three applications and three shared libraries. This document covers the directory layout, the unidirectional dependency graph that keeps browser-safe logic isolated from Node.js code, and the Nx workspace configuration highlights that govern how each project is built and tested.

Return to [architecture README](README.md).

---

## Table of Contents

- [Directory Tree](#directory-tree)
- [Dependency Layer Graph](#dependency-layer-graph)
- [Library Responsibilities and Layer Rules](#library-responsibilities-and-layer-rules)
  - [domain — browser-safe pure logic](#domain--browser-safe-pure-logic)
  - [core — Node.js business logic](#core--nodejs-business-logic)
  - [data-transfer — API contract DTOs](#data-transfer--api-contract-dtos)
  - [Public surface](#public-surface)
- [Nx Workspace Configuration Highlights](#nx-workspace-configuration-highlights)
  - [Build targets by project](#build-targets-by-project)
  - [Typecheck targets](#typecheck-targets)
  - [Test runners: Vitest and Jest](#test-runners-vitest-and-jest)
  - [Serve targets](#serve-targets)

---

## Directory Tree

```
lingo-tracker/                         # Nx workspace root
├── apps/
│   ├── cli/                           # Node.js CLI binary (Commander)
│   │   └── src/
│   │       ├── commands/              # One file per CLI command
│   │       ├── command-manifest.ts    # Command list and lazy loaders
│   │       ├── program.ts             # createCli(): builds Commander tree
│   │       └── main.ts                # Entry point; parses argv
│   ├── api/                           # NestJS REST API + static file host
│   │   └── src/
│   │       └── app/
│   │           ├── controllers/       # HTTP route handlers
│   │           ├── mappers/           # Domain model ↔ DTO conversion
│   │           └── services/          # Collection cache, config service
│   └── tracker/                       # Angular 22 SPA (Tracker UI)
│       └── src/
│           ├── app/                   # Routes, feature modules, stores
│           └── i18n/                  # Tracker's own translation resources
│               └── <folder>/          # resource_entries.json + tracker_meta.json
├── libs/
│   ├── domain/                        # Browser-safe pure logic (zero Node.js deps)
│   │   └── src/lib/
│   │       ├── translation-status.ts  # TranslationStatus type
│   │       ├── token-casing.ts        # TokenCasing type
│   │       ├── translation-status-summary.ts # Status counts and worst-status precedence
│   │       ├── locale-metadata.ts     # LocaleMetadata interface
│   │       ├── resource-key.ts        # Key validation, resolve, split
│   │       ├── staleness.ts           # Staleness rule and status transitions
│   │       ├── icu-to-transloco.ts    # ICU → Transloco syntax conversion
│   │       ├── transloco-to-icu.ts    # Transloco → ICU syntax conversion
│   │       ├── icu-auto-fixer.ts      # ICU quote-escape repair
│   │       ├── icu-classifier.ts      # plain / simple-placeholders / complex-icu
│   │       ├── icu-locale-validation.ts # compiles a value under its own locale
│   │       ├── portable-plural-categories.ts # locale-dependent plural cases
│   │       ├── reference-resolver.ts  # Inlines Transloco key references ({{t('key')}}, {{key}})
│   │       └── validation-utils.ts    # Locale code, key length, conflict checks
│   ├── core/                          # Node.js business logic (file I/O, crypto)
│   │   └── src/
│   │       ├── config/                # LingoTrackerConfig, BundleDefinition, etc.
│   │       ├── collections-manager/   # add-collection, delete-collection, update
│   │       └── lib/
│   │           ├── bundle/            # Bundle generation, tag filter, hierarchy
│   │           ├── export/            # Export run (runExport) and the JSON / XLIFF exporters
│   │           ├── import/            # Import run (importResources), JSON / XLIFF parse adapters
│   │           ├── resource/          # resource CRUD, Folder Address, checksums, reading and search
│   │           ├── folder/            # create-folder, delete-folder, move-folder
│   │           ├── normalize/         # Cleanup empty folders, normalize entries
│   │           ├── translate/         # Auto-translation, Google Translate provider
│   │           ├── validate/          # Resource validation, summary generation
│   │           ├── file-io/           # JSON read/write, directory operations
│   │           ├── config/            # Config file read/write
│   │           └── errors/            # Typed error classes
│   └── data-transfer/                 # Shared DTOs (no logic)
│       └── src/lib/                   # Request/response shapes for API + CLI + UI
├── sample-translations/               # Example collections used in tests and demos
│   ├── playground/
│   └── mock-design-system/
├── architecture-docs/                 # This documentation hub
├── docs-site/                         # Docusaurus-based published docs site
├── spec/                              # End-to-end / integration test specs
├── nx.json                            # Nx workspace configuration
├── pnpm-workspace.yaml                # pnpm workspace definition
└── .lingo-tracker.json                # Project-level LingoTracker config
```

---

## Dependency Layer Graph

<!-- Unidirectional dependency flow: domain is the innermost layer; apps are the outermost -->

```mermaid
graph TD
    subgraph apps["Applications (outermost layer)"]
        CLI["cli\nNode.js + Commander"]
        API["api\nNestJS + Express"]
        Tracker["tracker\nAngular 22 SPA"]
    end

    subgraph libs["Libraries"]
        DT["data-transfer\nDTOs only — no logic"]
        Core["core\nNode.js + fs + crypto"]
        Domain["domain\nPure TypeScript\nbrowser-safe"]
    end

    CLI --> Core
    CLI --> Domain
    CLI --> DT

    API --> Core
    API --> Domain
    API --> DT

    Tracker --> DT
    Tracker --> Domain

    Core --> Domain
    DT -.->|types only| Domain

    style Domain fill:#d4edda,stroke:#28a745,color:#000
    style Core fill:#d1ecf1,stroke:#17a2b8,color:#000
    style DT fill:#fff3cd,stroke:#ffc107,color:#000
    style CLI fill:#f8f9fa,stroke:#6c757d,color:#000
    style API fill:#f8f9fa,stroke:#6c757d,color:#000
    style Tracker fill:#f8f9fa,stroke:#6c757d,color:#000
```

**Arrows point in the direction of the import.** No arrow ever points toward `apps`; no arrow ever points from `domain` to `core`. `data-transfer` never imports `core`; it imports two types from `domain` (see [data-transfer](#data-transfer--api-contract-dtos)).

---

## Library Responsibilities and Layer Rules

### domain — browser-safe pure logic

`@simoncodes-ca/domain` is the innermost layer. It contains every piece of logic that must run in both Node.js and the browser:

| Module | What it does |
|---|---|
| `translation-status.ts` | Defines the `TranslationStatus` union type (`'new' \| 'translated' \| 'stale' \| 'verified'`) |
| `token-casing.ts` | Defines the `TokenCasing` union type (`'upperCase' \| 'camelCase'`) for generated bundle tokens |
| `translation-status-summary.ts` | The [translation status summary](glossary.md#translation-status-summary): `countByStatus`, `worstStatus`, and `STATUS_PRECEDENCE` (worst first) |
| `locale-metadata.ts` | Defines the `LocaleMetadata` interface (checksum, baseChecksum, status) |
| `resource-key.ts` | Validates, resolves (`resolveResourceKey`), and splits (`splitResolvedKey`) dot-delimited keys |
| `staleness.ts` | The staleness rule and status transitions (`applyBaseChange`, `recordTranslation`, `needsTranslation`, `resolveImportStatus`) |
| `icu-to-transloco.ts` | Converts ICU `{varName}` to Transloco `{{ varName }}` at bundle time |
| `transloco-to-icu.ts` | Converts Transloco `{{ varName }}` back to ICU `{varName}` at import time |
| `icu-classifier.ts` | Classifies a string as `plain`, `simple-placeholders`, or `complex-icu` |
| `icu-locale-validation.ts` | Compiles a value under the locale it is stored under; reports why it failed |
| `portable-plural-categories.ts` | Finds plural branches selected by locale-dependent category rather than `=N` |
| `icu-auto-fixer.ts` | Repairs malformed ICU quote escaping |
| `reference-resolver.ts` | Inlines Transloco key references (`{{t('key')}}`, `{{key}}`) between imported values; warns on missing and circular references |
| `validation-utils.ts` | Locale code format checks, key length limits, hierarchical conflict detection |

**Why zero Node.js dependencies?** The Tracker UI (Angular SPA) imports `@simoncodes-ca/domain` directly in the browser. Any Node.js built-in (`fs`, `path`, `crypto`, `node:*`) would break the Angular build. The zero-dependency constraint is enforced by the Nx project configuration: `domain` declares no Node.js peer dependencies and the dependency graph rules prohibit it from importing `core`.

See [domain-and-data-model.md](domain-and-data-model.md) for the data structures these modules operate on, and [core-library.md](core-library.md) for how `core` extends this logic with file I/O.

---

### core — Node.js business logic

`@simoncodes-ca/core` is the middle layer. It may import `domain` freely but never the reverse. All Node.js built-ins (`node:fs`, `node:path`, `node:crypto`) live here.

Key responsibilities:

- **Resource CRUD**: Reading and writing `resource_entries.json` and `tracker_meta.json` (both files are always written together by one call; the writes are not atomic).
- **Checksum calculation**: `calculateChecksum(value)` uses `node:crypto` MD5.
- **Bundle generation**: Aggregating resources across collections, applying tag filters, converting ICU to Transloco syntax, writing locale JSON files.
- **Import/export**: Parsing external XLIFF or JSON, applying ICU auto-fixes, determining translation status on import.
- **Collection management**: Creating and deleting collection entries in `.lingo-tracker.json`.
- **Auto-translation**: Google Translate v2 provider with placeholder protection for ICU variables.
- **Validation**: Per-resource status checks, aggregate validation summaries for CI.

**Why keep this separate from domain?** `core` is never imported by the Tracker UI. Keeping Node.js code out of `domain` means the browser bundle never includes `fs` or `crypto` polyfills.

See [core-library.md](core-library.md) for the full module breakdown.

---

### data-transfer — API contract DTOs

`@simoncodes-ca/data-transfer` imports nothing from `core`. From `domain` it takes two types, with `import type`, so they are declared once: `TranslationStatus` (re-exported as is) and `TokenCasing` (aliased as `TokenCasingDto`). Both are browser-safe and erased at build time. Otherwise it contains only TypeScript interfaces and classes that define the shapes of HTTP request bodies, response payloads, and shared view models exchanged between the API, CLI, and Tracker UI.

**Why isolate DTOs in their own library?** API contracts must be stable across all three consumers. Keeping DTOs in a dedicated library with no business logic means:

1. Any consumer can import only the shapes it needs without pulling in Node.js code.
2. Breaking changes to the API surface are localized here and immediately visible to all consumers via TypeScript compilation.
3. The library has no runtime behavior to test, so its `project.json` intentionally has an empty `targets` block.

The bundle DTOs (`BundleDefinitionDto`, `CollectionBundleDefinitionDto`, `EntrySelectionRuleDto`) still mirror core's `BundleDefinition` field for field, which is why `apps/api/src/app/mappers/bundle.mapper.ts` copies every field in both directions.

---

### Public surface

Each library's [public surface](glossary.md#public-surface) is its `src/index.ts` barrel. The `domain` and `core` barrels list every export by name and group them with a one-line comment per group. They export only what a caller outside the library uses, plus the types in those names' signatures. Everything else is a module detail: it can stay exported from its own file for the library's specs, but not from the barrel.

See [Core Public Surface](core-library.md#public-surface) for the test-only `@simoncodes-ca/core/testing` entry point and lint checks.

| Library | Barrel | Groups |
|---|---|---|
| `domain` | `libs/domain/src/index.ts` (69 names) | shared types, keys, staleness, status summary, ICU/Transloco, validation, terminology, references, tags, utilities. `index.spec.ts` pins the runtime export list. |
| `core` | `libs/core/src/index.ts` (203 names) | operations, collection & config, `ResourceFolder`, read models, errors, operation parameter and result types. See [core-library.md](core-library.md#public-surface). |
| `data-transfer` | `libs/data-transfer/src/index.ts` | `export *` of each DTO file. The library holds only DTOs, so every export is part of the contract. |

`core` does not re-export `domain` names. A caller that needs `TranslationStatus`, `TokenCasing` or `ImportStrategy` imports it from `@simoncodes-ca/domain`.

---

## Nx Workspace Configuration Highlights

### Build targets by project

| Project | Executor | Output |
|---|---|---|
| `cli` | `@nx/esbuild:esbuild` | `dist/apps/cli/` — single bundled CJS file for Node.js |
| `api` | `nx:run-commands` → `webpack-cli build` | `dist/apps/api/` — webpack bundle for NestJS |
| `tracker` | `@angular/build:application` | `dist/apps/tracker/` — Angular production SPA |
| `core` | TypeScript build via `@nx/js/typescript` plugin | Consumed directly from source by dependent apps |
| `domain` | TypeScript build via `@nx/js/typescript` plugin | Consumed directly from source by dependent apps |
| `data-transfer` | No build target (consumed from source) | — |

`core` and `domain` are excluded from the standard `@nx/js/typescript` plugin's build target configuration (the `exclude` list in `nx.json`) and have only `typecheck` enabled through a separate plugin include rule. Apps bundle the library source directly rather than consuming pre-built artifacts.

The `api` build has an explicit `dependsOn: ["^build", "^typecheck"]` which means all library typechecks run before the API bundle is produced.

The `tracker:serve` target has `dependsOn: ["api:serve"]`, so starting the dev server for the Angular UI automatically starts the API process as well.

### Typecheck targets

The `@nx/js/typescript` plugin infers `typecheck` as `tsc --build tsconfig.json --emitDeclarationOnly`. It checks the configs that the project's `tsconfig.json` references, so a spec is typechecked only when `tsconfig.spec.json` is covered:

| Project | Specs typechecked | How |
|---|---|---|
| `domain` | Yes | `tsconfig.json` references `tsconfig.spec.json` (composite) |
| `tracker` | Yes | `typecheck` depends on a `typecheck-spec` target in `project.json`: `tsc --noEmit -p tsconfig.spec.json`. A composite reference would break the Analog Vitest plugin, which reads the same file (see [frontend.md](frontend.md#testing)) |
| `core`, `cli` | Yes | Same `typecheck-spec` target as the tracker (Vitest types) |
| `api` | Yes | Same `typecheck-spec` target (Jest types) |
| `data-transfer` | — | No specs |

Each `typecheck-spec` target is cached. Its inputs are `default`, `^default`, `tsconfig.base.json` and `types/**` (the workspace's hand-written module declarations, for example `types/xliff.d.ts`). A spec config that sets `typeRoots` so that `vitest/globals` resolves must keep `../../types` in the list: without it, `xliff` has no types.

**Where typecheck runs.** The PR workflow (`.github/workflows/pr.yml`) runs `pnpm nx affected -t typecheck` after the affected tests, so a pull request runs `typecheck` and `typecheck-spec` for every affected project. The root `typecheck` script and the `.husky/pre-commit` hook run `nx typecheck core` and `nx typecheck data-transfer`, so a commit also typechecks the core specs. They do not run the tracker, cli or api targets, which keeps commits fast. `core:build` and `api:build` depend on `^typecheck`, so `api:build` runs `core:typecheck-spec` and both builds run the `domain` spec check. Run `pnpm nx typecheck <project>` locally before you push a spec change.

`tracker:typecheck-spec` and `tracker:test` both depend on `generate-tokens`, whose output `src/i18n-types/tracker-resources.ts` is gitignored, so the `default` input does not hash it. Both targets add `{ "dependentTasksOutputFiles": "**/*.ts" }` to their inputs, so a regenerated token file invalidates their cache. The other projects have no generated sources, so their `typecheck-spec` targets do not need it.

### Test runners: Vitest and Jest

`domain`, `core` and `tracker` use **Vitest** through the `@nx/vitest:test` executor. `cli` runs Vitest through `nx:run-commands` (`vitest` in `apps/cli`). `api` runs **Jest** through `nx:run-commands` (`jest` in `apps/api`). Vitest configuration is co-located with each project.

Test output is cached by Nx (`"cache": true` in `targetDefaults.test`), so unchanged projects are skipped on re-runs.

To run a single test file (the path is relative to the project root):

```bash
# domain, core, tracker, cli (vitest): a positional path after -- (vitest rejects --testFile as an unknown option)
pnpm nx test core -- src/lib/resource/checksum.spec.ts

# api (jest): a positional path after --
pnpm nx test api -- src/app/app.service.spec.ts
```

### Serve targets

| Command | What starts |
|---|---|
| `pnpm run serve:cli` | esbuild in watch mode; rebuilds on source change |
| `pnpm run serve:api` | `@nx/js:node` running the webpack output; hot-reloads on rebuild |
| `pnpm run serve:tracker` | Angular dev server on the default port; proxies `/api/*` to the API (via `proxy.conf.json`); starts `api:serve` as a dependency |
