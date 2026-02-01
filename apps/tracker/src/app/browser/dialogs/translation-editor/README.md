# Translation Editor Dialog - Phase 1

This dialog component provides a user interface for creating and editing translation entries in the LingoTracker application.

## Files

- `translation-editor-dialog.ts` - Component implementation
- `translation-editor-dialog.html` - Template
- `translation-editor-dialog.scss` - Styles
- `translation-editor-dialog.spec.ts` - Unit tests
- `index.ts` - Barrel export

## Features Implemented (Phase 1)

### Dialog Modes
- **Create Mode**: Add new translation entries
- **Edit Mode**: Update existing translation entries

### Form Fields
1. **Translation Key**
   - Required field
   - Validation: Only alphanumeric, underscores, and hyphens
   - Pattern: `/^[a-zA-Z0-9_-]+$/`
   - Rejects dots, slashes, and special characters
   - Editable in both create and edit modes (allows renaming)

2. **Base Value**
   - Required multi-line textarea
   - Auto-resize functionality
   - Character count display
   - Placeholder: "Enter {locale} translation..."

3. **Comment**
   - Optional multi-line textarea
   - Auto-resize functionality
   - Character count display
   - Placeholder: "Add context for translators..."

### UI Elements
- Dynamic title: "Create Translation" / "Edit Translation"
- Dynamic subtitle explaining the action
- Folder path display showing translation location
- Base locale card with visual styling
- Cancel and Save/Update buttons
- Close button (X) in top-right corner

### Keyboard Shortcuts
- **Escape**: Close dialog
- **Ctrl/Cmd + Enter**: Save/Update translation

### Validation
- Key must be non-empty and match pattern
- Base value must be non-empty
- Form submission blocked while invalid
- Error messages shown for invalid fields

## Usage Example

### Create Mode

```typescript
import { MatDialog } from '@angular/material/dialog';
import {
  TranslationEditorDialog,
  TranslationEditorDialogData,
  TranslationEditorResult
} from './dialogs/translation-editor';

// In your component
private dialog = inject(MatDialog);

openCreateDialog(): void {
  const data: TranslationEditorDialogData = {
    mode: 'create',
    collectionName: 'my-app',
    folderPath: 'common.buttons',
    availableLocales: ['en', 'fr', 'de'],
    baseLocale: 'en',
  };

  const dialogRef = this.dialog.open(TranslationEditorDialog, {
    width: '700px',
    data,
  });

  dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
    if (result) {
      console.log('New translation:', result);
      // result.key, result.baseValue, result.comment, result.folderPath
    }
  });
}
```

### Edit Mode

```typescript
openEditDialog(resource: ResourceSummaryDto): void {
  const data: TranslationEditorDialogData = {
    mode: 'edit',
    resource,
    collectionName: 'my-app',
    folderPath: 'common.buttons',
    availableLocales: ['en', 'fr', 'de'],
    baseLocale: 'en',
  };

  const dialogRef = this.dialog.open(TranslationEditorDialog, {
    width: '700px',
    data,
  });

  dialogRef.afterClosed().subscribe((result: TranslationEditorResult | undefined) => {
    if (result) {
      console.log('Updated translation:', result);
    }
  });
}
```

## Dialog Data Interface

```typescript
interface TranslationEditorDialogData {
  mode: 'create' | 'edit';           // Dialog mode
  resource?: ResourceSummaryDto;      // For edit mode
  collectionName: string;             // Collection identifier
  folderPath?: string;                // Pre-selected folder (optional)
  availableLocales: string[];         // All locales in collection
  baseLocale: string;                 // Base locale identifier
}
```

## Dialog Result Interface

```typescript
interface TranslationEditorResult {
  key: string;              // Translation key
  baseValue: string;        // Base locale translation
  comment?: string;         // Optional comment (undefined if empty)
  folderPath: string;       // Folder path (empty string for root)
}
```

## Styling

The dialog uses:
- Material Design components
- Dark theme compatible colors from token system
- Responsive layout with max-width: 700px
- Auto-resizing textareas for better UX
- Character count displays
- Visual separation between sections

## Testing

Run tests with:

```bash
pnpm nx test tracker --testFile=src/app/browser/dialogs/translation-editor/translation-editor-dialog.spec.ts
```

### Test Coverage

- Component initialization
- Create mode vs Edit mode behavior
- Key validation (accepts valid, rejects invalid characters)
- Base value required validation
- Comment optional validation
- Form submission validation
- Dialog interaction (Cancel, Escape, Ctrl+Enter)
- Character count tracking
- Edit mode pre-population
- Error message display

## Future Phases

Phase 1 (Current) focuses on the base locale only. Future phases will add:

- Phase 2: Translation cards for all locales
- Phase 3: Translation status management
- Phase 4: ICU format validation
- Phase 5: Additional metadata (tags, etc.)

## Notes

- The key field is editable in both modes, allowing users to rename translations
- Empty comments are excluded from the result (returned as undefined)
- Folder path defaults to empty string ('') for root folder
- The dialog uses signals and computed values for reactive UI
- All form controls use nonNullable: true for type safety
