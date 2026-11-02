# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

LingoTracker is a translation management system designed to work with the Transloco library. It provides CLI, REST API, and web UI interfaces for managing translation resources with metadata tracking, ICU format validation, and Git-friendly JSON storage.

## Build & Development Commands

### Build

```bash
# Build all projects
pnpm run build

# Build individual apps
pnpm run build:cli    # CLI application
pnpm run build:api    # NestJS API
pnpm run build:tracker # Angular UI
```

### Testing

```bash
# Run all tests
pnpm run test

# Run tests for individual apps/libs
pnpm run test:cli
pnpm run test:api
pnpm run test:core
pnpm run test:domain
pnpm run test:tracker
pnpm nx e2e cli-e2e  # smoke tests the built CLI (builds cli first)
pnpm nx e2e tracker-e2e  # Playwright suite against the built API + Tracker (builds both first)

# Run a single test file: positional path after --, relative to the project root.
# Nx flags (--skip-nx-cache, --outputStyle) go before --; everything after it reaches the runner.
pnpm nx test core -- src/lib/resource/checksum.spec.ts   # core, domain, tracker, cli (vitest)
pnpm nx test api -- src/app/app.service.spec.ts          # api (jest)

# Typecheck (tracker, core, cli and api also typecheck their specs via typecheck-spec)
pnpm nx typecheck tracker
```

### Development Servers

```bash
pnpm run serve:cli     # Watch mode for CLI
pnpm run serve:api     # API server (default port 3030)
pnpm run serve:tracker # Angular dev server
```

### Translations / i18n

Use the `/lingo-tracker` skill for detecting hardcoded strings, creating translation resources, and updating components to use Transloco. It handles the full workflow: detect → add-resource → bundle → update code.

### Browser / UI Testing

Use the `/playwright-cli` skill for ad-hoc browser automation, screenshots, and interacting with the running Tracker UI. Do NOT use the Playwright MCP plugin for this. Automated UI tests belong in `apps/tracker-e2e`.

### Tracker E2E (`apps/tracker-e2e`)

Playwright, Chromium only. Specs are `src/**/*.e2e.ts`; import `test`/`expect` from `src/fixtures`.

- **System under test**: each worker spawns the built `dist/apps/api/main.js` (which serves `dist/apps/tracker/browser`) on a free port, with a temporary project folder as cwd. Never run e2e against the dev server: its cwd is the workspace root.
- **Data**: the `project` fixture gives each test its own collection and restores `.lingo-tracker.json` afterwards. Seed through the running API, not by importing core. Assert on disk with the read-only `disk` helpers.
- **Mocking**: real backend by default. Use `page.route` only for error, latency and network-failure states. The Tracker bundles its fonts and icons; a network guard fails the test on any non-localhost request. Machine translation is not covered.
- **Locators**: `getByTestId` for app-specific elements, `getByRole` with English names for standard widgets. No CSS or `.mat-*` selectors, no `waitForTimeout`. Add a `data-testid` only when a test needs it.
- **Page objects** (`src/pages/`): locators and multi-step actions, no assertions; exposed as fixtures.
- **CI** (`.github/workflows/tracker-e2e.yml`): runs automatically on PRs to `main`, and on PRs to `develop` only when a maintainer adds the `run-e2e` label. `pr.yml` excludes `tracker-e2e`.

### Other Commands

```bash
pnpm run lint          # Biome and cached ESLint checks for all six projects
pnpm run commit        # Interactive conventional commit
pnpm run test:release  # Dry-run semantic release
pnpm nx                # Direct Nx CLI access
```

## Architecture

### Monorepo Structure (Nx 24.0.2)

The codebase follows a **layered architecture** with three applications sharing core business logic:

```
apps/
├── cli/        # Command-line interface (Node.js + Commander)
├── api/        # REST API backend (NestJS + Express)
└── tracker/    # Web UI (Angular 22 + Material)

libs/
├── domain/            # Pure business logic (NO Node.js deps — browser-safe)
│   └── src/lib/       # Flat structure: key validation, status helpers,
│                      #   format conversion, validation utilities, shared types
├── core/              # Node.js business logic (file I/O, checksums, bundles)
│   └── src/
│       ├── config/            # Configuration interfaces
│       ├── collections-manager/ # Collection operations
│       └── lib/resource/      # Resource CRUD, Folder Address, metadata, reading
└── data-transfer/     # DTOs shared between API/CLI/UI
```

### Application Responsibilities

- **CLI** (`apps/cli`): Commands for init, add-collection, edit-collection, delete-collection, add-locale, remove-locale, add-resource, edit-resource, delete-resource, move, normalize, translate-locale, bundle, export, import, validate, find-similar, glossary, protected-terms, preferred-terminology, install-skill. Supports both interactive (TTY) and non-interactive (CI/CD) modes.
- **API** (`apps/api`): REST endpoints at `/api/*`, serves static Tracker UI, uses mappers to convert between core domain models and DTOs.
- **Tracker UI** (`apps/tracker`): Angular app with Material UI for browsing/managing translations, uses NgRx Signals for state management.

