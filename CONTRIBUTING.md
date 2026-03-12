# Contributing to LingoTracker

Thank you for your interest in contributing to LingoTracker! This guide will help you get started.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
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
- **Core** (`libs/core`) — Shared business logic
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

### Linting and Formatting

```bash
pnpm run lint            # Lint with Biome
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
- **Core logic**: All business logic belongs in `libs/core`.
- **DTOs**: API contracts are defined in `libs/data-transfer`.
- **Testing**: Vitest for unit tests.

## Questions?

Open an [issue](https://github.com/simoncodes-ca/lingo-tracker/issues) and we'll be happy to help.
