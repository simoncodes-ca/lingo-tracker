---
title: Migration
sidebar_position: 2
---

# Migration Guide

This guide moves existing translation files into LingoTracker with the `migration` import strategy, then switches your application to the generated bundles. It covers Transloco JSON, i18next JSON and XLIFF 1.2 directly, and gettext and CSV through a short conversion step. If your app uses plain Transloco without `transloco-messageformat`, set `"runtime": "transloco"` before the first import; [Step 0](#step-0-set-the-app-runtime) explains how. [Limitations](#limitations) lists what each source format keeps and loses.

## Table of Contents

1. [Overview](#overview)
2. [Before You Begin](#before-you-begin)
3. [Limitations](#limitations)
4. [Migrating from Transloco](#migrating-from-transloco)
5. [Migrating from i18next](#migrating-from-i18next)
6. [Migrating from Other Systems](#migrating-from-other-systems)
7. [Post-Migration Steps](#post-migration-steps)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Migration?

Migration is the process of importing existing translation resources from another system into LingoTracker. The import feature supports two migration workflows:

1. **Direct Migration**: Import translations directly using the `migration` strategy
2. **Two-Step Migration**: Export from source system, transform format, then import

### Supported Source Formats

- **JSON**: Flat or hierarchical structures (Transloco, i18next, etc.)
- **XLIFF**: Industry standard format from CAT tools
- **Custom Formats**: Transform to JSON or XLIFF first

### What Gets Migrated

- Translation keys and string values, for every locale you import
- Base locale values (source language)
- Comments (if present in source format)
- Tags (if present in source format)

### What Doesn't Get Migrated

- Translation history
- Translator assignments
- Review workflows
- Custom metadata (not in standard formats)
- Arrays, numbers, booleans and `null`. They are skipped and listed in the summary.
- Empty strings. They are skipped.
- Keys with characters other than letters, digits, `_` and `-` in a segment. They fail. See [Limitations](#limitations).

---

## Before You Begin

### 1. Initialize LingoTracker

Create a new LingoTracker project or ensure you have one initialized:

```bash
lingo-tracker init
```

Configure `.lingo-tracker.json` with your base locale and target locales:

```json
{
  "baseLocale": "en",
  "locales": ["en", "es", "fr", "de"],
  "collections": {
    "Main": {
      "translationsFolder": "translations"
    }
  }
}
```

### 2. Backup Source Data

Always create a backup of your original translation files before migration:

```bash
# Copy your translation files to a backup location
cp -r ./src/i18n ./src/i18n.backup
```

If something goes wrong, restore with:

```bash
cp -r ./src/i18n.backup ./src/i18n
```

### 3. Choose Migration Strategy

The import command's `migration` strategy is built for this. With it, import:

- creates resources that do not exist yet (`--create-missing` is on by default)
- is the only strategy allowed to write the base locale
- resolves Transloco key references by inlining the referenced text. Both `{{t('other.key')}}` and a bare `{{other.key}}` count as a reference when a key with that name exists in the file. A `{{name}}` that matches no key stays an interpolation placeholder and is listed once under "Unresolved parameters".
- updates comments and tags from the file (`--update-comments` and `--update-tags` are on by default)
- stores imported values as `translated`, or with the file's own status when you pass `--preserve-status` with rich JSON

Always dry-run first. The preview uses "Would" language and writes nothing:

```bash
lingo-tracker import --source en.json --locale en --strategy migration --dry-run
```

---

## Limitations

LingoTracker's migration path was tested against six open-source Transloco and i18next projects. These are the limits that showed up. Check them against your files before you import.

**Runtime.** Set `runtime` before the first import. Your app uses messageformat when `@jsverse/transloco-messageformat` is in `package.json`; `init` detects this. The default, `transloco-messageformat`, treats a single brace as ICU. With `"runtime": "transloco"`, literal `{`, `}` and `'` in your files survive import and bundle unchanged. The setting is global, not per bundle.

**Keys.** Each dot-separated segment may contain only letters, digits, `_` and `-`. A dot always starts a new level. Keys with spaces, `+`, `|`, `:` or other characters fail, are listed in the summary, and make the import exit 1. Natural-language keys (`"Save changes": "Save changes"`) cannot be imported. Rename the keys in your files first.

**Values.** Only strings are imported. Arrays, numbers, booleans and `null` are skipped and listed in one warning. An empty string is skipped. When the base value is empty, the key is never created, so its target values fail too.

**i18next.** Plain `{{name}}` and suffix plurals (`_one`, `_other`) work and come back out as written. Formatters (`{{amount, currency}}`), nesting (`$t(...)`) and `keySeparator: false` do not. Context keys were not tested. The import summary names every value that will not survive the round trip.

**Transloco scopes.** A scope file such as `admin-page/en.json` has its keys at the root. Import it into its own collection, then bundle that collection with `bundleName` `admin-page/{locale}`. Importing it into the main collection merges its keys with the root file, and a bundle cannot strip a prefix afterwards.

**References.** `{{t('key')}}` and a bare `{{key}}` that names an existing key are replaced by that key's text. The reference is gone from the stored value. A later change to the referenced key does not update the copies. This is the text Transloco would have rendered, so the app looks the same.

**Untranslated keys.** `normalize` fills every missing target value with a copy of the source, status `new`. Target bundles therefore contain the source language for those keys, and `validate` fails until they are translated.

---

## Migrating from Transloco

Transloco is Angular's internationalization library. LingoTracker resolves Transloco key references on import and writes bundles in Transloco syntax. Which syntax depends on the `runtime` setting, so do Step 0 first.

> **After completing the steps below**, follow the [Post-Migration Steps](#post-migration-steps) to normalize resources, configure bundles, and test your application.

### Step 0: Set the app runtime

If your app uses plain `@jsverse/transloco` without `@jsverse/transloco-messageformat`, set `"runtime": "transloco"` in `.lingo-tracker.json` before the first import (`init` detects it from `package.json`, reading `dependencies` and `devDependencies` only, not `peerDependencies`, so a library repo should pass `--runtime`). Without it, a literal `{first}` in your files is stored as an ICU argument and bundles as `{{ first }}`, which renders empty. With it, import stores literal `{`, `}` and `'` as quoted ICU text and bundle unquotes them.

Only `--strategy migration` reads app syntax. Other strategies read files LingoTracker exported, which already hold stored ICU. Re-importing an exported file with `--strategy migration` quotes its literals a second time, so the apostrophes in `'{'first'}'` are doubled and the text no longer reads as `{first}`.

### Source Format

Transloco typically uses one JSON file per locale:

```
src/assets/i18n/
├── en.json
├── es.json
├── fr.json
└── de.json
```

**Example `en.json` (hierarchical)**:
```json
{
  "common": {
    "buttons": {
      "ok": "OK",
      "cancel": "Cancel"
    }
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome back"
  }
}
```

### Step 1: Import Base Locale

Import the base locale first to create the resource structure. If you have multiple collections, add `--collection <name>`:

```bash
lingo-tracker import --source ./src/assets/i18n/en.json --locale en --strategy migration --verbose
```

Importing into the base locale is only possible with the `migration` strategy. Each string value with a valid key becomes a resource's source text. Skipped values and failed keys are listed in the summary, and the command exits 1 when any key failed, even though the valid keys were written. Read the summary before you import the target locales. Target locales are not filled in at this point; the next steps import them, and `normalize` later seeds any locale that still has no value.

### Step 2: Import Target Locales

Import each target locale:

```bash
lingo-tracker import --source ./src/assets/i18n/es.json --locale es --strategy migration
lingo-tracker import --source ./src/assets/i18n/fr.json --locale fr --strategy migration
lingo-tracker import --source ./src/assets/i18n/de.json --locale de --strategy migration
```

Because the base locale went in first, plain string values are enough here. A target-locale file can only create a resource the base import did not create when it carries a `baseValue`, as in the rich JSON format shown under [Generic JSON](#from-json-files-generic). A key that exists only in a target file and has no base value fails to import, is listed in the summary, and makes the command exit 1.

### Step 3: Handle Transloco References

If your Transloco files use references like `{{t('other.key')}}`, LingoTracker automatically resolves them during migration:

**Before (with references)**:
```json
{
  "greeting": "Hello",
  "welcome": "{{t('greeting')}}, welcome back!"
}
```

**After (resolved)**:
```json
{
  "greeting": "Hello",
  "welcome": "Hello, welcome back!"
}
```

This happens automatically with the `migration` strategy.

A bare `{{greeting}}` is inlined the same way when `greeting` is a key in the file. This matches what Transloco renders when no parameter named `greeting` is passed. If your app does pass a parameter with the same name as a key, the inlined text replaces it. In a large app this can touch hundreds of values, and the summary's detailed changes list only the first 20. To see them all, run `bundle` after the base import and diff the output against your source file: every inlined value appears as a change.

### Step 4: Verify Migration

Each import prints the path of its Markdown summary, which is written to the operating system's temp directory as `lingo-tracker-import-summary-<timestamp>.md`. Runs in a loop each get their own file: a name that is already taken gets a `-1`, `-2` suffix. Open it to check counts, warnings and any keys that were skipped or failed.

Verify a few resources were created correctly:

```bash
cat translations/common/buttons/resource_entries.json
```

### Step 5: Update Transloco Configuration

After migration, update your Transloco loader to use LingoTracker bundles:

**Before**:
```typescript
loader: TranslocoHttpLoader  // Loads from src/assets/i18n
```

**After**:
```typescript
// 1. Add bundle configuration to .lingo-tracker.json
{
  "bundles": {
    "transloco": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All"
    }
  }
}

// 2. Generate bundles
// Add to package.json:
{
  "scripts": {
    "prebuild": "lingo-tracker bundle"
  }
}

// 3. Transloco config stays the same
// Bundle files replace old i18n files
```

---

## Migrating from i18next

i18next is a popular internationalization framework for JavaScript. LingoTracker imports i18next JSON when the files use plain `{{name}}` interpolation and suffix plurals (`key_one`, `key_other`). The plural keys are stored as separate keys, not as ICU plurals, and come back out unchanged.

Two i18next features do not survive the round trip. Import lists each affected key under Warnings as "value will not survive the round trip", and `bundle --verbose` lists them again:

- formatters such as `{{amount, currency}}`. The bundle keeps the formatter but writes the other placeholders in the same value as `{title}`;
- nesting such as `$t(key, {"count": {{days}} })`. The bundle writes `{days}` inside the options.

Natural-language keys (`keySeparator: false`) cannot be imported either, and these are not flagged as round-trip warnings: a key with a space fails, and a key with a dot nests without a warning. Context keys (`key_male`) were not tested. Rename or rewrite the affected keys first, or keep those namespaces out of LingoTracker for now.

> **After completing the steps below**, follow the [Post-Migration Steps](#post-migration-steps) to normalize resources, configure bundles, and test your application.

### Source Format

i18next typically organizes translations by namespace:

```
public/locales/
├── en/
│   ├── common.json
│   ├── dashboard.json
│   └── translation.json
├── es/
│   ├── common.json
│   ├── dashboard.json
│   └── translation.json
└── fr/
    ├── common.json
    ├── dashboard.json
    └── translation.json
```

**Example `en/common.json`**:
```json
{
  "buttons": {
    "ok": "OK",
    "cancel": "Cancel"
  },
  "errors": {
    "required": "This field is required",
    "invalid": "Invalid input"
  }
}
```

### Step 1: Combine Namespaces

i18next uses separate files per namespace. LingoTracker works with a single file per locale, so combine namespaces:

```bash
# Create migration directory
mkdir -p migration

# Combine English namespaces
node -e "
const fs = require('fs');
const common = JSON.parse(fs.readFileSync('./public/locales/en/common.json', 'utf8'));
const dashboard = JSON.parse(fs.readFileSync('./public/locales/en/dashboard.json', 'utf8'));
const translation = JSON.parse(fs.readFileSync('./public/locales/en/translation.json', 'utf8'));

const combined = {
  common,
  dashboard,
  translation
};

fs.writeFileSync('./migration/en.json', JSON.stringify(combined, null, 2));
console.log('Created migration/en.json');
"
```

Or create a more robust script:

```javascript
// combine-namespaces.js
const fs = require('fs');
const path = require('path');

const localesDir = './public/locales';
const outputDir = './migration';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const locales = fs.readdirSync(localesDir);

for (const locale of locales) {
  const localePath = path.join(localesDir, locale);

  if (!fs.statSync(localePath).isDirectory()) continue;

  const combined = {};
  const namespaces = fs.readdirSync(localePath);

  for (const namespace of namespaces) {
    if (!namespace.endsWith('.json')) continue;

    const namespaceName = namespace.replace('.json', '');
    const content = JSON.parse(fs.readFileSync(path.join(localePath, namespace), 'utf8'));

    combined[namespaceName] = content;
  }

  fs.writeFileSync(
    path.join(outputDir, `${locale}.json`),
    JSON.stringify(combined, null, 2)
  );

  console.log(`Created migration/${locale}.json`);
}
```

Run the script:
```bash
node combine-namespaces.js
```

### Step 2: Import Base Locale

Import the base locale (usually English). If you have multiple collections, add `--collection <name>`:

```bash
lingo-tracker import --source ./migration/en.json --locale en --strategy migration --verbose
```

### Step 3: Import Target Locales

```bash
lingo-tracker import --source ./migration/es.json --locale es --strategy migration
lingo-tracker import --source ./migration/fr.json --locale fr --strategy migration
```

### Step 4: Update i18next Configuration

After migration, update your i18next configuration to use LingoTracker bundles:

**Add bundle configuration** (`.lingo-tracker.json`):
```json
{
  "bundles": {
    "i18next": {
      "bundleName": "{locale}/translation",
      "dist": "./public/locales",
      "collections": "All"
    }
  }
}
```

**Generate bundles**:
```bash
lingo-tracker bundle --verbose
```

Without `--verbose`, `bundle` prints only the number of warnings. The verbose list names each key whose value may render wrong, such as one that is not valid ICU.

**Update package.json**:
```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle",
    "dev": "lingo-tracker bundle && vite"
  }
}
```

This bundle writes the whole combined tree, with `common`, `dashboard` and `translation` as top-level keys, into one `translation.json` per locale. It does not recreate the separate namespace files. A bundle keeps the full key, so a bundle with `matchingPattern` `common.*` still nests its keys under `common`. To get one file per namespace with the keys at the root, give each namespace its own collection: import `en/common.json` into collection `common` without combining, then define one bundle per collection with `bundleName` `{locale}/common`. Otherwise update your i18next setup to load one namespace from the combined file.

---

## Migrating from Other Systems

### From JSON Files (Generic)

If your system uses JSON files in a custom format:

#### Step 1: Transform to LingoTracker Format

Create a transformation script to convert your format to LingoTracker's expected structure:

**Flat structure with simple values**:
```json
{
  "app.title": "My App",
  "app.welcome": "Welcome",
  "buttons.ok": "OK"
}
```

**Hierarchical with rich objects** (recommended for migration):
```json
{
  "app": {
    "title": {
      "value": "My App",
      "baseValue": "My App",
      "comment": "Application title"
    },
    "welcome": {
      "value": "Welcome",
      "baseValue": "Welcome"
    }
  },
  "buttons": {
    "ok": {
      "value": "OK",
      "baseValue": "OK"
    }
  }
}
```

An object is rich only when `value` is a string and all its keys are `value`, `baseValue`, `comment`, `status` or `tags`. Any other object is a namespace in a hierarchical file and is skipped in a flat file. When an object has only these keys but one of them has the wrong type (for example, an unknown `status`), a hierarchical file imports it as nested keys and shows a warning. Arrays, numbers, booleans and `null` are skipped, listed in one warning, and counted as skipped in the summary.

#### Step 2: Import with Migration Strategy

```bash
lingo-tracker import --source ./transformed-en.json --locale en --strategy migration
lingo-tracker import --source ./transformed-es.json --locale es --strategy migration
```

### From XLIFF Files

If your source system exports XLIFF files (common for CAT tools like SDL Trados, MemoQ, Smartling):

#### Step 1: Ensure XLIFF 1.2 Format

LingoTracker reads XLIFF 1.2 only. Most CAT tools can export 1.2 directly; if you only have XLIFF 2.0, export again in 1.2 or convert with your tool of choice. The `<trans-unit id>` must be the dot-delimited key.

#### Step 2: Import XLIFF Files

```bash
lingo-tracker import --source ./es.xliff --locale es --strategy migration --verbose
```

XLIFF units carry both `<source>` and `<target>`, so resources are created with their base value even when the base locale was never imported separately. Units with an empty `<target>` are skipped.

### From PO Files (gettext)

If your source system uses PO files (gettext format):

#### Step 1: Convert PO to JSON

Convert each PO file to a flat JSON object of `msgid` to `msgstr` with the gettext tooling you already use, for example `po2json` from npm or a few lines of Python with `polib`. The transform below expects that shape.

#### Step 2: Transform to LingoTracker Format

```javascript
// transform-po-json.js
const fs = require('fs');

const poJson = JSON.parse(fs.readFileSync('./es.json', 'utf8'));
const baseJson = JSON.parse(fs.readFileSync('./en.json', 'utf8'));

const transformed = {};

for (const [key, value] of Object.entries(poJson)) {
  // Skip metadata entries
  if (key === '') continue;

  // Create rich format with base value
  const dotKey = key.replace(/\//g, '.'); // Convert slashes to dots

  transformed[dotKey] = {
    value: value,
    baseValue: baseJson[key] || value
  };
}

fs.writeFileSync('./es-transformed.json', JSON.stringify(transformed, null, 2));
```

#### Step 3: Import

```bash
lingo-tracker import --source ./es-transformed.json --locale es --strategy migration
```

### From CSV Files

If you have translations in CSV format:

#### Step 1: Convert CSV to JSON

```javascript
// csv-to-json.js
const fs = require('fs');
const csv = require('csv-parser');

const locales = ['es', 'fr', 'de'];
const results = {};

locales.forEach(locale => results[locale] = {});

fs.createReadStream('./translations.csv')
  .pipe(csv())
  .on('data', (row) => {
    const key = row.key;
    const baseValue = row.en;

    locales.forEach(locale => {
      if (row[locale]) {
        results[locale][key] = {
          value: row[locale],
          baseValue: baseValue
        };
      }
    });
  })
  .on('end', () => {
    locales.forEach(locale => {
      fs.writeFileSync(
        `./${locale}.json`,
        JSON.stringify(results[locale], null, 2)
      );
      console.log(`Created ${locale}.json`);
    });
  });
```

**Expected CSV format**:
```csv
key,en,es,fr,de
app.title,My App,Mi Aplicación,Mon Application,Meine App
buttons.ok,OK,Aceptar,OK,OK
```

#### Step 2: Import

```bash
lingo-tracker import --source ./es.json --locale es --strategy migration
lingo-tracker import --source ./fr.json --locale fr --strategy migration
lingo-tracker import --source ./de.json --locale de --strategy migration
```

---

## Post-Migration Steps

### 1. Verify Import Summary

Each import prints the path of its summary file in the temp directory. Open it to check each locale import:

Look for:
- Resources imported count
- Warnings (e.g., missing base values)
- Errors (e.g., malformed keys)
- ICU auto-fixes applied
- "value will not survive the round trip" warnings. Each names a key whose bundle output differs from the source.
- "Unresolved parameters kept as placeholders". Confirm these are real interpolation parameters, not typos of keys.

### 2. Run Normalization

Ensure all resources have entries for all configured locales, normalized tags and consistent checksums:

```bash
lingo-tracker normalize --all
```

This adds a `new` copy of the source for every target locale that has no value, and brings tags imported from rich JSON into the normalized form. Those copies ship in the bundle in the source language, so the app shows the source text where it used to fall back to the default language. On screen the result is the same. `validate` fails on these `new` entries until they are translated, which makes its failure list your translation backlog. See the [Normalize guide](./normalize.md).

### 3. Review Missing Translations

Export resources with `new` or `stale` status to identify missing translations:

```bash
lingo-tracker export --format json --status new,stale --output ./review
```

If you have multiple collections, add `--collection <name>` to target a specific one.

### 4. Configure Bundles

Set up bundle generation for your framework:

```json
{
  "bundles": {
    "app": {
      "bundleName": "{locale}",
      "dist": "./src/assets/i18n",
      "collections": "All"
    }
  }
}
```

Generate bundles:
```bash
lingo-tracker bundle --verbose
```

### 5. Update Build Scripts

Add bundle generation to your build pipeline:

```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle",
    "build": "ng build",
    "dev": "lingo-tracker bundle && ng serve"
  }
}
```

### 6. Test Application

1. Start your application
2. Verify translations load correctly
3. Test language switching
4. Check for console errors
5. Verify ICU message format placeholders work

### 7. Remove Old Translation Files

Once migration is verified:

```bash
# Backup old files first
mv ./src/assets/i18n ./src/assets/i18n.old

# Generate fresh bundles
lingo-tracker bundle --verbose

# Test application thoroughly
# If everything works, remove backup
rm -rf ./src/assets/i18n.old
```

### 8. Update Version Control

Add LingoTracker files to version control:

```bash
# Add translations
git add translations/

# Add configuration
git add .lingo-tracker.json

# Optionally gitignore generated bundles
echo "src/assets/i18n/*.json" >> .gitignore

# Commit
git commit -m "feat: migrate to LingoTracker"
```

---

## Troubleshooting

### Import Fails: "Cannot create resource: base value not provided"

**Cause**: JSON file doesn't include base values for new resources.

**Solution**: Use rich JSON format with `baseValue` field:

```json
{
  "app.title": {
    "value": "My App",
    "baseValue": "My App"
  }
}
```

Or import base locale first, then import target locales.

### Import Warning: "Base value mismatch"

**Cause**: The `baseValue` in your import file differs from the existing base locale value in LingoTracker.

**Effect**: LingoTracker preserves the existing base value and warns you.

**Solution**: This is expected during migration. Review warnings to ensure base values are correct. If needed, update base values manually after migration.

### Keys Not Created: Hierarchical conflict

**Cause**: A key exists as both a parent and a leaf. For example, in a flat file:
```json
{
  "app": "My App",
  "app.title": "App Title"
}
```

**Solution**: Restructure keys to avoid conflicts:
```json
{
  "app": {
    "root": "My App",
    "title": "App Title"
  }
}
```

### ICU Placeholders Not Working

**Cause**: Translators modified placeholder names during translation.

**Effect**: LingoTracker's ICU auto-fixer corrects common placeholder errors automatically.

**Check**: Review import summary's "ICU Auto-Fixes" section to see what was corrected.

**Manual Fix**: If auto-fix failed, edit the translation manually:

```bash
# Find the resource
cat translations/path/to/resource/resource_entries.json

# Edit the translation to fix placeholders
```

### Literal Braces Render Empty

**Cause**: The app uses plain Transloco, and `runtime` was not set to `transloco` before the import. A literal `{first}` was stored as an ICU argument and bundled as `{{ first }}`.

**Solution**: Delete the imported translations folder, set `"runtime": "transloco"` in `.lingo-tracker.json`, and import again from your original files. Re-importing an exported file does not repair it; see [Step 0](#step-0-set-the-app-runtime).

### Duplicate Keys Warning

**Cause**: Same key appears multiple times in import file.

**Effect**: Last occurrence wins (matches JSON parsing behavior).

**Solution**: Remove duplicate keys from source file before import.

### Missing Translations After Migration

**Cause**: Not all locales were imported, or some keys were rejected: the key format was invalid, the value was not a string, or the base value was empty. Check the Failed and Skipped lists in each summary.

**Solution**:
1. Run normalization: `lingo-tracker normalize --all`
2. Export missing translations: `lingo-tracker export --status new --format xliff`
3. Send to translators or translate manually
4. Import completed translations

### Application Loads Old Translations

**Cause**: Browser cache or build cache serving old bundle files.

**Solution**:
1. Clear browser cache (hard refresh: Cmd+Shift+R or Ctrl+Shift+R)
2. Clear build cache: `rm -rf dist/ .angular/cache/`
3. Rebuild: `npm run build`
4. Verify bundle files in `dist/` are up-to-date

### Import Summary Shows Skipped Resources

**Cause**: The default `translation-service` strategy does not create resources, and a target-locale file cannot create a resource without a base value.

**Solution**: Use `--strategy migration`, and import the base locale first or supply `baseValue` in rich JSON:

```bash
lingo-tracker import --source file.json --locale es --strategy migration
```

---

## Quick Reference

```bash
# Migration workflow (base locale first, then target locales)
lingo-tracker import --source en.json --locale en --strategy migration --dry-run
lingo-tracker import --source en.json --locale en --strategy migration
lingo-tracker import --source es.json --locale es --strategy migration
lingo-tracker import --source fr.json --locale fr --strategy migration

# Post-migration
lingo-tracker normalize --all
lingo-tracker bundle --verbose
lingo-tracker validate --allow-translated
# exits 1 while any key is untranslated in any locale; the failure list is your translation backlog
```

For additional help:
- [Import](../features/import.md)
- [CLI Reference](../cli.md)
- [Getting Started](../getting-started.md)

**Need help?** Open an issue at [github.com/simoncodes-ca/lingo-tracker/issues](https://github.com/simoncodes-ca/lingo-tracker/issues).