### Core Domain Concepts

#### Resource Hierarchy

- Resources use **dot-delimited keys** (e.g., `apps.common.buttons.ok`)
- Keys decompose into folder paths: `apps.common.buttons.ok` → `apps/common/buttons/` folder with `ok` as entry
- Each folder contains:
  - `resource_entries.json` - Translation data
  - `tracker_meta.json` - Metadata (checksums, status)

#### Configuration

- **Global**: `.lingo-tracker.json` at project root
- **Per-Collection**: Collections can override global settings
- Key settings: `baseLocale`, `locales`, `translationsFolder`

#### Translation Status Lifecycle

- `new` - Not yet translated
- `translated` - Has translation but not verified
- `stale` - Base value changed, translation out of sync
- `verified` - Reviewed and approved

#### Metadata Tracking

- MD5 checksums track source and translation changes
- `baseChecksum` - Hash of source locale value
- `checksum` - Hash of current translation
- Enables automatic stale detection when source changes

## Code Standards

### Angular Components (from .cursor/rules/angular.mdc)

- **Use Signals**: Prefer `signal()`, `computed()`, `effect()` over BehaviorSubject/Observable for component state
- **Functional Injection**: Use `inject()` function instead of constructor injection
- **Standalone Components**: All new components should be standalone with direct imports
- **OnPush Change Detection**: Default to `ChangeDetectionStrategy.OnPush`
- **Typed Forms**: Always specify types for FormGroup and FormControl
- **Host Bindings**: Use `host` in decorator over `@HostBinding`/`@HostListener`
- **Lifecycle Interfaces**: Implement interfaces (OnInit, OnDestroy, etc.) for type safety

Example:

```typescript
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  host: {
    '[class.active]': 'isActive()',
  },
})
export class ExampleComponent implements OnInit {
  private service = inject(DataService);
  count = signal(0);
  doubledCount = computed(() => this.count() * 2);

  ngOnInit(): void {
    /* ... */
  }
}
```

### TypeScript Safety

- **No non-null assertions**: Never use the `!` operator. The linter (`lint/style/noNonNullAssertion`) forbids it.
  - In production code: use an explicit null-guard (`if (!x) return;` or `if (!x) throw`) before accessing the value
  - In tests: use `expect(value).toBeDefined()` followed by optional chaining (`value?.property`) for subsequent assertions

### Code Organization

- **Domain Logic** (`@simoncodes-ca/domain`): Pure business logic with **zero Node.js dependencies** — importable by all apps including the browser-based Tracker UI. This is where platform-agnostic logic belongs: key validation/parsing, translation status helpers, ICU↔Transloco format conversion, validation utilities (locale, key length, duplicates, hierarchical conflicts), and shared types (`TranslationStatus`, `LocaleMetadata`).
- **Core Logic** (`@simoncodes-ca/core`): Node.js-dependent business logic — file I/O, checksums (crypto), directory traversal, bundle generation, import/export. Core depends on domain; **domain must never depend on core**.
- **Core test helpers** (`@simoncodes-ca/core/testing`): Test-only error fixtures and internal module access for app specs and test helpers (`testing/`, `*.spec-helpers.ts`). ESLint prevents production imports; these names do not extend the public barrel.
- **DTOs** (`@simoncodes-ca/data-transfer`): API contracts shared between API/CLI/UI
- **Validation**: Request shape is checked at the edge in `apps/api/src/app/validation/`; rules live in domain/core.
- **Mappers**: Convert between domain models and DTOs in API layer

#### What goes in domain vs core

| Belongs in `domain`                        | Belongs in `core`                          |
|--------------------------------------------|---------------------------------------------|
| Pure functions (string transforms, validation) | Anything using `fs`, `path`, `crypto`     |
| Types and interfaces shared across all apps | File read/write operations                 |
| Key parsing, status logic, format conversion | Bundle generation, import/export from disk |
| Regex-based validation                     | Directory traversal, checksum calculation  |

## Key Implementation Patterns

### Adding a Resource (libs/core/src/lib/resource/resource-entry.ts)

1. Validate the key (and optional `targetFolder`) and resolve it to a folder path
2. Core `preflightAdd` validates a non-empty base value and supplied locales and statuses, then checks whether the resolved key exists; fail by default before locale seeding, or replace only when requested
3. Core `prepareAdd` produces a Prepared Add: an ICU base value, every target locale (supplied value, else auto-translation, else a `new` copy of the base), skipped locales and terminology with Translator problems, before writing any resource file
4. `commitPrepared` reopens fresh state, checks existence again and writes through `openResourceFolder` (`libs/core/src/lib/resource/resource-folder.ts`), the one read-modify-write path for `resource_entries.json` + `tracker_meta.json`: it computes MD5 checksums and applies the staleness rule
5. `save()` writes both files together (not atomically) and reports through the Mutation Sink

