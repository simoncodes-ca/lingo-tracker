## Getting Started

Lingo Tracker helps you track, validate, and manage translations across projects. This guide shows how to install the CLI, initialize a project, and add collections.

### Install

- Node.js >= 22.16 and pnpm >= 10 are recommended.
- Add the CLI to your workspace (recommended during development):

```bash
pnpm nx build cli && pnpm link --global ./dist/apps/cli
# Now the `lingo-tracker` command is available globally from your build output
```

Or install the built artifact wherever you publish it and ensure `lingo-tracker` is on your PATH.

### Initialize a project

Run in your project root to create `.lingo-tracker.json`:

```bash
lingo-tracker init
```

If you run it interactively, you will be prompted for missing values. In non‑interactive environments, pass the required options.

- Required when non‑interactive: `--collectionName`, `--translationsFolder`
- All options:
  - `--collectionName <name>`: Name of the initial collection key (e.g., "Main").
  - `--translationsFolder <path>`: Path to the translations directory for this collection.
  - `--exportFolder <path>`: Output folder for exports. Default: `dist/lingo-export`.
  - `--importFolder <path>`: Input folder for imports. Default: `dist/lingo-import`.
  - `--subfolderSplitThreshold <number>`: Split very large folders after N files. Default: `100`.
  - `--baseLocale <locale>`: Base/authoring locale. Default: `en`.
  - `--locales <locales...>`: Supported locales list. Example: `en fr-ca es de`.

Example (CI-safe, no prompts):

```bash
lingo-tracker init \
  --collectionName Main \
  --translationsFolder apps/web/src/assets/i18n \
  --exportFolder dist/lingo-export \
  --importFolder dist/lingo-import \
  --subfolderSplitThreshold 200 \
  --baseLocale en \
  --locales en fr-ca es de
```

### The configuration file

Initialization writes a JSON config named `.lingo-tracker.json` at your project root. Structure:

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "subfolderSplitThreshold": 100,
  "baseLocale": "en",
  "locales": [
    "en"
  ],
  "collections": {
    "Main": {
      "translationsFolder": "apps/web/src/assets/i18n"
    }
  }
}
```

- Global fields (`exportFolder`, `importFolder`, `subfolderSplitThreshold`, `baseLocale`, `locales`) apply to all collections by default.
- Each collection requires `translationsFolder`. A collection may override any global field locally if needed.

Collection shape:

```json
{
  "translationsFolder": "path/to/translations",
  "exportFolder": "optional/override",
  "importFolder": "optional/override",
  "subfolderSplitThreshold": 100,
  "baseLocale": "en",
  "locales": ["en", "fr-ca"]
}
```

### Add additional collections

Use `add-collection` to register more translation sources within the same repo. This reuses global defaults and only persists overrides when they differ.

```bash
lingo-tracker add-collection
```

- Required when non‑interactive: `--collectionName`, `--translationsFolder`
- All options (same meanings as `init`):
  - `--collectionName <name>`
  - `--translationsFolder <path>`
  - `--exportFolder <path>`
  - `--importFolder <path>`
  - `--subfolderSplitThreshold <number>`
  - `--baseLocale <locale>`
  - `--locales <locales...>`

Examples:

- Simple, rely on global defaults:

```bash
lingo-tracker add-collection \
  --collectionName Admin \
  --translationsFolder apps/admin/src/assets/i18n
```

- Override per-collection settings (only differences are saved under the collection):

```bash
lingo-tracker add-collection \
  --collectionName Mobile \
  --translationsFolder apps/mobile/src/i18n \
  --baseLocale en-GB \
  --subfolderSplitThreshold 50
```

Notes:
- If `.lingo-tracker.json` is missing or invalid, the command will exit with a helpful message.
- If the collection name already exists, the command will refuse to overwrite.

### Non-interactive and CI usage

Both commands support fully non‑interactive runs; provide all required flags to avoid prompts. The CLI auto‑detects TTY and will throw if a required option is missing in non‑interactive mode.

- Required flags in CI:
  - `init`: `--collectionName`, `--translationsFolder` (others optional)
  - `add-collection`: `--collectionName`, `--translationsFolder`

### Quick checklist

- Install and expose `lingo-tracker` on your PATH
- Run `lingo-tracker init` once in the repo
- Add more collections with `lingo-tracker add-collection`
- Commit `.lingo-tracker.json`

That's it. You're ready to track and manage translations with Lingo Tracker.

### Next Steps

- For managing translation resources and other CLI commands, see the [CLI Reference](./cli.md)
- For programmatic access via REST API, see the [API Reference](./api.md)
