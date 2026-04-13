---
title: Migration
sidebar_position: 2
---

# Migration Guide

This guide provides step-by-step instructions for migrating translation resources from other translation management systems to LingoTracker.

## Table of Contents

1. [Overview](#overview)
2. [Before You Begin](#before-you-begin)
3. [Migrating from Transloco](#migrating-from-transloco)
4. [Migrating from i18next](#migrating-from-i18next)
5. [Migrating from Other Systems](#migrating-from-other-systems)
6. [Post-Migration Steps](#post-migration-steps)
7. [Troubleshooting](#troubleshooting)

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

- Translation keys and values (all locales)
- Base locale values (source language)
- Comments (if present in source format)
- Tags (if present in source format)

### What Doesn't Get Migrated

- Translation history
- Translator assignments
- Review workflows
- Custom metadata (not in standard formats)

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

LingoTracker's import feature has a dedicated `migration` strategy that:
- Creates new resources when `--create-missing` is specified
- Resolves Transloco-style key references (`{{t('key')}}`)
- Updates comments and tags when `--update-comments` / `--update-tags` are specified
- Sets all imported translations to `translated` status

> **Tip**: Always do a dry run first to preview what will be created before committing to the import:
> ```bash
> lingo-tracker import --source en.json --locale en --strategy migration \
>   --create-missing --dry-run
> ```

---

## Migrating from Transloco

Transloco is Angular's internationalization library. LingoTracker provides specialized support for Transloco migrations.

> **After completing the steps below**, follow the [Post-Migration Steps](#post-migration-steps) to normalize resources, configure bundles, and test your application.

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
lingo-tracker import \
  --source ./src/assets/i18n/en.json \
  --locale en \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags \
  --verbose
```

**Note**: Importing into the base locale is only supported with the `migration` strategy. It creates resources with the base locale value set from the JSON values.

### Step 2: Import Target Locales

Import each target locale:

```bash
# Import Spanish
lingo-tracker import \
  --source ./src/assets/i18n/es.json \
  --locale es \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags \
  --verbose

# Import French
lingo-tracker import \
  --source ./src/assets/i18n/fr.json \
  --locale fr \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags

# Import German
lingo-tracker import \
  --source ./src/assets/i18n/de.json \
  --locale de \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags
```

> **If your target locale files are missing base values**, you can add them with a transformation script before importing. See [Migrating from Other Systems > Generic JSON](#from-json-files-generic) for an example transform.

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

### Step 4: Verify Migration

Check the import summary — the exact path is printed at the end of each import command output (typically `{translationsFolder}/import-summary.md`):

```bash
# Example — adjust path to match your translationsFolder config
cat translations/import-summary.md
```

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

i18next is a popular internationalization framework for JavaScript. LingoTracker can import i18next JSON files directly.

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
lingo-tracker import \
  --source ./migration/en.json \
  --locale en \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags \
  --verbose
```

### Step 3: Import Target Locales

Import each target locale:

```bash
# Import Spanish
lingo-tracker import \
  --source ./migration/es.json \
  --locale es \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags

# Import French
lingo-tracker import \
  --source ./migration/fr.json \
  --locale fr \
  --strategy migration \
  --create-missing \
  --update-comments \
  --update-tags
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
lingo-tracker bundle
```

**Update package.json**:
```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle",
    "dev": "lingo-tracker bundle && vite"
  }
}
```

Your i18next configuration stays the same - it will load from the generated bundle files.

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

#### Step 2: Import with Migration Strategy

```bash
lingo-tracker import \
  --source ./transformed-en.json \
  --locale en \
  --strategy migration \
  --create-missing

lingo-tracker import \
  --source ./transformed-es.json \
  --locale es \
  --strategy migration \
  --create-missing
```

### From XLIFF Files

If your source system exports XLIFF files (common for CAT tools like SDL Trados, MemoQ, Smartling):

#### Step 1: Ensure XLIFF 1.2 Format

LingoTracker supports XLIFF 1.2. If you have XLIFF 2.0, convert it first:

```bash
# Using xliff-tool (install via npm)
npm install -g xliff-tool
xliff-tool convert --from xliff2 --to xliff es.xlf es-converted.xliff
```

#### Step 2: Import XLIFF Files

```bash
# Import each locale
lingo-tracker import \
  --source ./es.xliff \
  --locale es \
  --strategy migration \
  --create-missing \
  --verbose
```

XLIFF files include both source and target values, so LingoTracker automatically creates resources with proper base values.

### From PO Files (gettext)

If your source system uses PO files (gettext format):

#### Step 1: Convert PO to JSON

Use a conversion tool like `po2json`:

```bash
npm install -g po2json

# Convert PO to JSON
po2json es.po es.json --format mf
```

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
lingo-tracker import \
  --source ./es-transformed.json \
  --locale es \
  --strategy migration \
  --create-missing
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
lingo-tracker import --source ./es.json --locale es --strategy migration --create-missing
lingo-tracker import --source ./fr.json --locale fr --strategy migration --create-missing
lingo-tracker import --source ./de.json --locale de --strategy migration --create-missing
```

---

## Post-Migration Steps

### 1. Verify Import Summary

The import command prints the summary file path at the end of its output. Open it to check each locale import:

```bash
# Path depends on your translationsFolder config — check the import output
cat translations/import-summary.md
```

Look for:
- Resources imported count
- Warnings (e.g., missing base values)
- Errors (e.g., malformed keys)
- ICU auto-fixes applied

### 2. Run Normalization

Ensure all resources have entries for all configured locales:

```bash
lingo-tracker normalize --all
```

This adds missing locale entries with the base value as a placeholder.

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
lingo-tracker bundle
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
lingo-tracker bundle

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

**Cause**: A key exists as both a parent and a leaf. For example:
```json
{
  "app": "My App",
  "app": {
    "title": "App Title"
  }
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

### Duplicate Keys Warning

**Cause**: Same key appears multiple times in import file.

**Effect**: Last occurrence wins (matches JSON parsing behavior).

**Solution**: Remove duplicate keys from source file before import.

### Missing Translations After Migration

**Cause**: Not all locales were imported, or some translations were empty in source.

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

**Cause**: Using wrong strategy or missing `--create-missing`. Default `translation-service` strategy doesn't create new resources.

**Solution**: Use `--strategy migration --create-missing` for migration imports:

```bash
lingo-tracker import --source file.json --locale es --strategy migration --create-missing
```

---

## Summary

Migrating to LingoTracker involves:

1. **Prepare** source files (transform format if needed)
2. **Dry run** with `--dry-run` to preview what will be created
3. **Import** with `--strategy migration --create-missing`
4. **Normalize** to add missing locale entries
5. **Configure** bundles for your framework
6. **Test** thoroughly before removing old files

### Quick Reference

```bash
# Migration workflow (base locale first, then target locales)
lingo-tracker import --source en.json --locale en --strategy migration \
  --create-missing --update-comments --update-tags
lingo-tracker import --source es.json --locale es --strategy migration \
  --create-missing --update-comments --update-tags
lingo-tracker import --source fr.json --locale fr --strategy migration \
  --create-missing --update-comments --update-tags

# Post-migration
lingo-tracker normalize --all
lingo-tracker bundle

# Verify (path printed at end of each import command)
cat translations/import-summary.md
```

For additional help:
- [Import Feature Documentation](../features/import.md)
- [CLI Reference](../cli.md)
- [Getting Started Guide](../getting-started.md)

**Need Help?** Open an issue at [github.com/lingotracker/lingotracker/issues](https://github.com/lingotracker/lingotracker/issues)