These add phases and their types are private to the Entry Writes module, which owns `addResource`, `addResources` and `editResource` alongside remove. Single-entry translation belongs to Translation Run.

`addResources` preflights every item before preparing any. Each preflight precedes the batch duplicate-key check. After preparation, it rechecks every item without an await before committing in input order; a preparation failure or late conflict writes no batch item.

### CLI Command Pattern (apps/cli/src/runner/command-runner.ts)

```typescript
export const addLocaleCommand = defineCommand<AddLocaleOptions>()({
  name: 'Add locale',              // "❌ Add locale cancelled."
  collection: 'writable',          // 'writable' | 'read' | 'none'
  prompts: (options) => (options.locale ? [] : [{ type: 'text', name: 'locale', message: 'Locale' }]),
  required: ['locale'],            // exit 1 when missing; typed as present in run
  run: async ({ collection, answers }) => {
    const result = await addLocaleToCollection(collection, answers.locale);
    ConsoleFormatter.success(result.message);
  },
});
```

- The runner owns config loading, collection resolution, the interactive rule, cancellation and exit codes (`process.exitCode`, never `process.exit`). `run` returns `{ exitCode: 1 }` for a failure it has already reported, or throws.
- Diagnostics go to stderr via `ConsoleFormatter.error/warning`; the payload goes to stdout.
- Command tests use `runCommand(command, flags, { cwd, ask?, interactive?, stdin? })` with a temporary project and real core. Use `testing/command-project.ts` to create and clean up the config, collection and summary files; assert on stored files and captured output rather than mocking core. For commands that accept piped text, supply `stdin: { isTTY, read() }` to control input without reading the test runner's stdin. Production defaults to `process.stdin.isTTY` and a deferred `readFileSync(0, 'utf8')`.
- Flag records own registration, per-field prompts and selection metadata. Export and import add typed resolution rules in their `*-cmd-flags.ts` files; resolution takes values without a prompt context. The runner appends command `prompts` after flag-level questions. Export and import pass prompt-free flags to the runner and build record questions with command-specific context.
- Commands are registered (flags, help text, lazy import) in the Command Manifest `apps/cli/src/command-manifest.ts`, which `createCli(manifest = commandManifest)` in `apps/cli/src/program.ts` registers; `main.ts` only supplies argv. `main.spec.ts` and `main.handlers.spec.ts` inject recording loaders derived from the real manifest to cover flag wiring and every entry without command-module mocks, and `program.lazy.spec.ts` checks that help loads without core.

### API Controller Pattern (apps/api/src/app/<feature>/<feature>.controller.ts)

```typescript
@Controller('collections')
export class CollectionsController {
  @Post()
  async createCollection(@ValidBody(createCollectionBody) body: CreateCollectionDto): Promise<{ message: string }> {
    const mapped = mapDtoToCollection(body.collection); // DTO → core shape (apps/api/src/app/mappers/)
    const result = addCollection(body.name, mapped); // synchronous core call
    return { message: result.message };
  }
}
```

## Important Notes

- **Package Manager**: pnpm 10+ required (enforced by engines)
- **Node Version**: ^24.15.0 || >=26.0.0 (matches `engines`)
- **Commits**: Use `pnpm run commit` for conventional commits with commitizen
- **Testing**: Vitest for unit tests (the API uses Jest); see [Testing](#testing) for running a single file. API Jest tests need Node 24.9 or later, because NestJS 12 is ESM-only and Jest loads it through require(esm); `nx test api` sets `NODE_OPTIONS=--experimental-vm-modules`, replacing any `NODE_OPTIONS` already set for that target; the published runtime still supports the `engines` range.
- **API Port**: Default 3030, configurable via `LINGO_TRACKER_PORT` env var
- **CORS**: Allow only HTTP/HTTPS Origins without userinfo whose parsed host and port match the request Host header, ignoring case. Other localhost ports and loopback hostnames do not bypass this rule. The Angular dev proxy preserves Host localhost:4200, matching its browser Origin. Reject foreign/null/malformed/multiple Origins with 403 before handlers; no-Origin requests pass this check. In every bind mode, Host must name localhost, an IPv4 literal, a bracketed IPv6 literal, or an exact name in LINGO_TRACKER_ALLOWED_HOSTS (comma-separated, trimmed, case-insensitive; port optional). Missing/disallowed Host receives 403. LAN IP access needs no extra setting; named LAN access requires an allowed-host entry.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->
