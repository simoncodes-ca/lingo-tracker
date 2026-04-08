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

# Run a single test file (using Nx)
pnpm nx test core --testFile=src/lib/resource/checksum.spec.ts
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

Use the `/playwright-cli` skill for browser automation, UI testing, screenshots, and interacting with the running Tracker UI. Do NOT use the Playwright MCP plugin or invoke Playwright directly.

### Other Commands

```bash
pnpm run commit        # Interactive conventional commit
pnpm run test:release  # Dry-run semantic release
pnpm nx                # Direct Nx CLI access
```

## Architecture

### Monorepo Structure (Nx 21.5.3)

The codebase follows a **layered architecture** with three applications sharing core business logic:

```
apps/
├── cli/        # Command-line interface (Node.js + Commander)
├── api/        # REST API backend (NestJS + Express)
└── tracker/    # Web UI (Angular 20 + Material)

libs/
├── domain/            # Pure business logic (NO Node.js deps — browser-safe)
│   └── src/lib/       # Flat structure: key validation, status helpers,
│                      #   format conversion, validation utilities, shared types
├── core/              # Node.js business logic (file I/O, checksums, bundles)
│   ├── config/        # Configuration interfaces and management
│   ├── resource/      # Resource CRUD, metadata, validation
│   └── collections-manager/ # Collection operations
└── data-transfer/     # DTOs shared between API/CLI/UI
```

### Application Responsibilities

- **CLI** (`apps/cli`): Commands for init, add-collection, delete-collection, add-resource. Supports both interactive (TTY) and non-interactive (CI/CD) modes.
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

### Code Organization

- **Domain Logic** (`@simoncodes-ca/domain`): Pure business logic with **zero Node.js dependencies** — importable by all apps including the browser-based Tracker UI. This is where platform-agnostic logic belongs: key validation/parsing, translation status helpers, ICU↔Transloco format conversion, validation utilities (locale, key length, duplicates, hierarchical conflicts), and shared types (`TranslationStatus`, `LocaleMetadata`).
- **Core Logic** (`@simoncodes-ca/core`): Node.js-dependent business logic — file I/O, checksums (crypto), directory traversal, bundle generation, import/export. Core depends on domain; **domain must never depend on core**.
- **DTOs** (`@simoncodes-ca/data-transfer`): API contracts shared between API/CLI/UI
- **Mappers**: Convert between domain models and DTOs in API layer

#### What goes in domain vs core

| Belongs in `domain`                        | Belongs in `core`                          |
|--------------------------------------------|---------------------------------------------|
| Pure functions (string transforms, validation) | Anything using `fs`, `path`, `crypto`     |
| Types and interfaces shared across all apps | File read/write operations                 |
| Key parsing, status logic, format conversion | Bundle generation, import/export from disk |
| Regex-based validation                     | Directory traversal, checksum calculation  |

## Key Implementation Patterns

### Adding a Resource (libs/core/src/lib/resource/)

1. Validate key format and resolve to folder path
2. Load existing `resource_entries.json` and `tracker_meta.json`
3. Compute checksums (MD5) for source and translations
4. Determine translation status based on checksums
5. Write updated files atomically

### CLI Command Pattern (apps/cli/src/commands/)

```typescript
export const commandName = new Command('command-name')
  .description('Description')
  .argument('<arg>', 'Arg description')
  .action(async (arg) => {
    // Use dynamic import for prompts
    const prompts = (await import('prompts')).default;

    // Call core library functions
    const result = await coreFunction(arg);
  });
```

### API Controller Pattern (apps/api/src/app/controllers/)

```typescript
@Controller('collections')
export class CollectionsController {
  @Post()
  async create(@Body() dto: CreateCollectionDto) {
    // Call core library
    const result = await addCollection(dto.name, dto.config);

    // Map to DTO if needed
    return mapper.toDto(result);
  }
}
```

## Important Notes

- **Package Manager**: pnpm 10+ required (enforced by engines)
- **Node Version**: >=22.16.0
- **Commits**: Use `pnpm run commit` for conventional commits with commitizen
- **Testing**: Vitest for unit tests, use `--testFile` flag to run single test
- **API Port**: Default 3030, configurable via `LINGO_TRACKER_PORT` env var
- **CORS**: Enabled with wildcard origin in development mode

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
