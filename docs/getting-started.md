---
title: Getting Started
sidebar_position: 2
---

# Getting Started

This guide installs LingoTracker, creates a project, adds a first string, generates a bundle and opens the web UI. It takes about ten minutes.

## Requirements

- Node.js 24.15 or later in the 24 line, or Node.js 26 or later
- A package manager: pnpm, npm or yarn

## Install

Install the package as a development dependency of the project that owns the translations.

```bash
pnpm add -D @simoncodes-ca/lingo-tracker
# or
npm install --save-dev @simoncodes-ca/lingo-tracker
# or
yarn add -D @simoncodes-ca/lingo-tracker
```

The package installs two commands:

| Command | Purpose |
|---|---|
| `lingo-tracker` | The CLI |
| `lingo-tracker-app` | The web UI and its REST API |

Run them with `npx`, or add scripts to `package.json`. The examples below use `npx`.

## 1. Initialize the project

Run `init` in the folder that will hold `.lingo-tracker.json`. The CLI reads the config file from the directory you run it in (or from `INIT_CWD` under a package-manager script), never from a parent folder.

Interactive:

```bash
npx lingo-tracker init
```

Non-interactive, which is the form to copy into scripts:

```bash
npx lingo-tracker init \
  --collection-name main \
  --translations-folder src/i18n \
  --base-locale en \
  --locales en fr-ca es \
  --setup-bundle true \
  --bundle-dist ./src/assets/i18n \
  --bundle-name "{locale}" \
  --type-dist-file ./src/generated/translation-tokens.ts
```

| Flag | Meaning |
|---|---|
| `--collection-name` | Name of the first collection. A collection is one translations folder. |
| `--translations-folder` | Where LingoTracker stores its own files. Keep this separate from the bundle output folder. |
| `--base-locale` | The locale you author in. |
| `--locales` | Every locale the project supports, including the base locale. Bundles are produced for this list. |
| `--setup-bundle true` | Customize the default bundle instead of accepting the defaults. |
| `--bundle-dist` | Folder the runtime JSON files go to, the one your app loads from. |
| `--bundle-name` | File name pattern. `{locale}` becomes `en`, `fr-ca`, and so on. |
| `--type-dist-file` | Enables TypeScript key generation and names the output file. |

The result is a `.lingo-tracker.json` like this:

```json
{
  "exportFolder": "dist/lingo-export",
  "importFolder": "dist/lingo-import",
  "baseLocale": "en",
  "locales": ["en", "fr-ca", "es"],
  "collections": {
    "main": {
      "translationsFolder": "src/i18n"
    }
  },
  "bundles": {
    "main": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All",
      "typeDistFile": "./src/generated/translation-tokens.ts"
    }
  }
}
```

Commit this file. `init` writes nothing else. The translations folder is created when you add the first resource.

Two things to know:

- Without `--locales`, the global `locales` list is empty. Add locales before you bundle.
- If a config file already exists, `init` prints a note and exits without changing it.

The full field reference is in [Configuration](./configuration.md).

## 2. Add a resource

A resource is one source string with a dot-delimited key. The key decides where the files go: `common.buttons.save` is stored in `src/i18n/common/buttons/`.

```bash
npx lingo-tracker add-resource \
  --key common.buttons.save \
  --value "Save" \
  --comment "Button label on every edit form"
```

With one collection configured there is no need to pass `--collection`. The command creates two files:

`src/i18n/common/buttons/resource_entries.json`

```json
{
  "save": {
    "source": "Save",
    "comment": "Button label on every edit form",
    "fr-ca": "Save",
    "es": "Save"
  }
}
```

`src/i18n/common/buttons/tracker_meta.json`

```json
{
  "save": {
    "en": { "checksum": "c9cc8cce247e49bae79f15173ce97354" },
    "fr-ca": { "checksum": "c9cc8cce247e49bae79f15173ce97354", "baseChecksum": "c9cc8cce247e49bae79f15173ce97354", "status": "new" },
    "es": { "checksum": "c9cc8cce247e49bae79f15173ce97354", "baseChecksum": "c9cc8cce247e49bae79f15173ce97354", "status": "new" }
  }
}
```

Each target locale starts as a copy of the source with status `new`. When a translation arrives, the status becomes `translated`. When the source changes later, it becomes `stale`. [Concepts](./concepts.md) explains the lifecycle.

Add a translation now:

```bash
npx lingo-tracker edit-resource \
  --key common.buttons.save \
  --locale fr-ca \
  --locale-value "Enregistrer"
```

## 3. Generate the bundle

```bash
npx lingo-tracker bundle
```

This writes `src/assets/i18n/en.json`, `fr-ca.json` and `es.json`, plus `src/generated/translation-tokens.ts`:

```typescript
export const MAIN_TOKENS = {
  COMMON: {
    BUTTONS: {
      SAVE: 'common.buttons.save',
    },
  },
} as const;

export type MainTokens = typeof MAIN_TOKENS;
```

Configure your Transloco loader to load the generated files from `src/assets/i18n`, and use the constants in components. Add `lingo-tracker bundle` to a `prebuild` script so bundles are regenerated on every build. The [Bundling guide](./guides/bundling.md) covers multiple bundles, filtering and framework setup.

## 4. Gate releases with validate

```bash
npx lingo-tracker validate
```

The command exits with code 1 while any translation is `new`, `stale` or `translated` but not `verified`, or when a value does not compile as an ICU message for its locale. Use `--allow-translated` for a staging gate. See [Validate](./features/validate.md) and the [CI/CD guide](./guides/ci-cd.md).

## 5. Open the web UI

```bash
npx lingo-tracker-app
```

Open `http://localhost:3030`. The app reads `.lingo-tracker.json` from the directory you started it in. From the UI you can browse and edit resources, manage collections and bundles, and run exports and imports with a preview. See [Tracker UI](./tracker-ui.md).

Options:

| Setting | Flag | Environment variable | Default |
|---|---|---|---|
| Port | `--port 4000` | `LINGO_TRACKER_PORT` | `3030` |
| Bind address | `--host 0.0.0.0` | `LINGO_TRACKER_HOST` | `127.0.0.1` |
| Extra allowed host names | | `LINGO_TRACKER_ALLOWED_HOSTS` | none |

The server binds to loopback by default, so only your machine can reach it. It has no authentication. If you bind to another address, every machine that can reach the port can read and write your translation files and list folders on the server. Keep it local unless you understand that trade-off. The [API reference](./api.md#running-the-server) describes the Host and Origin checks that apply in every mode.

## Next steps

- Add more collections with `add-collection` when several apps or a shared library keep separate translations. [Concepts](./concepts.md#collections) explains when to split.
- Set up the vendor round trip: [Translation workflow](./guides/translation-workflow.md).
- Enable machine translation for new strings: [Auto-Translation](./auto-translation.md).
- Let your AI assistant do the i18n chores: [Working with an AI assistant](./guides/ai-assistant.md).
- Moving from existing JSON files: [Migration](./guides/migration.md).
