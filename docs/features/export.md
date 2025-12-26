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
| `-l, --locale <locales>` | Comma-separated list of target locales. | All target locales |
| `-s, --status <statuses>` | Filter by status (`new`, `translated`, `stale`, `verified`). | `new,stale` |
| `-t, --tags <tags>` | Filter by tags (comma-separated). | None |
| `-o, --output <path>` | Output directory. | `dist/lingo-export` |
| `--filename <pattern>` | Custom filename pattern. | `{target}.xliff` or `{locale}.json` |
| `--dry-run` | Preview export without writing files. | `false` |
| `--verbose` | Show detailed progress. | `false` |

### JSON Specific Options

| Option | Description | Default |
|--------|-------------|---------|
| `--structure <type>` | `hierarchical` or `flat`. | `hierarchical` |
| `--rich` | Output rich objects with metadata. | `false` |
| `--include-base` | Include base locale value. | `false` |
| `--include-status` | Include status in rich objects. | `false` |
| `--include-comment` | Include comments in rich objects. | `true` |
| `--include-tags` | Include tags in rich objects. | `false` |

### Filename Placeholders

You can use the following placeholders in `--filename`:

- `{locale}`: The target locale code (e.g., `es`, `fr-ca`).
- `{target}`: Alias for `{locale}`.
- `{source}`: The base locale code (e.g., `en`).
- `{date}`: Current date (YYYY-MM-DD).

**Example:**
```bash
lingo-tracker export --format json --filename "translations-{source}-to-{target}-{date}"
# Generates: translations-en-to-es-2025-12-13.json
```

## Export Summary

Every export generates an `export-summary.md` file in the output directory containing:
- Export statistics (resources count, files created).
- List of warnings (e.g., overwritten files).
- List of errors (e.g., malformed files, missing metadata).

## Interactive Mode

If you run `lingo-tracker export` without the `--format` flag in a terminal, it will launch an interactive wizard to guide you through the options.
