# LingoTracker

[![npm version](https://img.shields.io/npm/v/@simoncodes-ca/lingo-tracker)](https://www.npmjs.com/package/@simoncodes-ca/lingo-tracker) [![CI](https://github.com/simoncodes-ca/lingo-tracker/actions/workflows/pr.yml/badge.svg?branch=develop&event=push)](https://github.com/simoncodes-ca/lingo-tracker/actions/workflows/pr.yml?query=branch%3Adevelop) [![License: MIT](https://img.shields.io/github/license/simoncodes-ca/lingo-tracker)](LICENSE) [![Node ^24.15 || >=26](https://img.shields.io/badge/node-%5E24.15%20%7C%7C%20%3E%3D26-339933)](https://nodejs.org/)

Catch stale and unreviewed translations in CI, not in production.

Translation files in a repository hold only values. When the source text changes, nothing marks the translations out of date, so stale translations ship silently.

LingoTracker stores a status next to every translation in your Git repo. A changed source string marks its existing translations `stale`. Untranslated copies stay `new`. `lingo-tracker validate` fails CI while anything is missing, stale, unreviewed or invalid ICU for its locale. It is built for Angular apps using [Transloco](https://github.com/jsverse/transloco). One npm package gives you a CLI, a local web UI with a REST API, and an installable skill for AI coding assistants. There is no hosted service and no account.

**Status:** pre-1.0. The CLI and API are stable. Every pull request to `develop` runs unit tests and CLI end-to-end tests for the affected projects. The web UI has a Playwright end-to-end suite. See the [roadmap](ROADMAP.md) and the [changelog](CHANGELOG.md).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/simoncodes-ca/lingo-tracker/main/docs/images/translation-browser-dark.png">
  <img src="https://raw.githubusercontent.com/simoncodes-ca/lingo-tracker/main/docs/images/translation-browser-light.png" width="100%" alt="LingoTracker translation browser: fr-ca translations for the checkout keys of a storefront collection, with stale, new, translated and verified statuses.">
</picture>

## Why use it

**Gate the release.**

- Every translation is `new`, `translated`, `stale` or `verified`. Checksums mark existing translations `stale` when the source changes. Untranslated copies stay `new`.
- `validate` fails CI on missing, stale or unreviewed strings. Use `--allow-translated` for a staging gate.
- Every value compiles as an ICU message under its own locale. A plural that is valid in English but invalid in Japanese is caught before it renders empty.
- Pull requests show exactly which strings and statuses changed, because values and metadata are plain JSON per folder.

**Generate runtime bundles.**

- `bundle` writes one JSON file per locale from any mix of collections, key patterns and tags.
- It can emit a TypeScript constant tree, so a mistyped key fails to compile.
- `bundle --debug-keys` writes an extra bundle whose values are the keys themselves. Load it as its own locale to identify strings in the app.
- Read-only collections let you bundle translations shipped by a component library without editing them. `add-collection` defaults folders under `node_modules` to read-only.

**Translate and review strings.**

- Export `new` and `stale` strings as XLIFF 1.2 or JSON. Import with `translation-service` for vendor deliveries, `verification` for approvals, `migration` for existing files, or `update` for bulk corrections that keep the current status.
- Import repairs placeholder names that translators changed. It rejects translations that altered a protected term.
- Protected terms survive translation. Preferred terminology flags discouraged wording in source text.
- When enabled with a Google Cloud Translation v2 key, auto-translation fills target locales as you add strings. It skips complex ICU and any result with a lost or corrupted placeholder or a missing protected term. Results are marked `translated`, never `verified`.

**Work in the UI or from an assistant.**

- A local web UI lets you browse, search and filter by status. You edit with similar-string suggestions and run exports, imports and bundles with a live preview.
- `install-skill` writes a skill tailored to your collections. Claude Code or a similar assistant can then find hardcoded strings, reuse keys, add resources and update components.

**Adopting it.** Existing Transloco or i18next JSON moves in through the `migration` import strategy. The guide lists what each format keeps and loses. Gettext and CSV need a short conversion step. See the [migration guide](docs/guides/migration.md). After you resolve a merge conflict in the JSON files, run `normalize`. It recomputes checksums and reapplies the status rules. See the [normalize guide](docs/guides/normalize.md).

## Quick start

Requires Node.js 24.15 or later within the 24 line, or Node.js 26 or later.

```bash
pnpm add -D @simoncodes-ca/lingo-tracker     # or npm install --save-dev / yarn add -D

# Create .lingo-tracker.json
npx lingo-tracker init \
  --collection-name main --translations-folder src/i18n \
  --base-locale en --locales en fr-ca es \
  --setup-bundle true --bundle-dist ./src/assets/i18n \
  --type-dist-file ./src/generated/translation-tokens.ts

# Add a string, translate it, and generate the runtime files
npx lingo-tracker add-resource --key common.buttons.save --value "Save" --comment "Button on edit forms"
npx lingo-tracker edit-resource --key common.buttons.save --locale fr-ca --locale-value "Enregistrer"
npx lingo-tracker bundle

# Open the web UI at http://localhost:3030
npx lingo-tracker-app

# Gate the release
npx lingo-tracker validate   # exits 1: fr-ca not verified, es still English
```

The [Getting Started guide](https://simoncodes-ca.github.io/lingo-tracker/docs/getting-started) explains each step and what the files look like.

## What it does not do

- It does not host translations or coordinate translators. Hand-off happens through exported files.
- It has no user accounts or history beyond what Git gives you.
- Machine translation supports Google Cloud Translation v2 only and skips plural, select and formatted ICU messages.
- The web UI runs locally without authentication. It is for one developer's machine, not a shared server.
- Bundles assume `@jsverse/transloco-messageformat` unless `runtime` is `"transloco"` in `.lingo-tracker.json`, for apps on plain Transloco where `{` and `'` are literal text. `init` detects it from `package.json`.
- Other libraries can consume the nested JSON bundles when their placeholder syntax matches, with ICU-to-Transloco conversion turned off.

## Documentation

The full documentation is at [simoncodes-ca.github.io/lingo-tracker](https://simoncodes-ca.github.io/lingo-tracker/).

| Page | Covers |
|---|---|
| [Getting Started](docs/getting-started.md) | Install, init, first resource, first bundle |
| [Concepts](docs/concepts.md) | Keys, folders, the two files, statuses and checksums |
| [Configuration](docs/configuration.md) | Every field of `.lingo-tracker.json` |
| [CLI Reference](docs/cli.md) | Every command, flag and exit code |
| [API Reference](docs/api.md) | Every endpoint of `lingo-tracker-app`, with Swagger UI at `/api` |
| [Tracker UI](docs/tracker-ui.md) | The web application |
| [Guides](docs/guides/) | Bundling, translation workflow, CI/CD, migration, normalize, AI assistant |
| [Features](docs/features/) | Validate, export, import, type generation, terminology, glossary |
| [Changelog](CHANGELOG.md) | Release history |

For contributors, [architecture-docs](architecture-docs/README.md) describes the monorepo, data model and application layers.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and the commit convention. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
