---
name: lingo-tracker
description: Translation management for lingo-tracker. Handles i18n, internationalization, transloco, hardcoded strings detection, translation resource creation, token generation, and code updates.
---

# LingoTracker i18n Workflow

Use this skill when the user wants to:
- Detect and extract hardcoded strings for translation
- Add, edit, or delete translation resources
- Regenerate translation bundles and typed token constants
- Update Angular components to use Transloco with typed tokens

## Workflow Overview

The full i18n workflow is a 4-step process:

1. **Detect** hardcoded strings in templates and TypeScript
2. **Create resources** via CLI (`npx lingo-tracker add-resource --collection trackerResources ...`)
3. **Regenerate bundle** via CLI (`npx lingo-tracker bundle --name tracker`)
4. **Update code** to use typed token constants with Transloco pipes/service

Always use non-interactive CLI mode — pass all values as `--flags`. Never rely on interactive prompts.

## Prerequisites

Before running any `npx lingo-tracker` command, ensure the CLI is built:

```bash
pnpm run build:cli
```

The binary is defined in `package.json` (`"bin": { "lingo-tracker": "dist/apps/cli/main.js" }`), so `npx lingo-tracker` only works after building.

## Default Collection & Bundle

- **Collection**: `trackerResources` (translations in `apps/tracker/src/i18n`, locales: `en`, `es`, `fr-ca`)
- **Bundle**: `tracker` (outputs to `apps/tracker/src/assets/i18n`, tokens at `apps/tracker/src/i18n-types/tracker-resources.ts`)
- **Base locale**: `en`
- **Token constant**: `TRACKER_TOKENS` (exported from `apps/tracker/src/i18n-types/tracker-resources.ts`)

Full config is in `.lingo-tracker.json` at the repo root.

## Detecting Hardcoded Strings

### Flag these as translatable:
- HTML text content, `placeholder`, `aria-label`, `title` attributes
- Angular Material: `matTooltip`, `<mat-label>`, button text
- TypeScript: snackbar messages, dialog titles/messages, toast notifications, error messages shown to users

### Skip these (not translatable):
- CSS class names, route paths, enum values, icon names (e.g., `'add'`, `'delete'`)
- Technical identifiers, object keys, log messages, selector strings
- URLs, file paths, regex patterns

## Key Naming Conventions

Keys use **camelCase dot-delimited segments**: `domain.subdomain.entryKey`

- **Domain** = feature area: `browser`, `collections`, `common`, `theme`, `data`
- **Shared actions** go under `common.actions.*` (e.g., `back`, `cancel`, `delete`, `edit`, `save`, `ok`)
- **Suffix with `X`** for interpolated keys (e.g., `showingSearchResultsForX` for text containing `{{ query }}`)
- **Group related keys** under shared prefixes (e.g., `collections.dialog.delete.title`, `collections.dialog.delete.message`)
- **UI structure keys**: `dialog.title`, `dialog.message`, `toast.created`, `toast.error`, `emptyState.message`, `emptyState.cta`
- **Tags**: Use only 1 tag — the top-level domain from the key (e.g., key `browser.similarTranslations.title` → tag `browser`)

## CLI Commands Reference

All commands use the `npx lingo-tracker` prefix.

### Add a resource
```bash
npx lingo-tracker add-resource \
  --collection trackerResources \
  --key <dot.delimited.key> \
  --value "<base locale text>" \
  --comment "<context for translators>" \
  --tags "<single top-level domain tag>"
```

### Regenerate bundle (after adding/editing resources)
```bash
npx lingo-tracker bundle --name tracker
```
This regenerates both the JSON bundle files and the typed TypeScript token constants.

### Edit a resource
```bash
npx lingo-tracker edit-resource \
  --collection trackerResources \
  --key <dot.delimited.key> \
  --baseValue "<new text>"
```

### Delete a resource
```bash
npx lingo-tracker delete-resource \
  --collection trackerResources \
  --key <dot.delimited.key> \
  --yes
```

### Other useful commands
```bash
npx lingo-tracker normalize --collection trackerResources
npx lingo-tracker validate --collection trackerResources
```

## Template Patterns

Use the `transloco` pipe with typed token constants:

```html
<!-- Simple text -->
{{ TOKENS.DOMAIN.KEY | transloco }}

<!-- With interpolation parameters -->
{{ TOKENS.DOMAIN.KEY_X | transloco : { param: value } }}

<!-- Attribute binding -->
[attr.aria-label]="TOKENS.DOMAIN.KEY | transloco"

<!-- Placeholder -->
[placeholder]="TOKENS.DOMAIN.KEY | transloco"

<!-- Conditional -->
{{ (condition ? TOKENS.A : TOKENS.B) | transloco }}
```

## TypeScript Patterns

### Component setup

```typescript
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

@Component({
  standalone: true,
  imports: [TranslocoPipe, /* ... */],
  // ...
})
export class MyComponent {
  readonly TOKENS = TRACKER_TOKENS;
}
```

The token constant name matches what's exported from the generated `typeDist` file (e.g., `TRACKER_TOKENS`). Check the generated file to confirm.

### Imperative translation (snackbars, dialogs, dynamic strings)

```typescript
import { TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';

export class MyComponent {
  private readonly transloco = inject(TranslocoService);

  doSomething(): void {
    const message = this.transloco.translate(TRACKER_TOKENS.DOMAIN.KEY);
    // With params:
    const messageWithParam = this.transloco.translate(TRACKER_TOKENS.DOMAIN.KEY_X, { name: value });
  }
}
```

### Using TranslocoModule vs TranslocoPipe

- **Templates with `| transloco` pipe**: Import `TranslocoPipe` (preferred) or `TranslocoModule`
- **Imperative only (no pipe in template)**: Just inject `TranslocoService` — no module import needed

## Common Scenarios

### New component with translations
1. Identify all user-visible strings
2. Choose keys following naming conventions
3. Run `add-resource` for each string
4. Run `bundle` to regenerate tokens
5. Set up component with `TOKENS` and `TranslocoPipe`
6. Replace strings in template with `{{ TOKENS.X.Y | transloco }}`

### Extracting hardcoded strings from existing component
1. Read the template and TypeScript files
2. List all hardcoded user-visible strings
3. Check existing tokens — reuse `common.actions.*` where applicable
4. Run `add-resource` for new keys only
5. Run `bundle` to regenerate tokens
6. Update template and TypeScript to use tokens

### Adding interpolation parameters
1. Use `X` suffix in the key name
2. Include `{{ paramName }}` in the `--value` text (ICU format)
3. After bundle, pass params: `TOKENS.KEY_X | transloco : { paramName: value }`

## Reference Files

- `.lingo-tracker.json` — Project configuration (collections, bundles, locales)
- `apps/tracker/src/i18n-types/tracker-resources.ts` — Generated token constants example
- `apps/tracker/src/app/collections/collections-manager.ts` — TypeScript TranslocoService usage patterns
- `apps/tracker/src/app/shared/components/confirmation-dialog/confirmation-dialog.ts` — Imperative translation with params
