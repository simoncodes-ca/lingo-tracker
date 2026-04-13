---
title: Export
sidebar_position: 2
---

# Export Feature

The Export feature allows you to export translation resources from LingoTracker into standard formats (XLIFF and JSON) for integration with translation services and external systems.

## Usage

```bash
lingo-tracker export --format <format> [options]
```

### Formats

- `xliff`: XLIFF 1.2 format (standard for translation tools).
- `json`: JSON format (flexible for developer workflows).

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Export format (`xliff` or `json`). | Required (or interactive) |
| `-c, --collection <names>` | Comma-separated list of collections to export. | All collections |
| `-l, --locale <locales>` | Comma-separated list of target locales. The base locale is always excluded. | All target locales |
| `-s, --status <statuses>` | Filter by status (`new`, `translated`, `stale`, `verified`). | `new,stale` |
| `-t, --tags <tags>` | Filter by tags (comma-separated). | None |
| `-o, --output <path>` | Output directory. Defaults to `exportFolder` from config if set. | `dist/lingo-export` |
| `--filename <pattern>` | Custom filename pattern. The extension (`.xliff` or `.json`) is appended automatically if omitted. | `<locale>.xliff` or `<locale>.json` |
| `--dry-run` | Preview export without writing files. | `false` |
| `--verbose` | Show detailed progress. | `false` |

### JSON Specific Options

| Option | Description | Default |
|--------|-------------|---------|
| `--structure <type>` | `hierarchical` or `flat`. | `hierarchical` |
| `--rich` | Output rich objects with metadata instead of plain string values. | `false` |
| `--include-base` | Include base locale value. Only applies when `--rich` is set. | `false` |
| `--include-status` | Include translation status. Only applies when `--rich` is set. | `false` |
| `--include-comment` | Include comments. Only applies when `--rich` is set. | `true` |
| `--include-tags` | Include tags array. Only applies when `--rich` is set. | `false` |

### Filename Placeholders

You can use the following placeholders in `--filename`. If no file extension is included, the correct extension for the format (`.xliff` or `.json`) is appended automatically.

- `{locale}` / `{target}`: The target locale code (e.g., `es`, `fr-ca`). These are interchangeable.
- `{source}`: The base locale code (e.g., `en`).
- `{date}`: Current date (YYYY-MM-DD).

**Example:**
```bash
lingo-tracker export --format json --filename "translations-{source}-to-{target}-{date}"
# Generates: translations-en-to-es-2025-12-13.json
```

## Examples

Export all untranslated and stale strings to XLIFF for all target locales:
```bash
lingo-tracker export --format xliff
```

Export only Spanish strings with `new` or `stale` status from a specific collection:
```bash
lingo-tracker export --format xliff --locale es --collection marketing --status new,stale
```

Export all target locales to flat JSON with a custom filename:
```bash
lingo-tracker export --format json --structure flat --filename "{locale}-translations"
# Generates: es-translations.json, fr-translations.json, etc.
```

Export rich JSON including base values and comments (useful for translator context):
```bash
lingo-tracker export --format json --rich --include-base --include-comment
```

Preview an export without writing any files:
```bash
lingo-tracker export --format xliff --dry-run
```

## Export Summary

Every export generates an `export-summary.md` file in the output directory. It contains:

- **Metadata**: date, format, collections, target locales, status and tag filters applied.
- **Results**: resources exported, files created, output directory.
- **File list**: each file generated (or that would be generated in a dry run).
- **Warnings**: e.g., files that were overwritten.
- **Errors**: broken down into general errors, malformed files, resources omitted due to missing metadata, and hierarchical key conflicts (JSON only — when a key like `a.b.c` conflicts with a parent key `a.b`).

In a dry run, the summary is printed to the console instead of written to disk. Note: even in dry-run mode, the output directory is created on disk if it does not already exist.

## Interactive Mode

If you run `lingo-tracker export` without the `--format` flag **in a TTY terminal**, an interactive wizard guides you through all options. In non-interactive environments (CI, pipes), `--format` is required and omitting it is an error. All other unspecified options fall back silently to their documented defaults — pass all relevant flags explicitly in scripts rather than relying on interactive prompts.
