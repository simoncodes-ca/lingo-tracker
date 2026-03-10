# Transloco Code Patterns

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

## Component Setup (Templates with pipe)

```typescript
import { TranslocoPipe } from '@jsverse/transloco';
import { TOKEN_CONSTANT } from 'path/to/token-file';

@Component({
  standalone: true,
  imports: [TranslocoPipe, /* ... */],
  // ...
})
export class MyComponent {
  readonly TOKENS = TOKEN_CONSTANT;
}
```

Import `TranslocoPipe` (not `TranslocoModule`) — it's the standalone-compatible import.

## Imperative Translation (Snackbars, Dialogs, Dynamic Strings)

```typescript
import { TranslocoService } from '@jsverse/transloco';
import { TOKEN_CONSTANT } from 'path/to/token-file';

export class MyComponent {
  private readonly transloco = inject(TranslocoService);

  doSomething(): void {
    const message = this.transloco.translate(TOKEN_CONSTANT.DOMAIN.KEY);
    // With params:
    const messageWithParam = this.transloco.translate(TOKEN_CONSTANT.DOMAIN.KEY_X, { name: value });
  }
}
```

Use `TranslocoService` (not the pipe) for any string built in TypeScript — snackbars, dialog messages, error strings, dynamic labels. If only using `TranslocoService` with no pipe in the template, you don't need to import `TranslocoPipe`.
