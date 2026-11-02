# Contributing to LingoTracker

Thank you for your interest in contributing to LingoTracker. This guide will help you get started.

## Prerequisites

- [Node.js](https://nodejs.org/) ^24.15.0 || >=26.0.0 (see `engines` in `package.json`)
- [pnpm](https://pnpm.io/) >= 10

## Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/<your-username>/lingo-tracker.git
   cd lingo-tracker
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the project:

   ```bash
   pnpm run build
   ```

4. Run the tests:

   ```bash
   pnpm run test
   ```

## Development

### Project Structure

This is an Nx monorepo with three applications sharing core business logic:

- **CLI** (`apps/cli`) — Command-line interface
- **API** (`apps/api`) — NestJS REST API
- **Tracker** (`apps/tracker`) — Angular web UI
- **Domain** (`libs/domain`) — Pure business logic (browser-safe, no Node.js deps)
- **Core** (`libs/core`) — Node.js business logic (file I/O, checksums, bundles)
- **Data Transfer** (`libs/data-transfer`) — Shared DTOs

### Running Development Servers

```bash
pnpm run serve:api       # API server on port 3030
pnpm run serve:tracker   # Angular dev server
```

### Running Tests

```bash
pnpm run test            # All tests
pnpm run test:cli        # CLI tests only
pnpm run test:api        # API tests only
pnpm run test:core       # Core library tests only
pnpm run test:tracker    # Tracker UI tests only
```

### Test suites

| Suite | Command | When CI runs it |
|---|---|---|
| Unit tests (Vitest; the API uses Jest) | `pnpm run test` | `pr.yml`: pull requests to `develop` and pushes to `develop` (affected projects) |
| CLI end-to-end smoke tests | `pnpm nx e2e cli-e2e` | `pr.yml`: same triggers (affected projects) |
| Tracker end-to-end tests (Playwright) | `pnpm nx e2e tracker-e2e` | `tracker-e2e.yml`: pull requests to `main` automatically; pull requests to `develop` only with the `run-e2e` label |

### Linting and Formatting

```bash
pnpm run lint            # Lint with Biome and ESLint
pnpm run format:check    # Check formatting
pnpm run format          # Auto-format
```

## Making Changes

1. Create a feature branch from `develop`:

   ```bash
   git checkout -b feat/my-feature develop
   ```

2. Make your changes and write tests as needed.

3. Commit using conventional commits:

   ```bash
   pnpm run commit
   ```

   This launches an interactive prompt that guides you through writing a properly formatted commit message.

4. Push your branch and open a pull request against `develop`.

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commit messages are validated by commitlint. Common prefixes:

- `feat:` — A new feature
- `fix:` — A bug fix
- `docs:` — Documentation changes
- `refactor:` — Code changes that neither fix a bug nor add a feature
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Code Standards

- **Angular components**: Use signals, standalone components, OnPush change detection, and `inject()` for DI.
- **Domain logic**: Pure, platform-agnostic business logic belongs in `libs/domain`. This includes key validation/parsing, translation status helpers, ICU/Transloco format conversion, and shared types. Domain has **zero Node.js dependencies** so it can be imported by all apps, including the browser-based Tracker UI.
- **Core logic**: Node.js-dependent business logic belongs in `libs/core` — file I/O, checksums, directory traversal, bundle generation. Core depends on domain; **domain must never depend on core**.
- **DTOs**: API contracts are defined in `libs/data-transfer`.
- **Testing**: Vitest for unit tests.

## Contributing to Documentation

The docs site lives in `docs-site/` and is built with [Docusaurus](https://docusaurus.io/). To run it locally:

```bash
pnpm run docs:dev
```

Markdown sources live in `docs/`. The Docusaurus site in `docs-site/` builds them. Add or edit pages in `docs/` and open a pull request as you would for any other change.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Questions?

Open an [issue](https://github.com/simoncodes-ca/lingo-tracker/issues) and we'll be happy to help.
