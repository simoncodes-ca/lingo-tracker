# UI Scaffolding Implementation Plan

**Date:** 2026-01-10
**Status:** Design Approved
**Related Spec:** [dev-tasks/13-ui-scafolding.md](../../dev-tasks/13-ui-scafolding.md)

## Overview

This plan details the phased implementation for setting up the Angular tracker application with modern patterns, Material UI, theme system, localization, and the Collections Manager feature. The implementation follows a foundation-first approach to establish stable infrastructure before building features.

## Technology Stack

- **Angular:** 20.2.0 (latest with signals, new control flow)
- **State Management:** NgRx Signal Store (@ngrx/signals)
- **UI Framework:** Angular Material 20.2.5 + CDK
- **Localization:** Transloco (@jsverse/transloco 8.0.2)
- **Fonts:** Google Fonts (Inter, IBM Plex Mono)
- **Theme:** Light/Dark/System support via CSS custom properties

## Implementation Phases

### Phase 1: Theme Foundation & Material Setup

Establish the visual foundation with Material theming and CSS custom properties.

#### 1.1 Configure Material Theme
- Create `apps/tracker/src/styles/theme.scss` with custom Material theme
- Define color palettes using Material's `define-palette()`:
  - Primary: Material Blue palette
  - Secondary: Material Light Blue (sky) palette
  - Neutral: Material Grey (zinc) palette
- Use `define-theme()` with light/dark variants
- Import and include theme in `styles.scss`

#### 1.2 CSS Custom Properties System
- Create `apps/tracker/src/styles/tokens.scss` with CSS variables
- Define tokens for: colors, spacing, typography, shadows, borders
- Separate light and dark theme variables using `[data-theme="light"]` and `[data-theme="dark"]`
- Add system theme support using `@media (prefers-color-scheme: dark)`

#### 1.3 Google Fonts Integration
- Add Google Fonts links to `apps/tracker/src/index.html`:
  - Inter: weights 400, 500, 600, 700
  - IBM Plex Mono: weights 400, 500, 600
- Configure typography in Material theme with custom font families
- Create typography utility classes in `apps/tracker/src/styles/typography.scss`

#### 1.4 Theme Service
- Create `apps/tracker/src/app/shared/services/theme.service.ts`
- Use signal for current theme: `themeMode = signal<'light' | 'dark' | 'system'>('system')`
- Implement `effectiveTheme = computed()` that resolves 'system' to actual light/dark
- Load/save preference to localStorage
- Apply theme by setting `[data-theme]` attribute on document root
- Listen to system theme changes with `matchMedia('(prefers-color-scheme: dark)')`

---

### Phase 2: Application Shell

Build the basic application layout with header and routing.

#### 2.1 App Component Layout
- Update `apps/tracker/src/app/app.html` with structure:
  - Header section (uses AppHeader component)
  - Main content area with `<router-outlet>`
  - CSS Grid layout: fixed header, scrollable content
- Update `apps/tracker/src/app/app.scss`:
  - Full viewport height layout
  - Responsive padding and spacing
  - Background color using CSS custom properties
- Remove old store references and initialization logic from `apps/tracker/src/app/app.ts`

#### 2.2 AppHeader Component
- Create `apps/tracker/src/app/header/app-header.ts`
- Layout: Logo (icon/image) + "LingoTracker" heading + spacer + theme menu button
- Use Material toolbar (`MatToolbarModule`)
- Implement as standalone component with OnPush change detection
- Inject ThemeService using `inject()` function
- Create `apps/tracker/src/app/header/app-header.html`
- Create `apps/tracker/src/app/header/app-header.scss`

#### 2.3 Theme Switcher Menu
- Add gear icon button in AppHeader (right side)
- Use Material menu (`MatMenuModule`) with three options: Light, Dark, System
- Show checkmark next to currently selected theme
- Call `themeService.setTheme()` on selection
- Add accessible labels: `aria-label="Theme settings"` on button
- Keyboard accessible: Enter/Space to open, arrows to navigate, Escape to close

#### 2.4 Routing Configuration
- Update `apps/tracker/src/app/app.routes.ts`:
  - Home route `''` → redirects to `/collections`
  - Collections route `/collections` → lazy-loaded CollectionsManager (Phase 5)
  - Browser route `/browser/:collectionName` → lazy-loaded TranslationBrowser (Phase 6)
- Configure route titles for accessibility
- Add `preloadingStrategy: PreloadAllModules` in router config (app.config.ts)

#### 2.5 Responsive Layout & Keyboard Navigation
- Add CSS breakpoints in `apps/tracker/src/styles/breakpoints.scss`
- Mobile-first responsive padding/spacing in app layout
- Ensure skip-to-main-content link for keyboard users (hidden until focused)
- Configure global focus-visible styles for keyboard navigation
- Test tab order through header and main content

---

### Phase 3: Transloco Localization

Bootstrap Transloco for internationalization support.

#### 3.1 Transloco Provider Configuration
- Update `apps/tracker/src/app/app.config.ts` to add Transloco providers
- Use `provideTransloco()` from `@jsverse/transloco`
- Configure with:
  - `config.availableLangs`: List of supported locales (start with `['en']`)
  - `config.defaultLang`: 'en'
  - `config.reRenderOnLangChange`: true
  - `config.prodMode`: Based on environment
- Register HTTP loader for loading translation files

#### 3.2 Transloco HTTP Loader
- Create `apps/tracker/src/app/shared/services/transloco-loader.ts`
- Implement `TranslocoHttpLoader` using `inject(HttpClient)`
- Load translations from `assets/i18n/{lang}.json`
- Return Observable with translation object
- Handle loading errors gracefully (fallback to empty object, log error)

#### 3.3 Translation Resources Setup
- Add `trackerResources` collection to `.lingo-tracker.json` (if not exists):
  - `translationsFolder`: `apps/tracker/src/assets/i18n`
  - `baseLocale`: `en`
  - `locales`: `['en']`
- Use LingoTracker CLI to add translation resources for Collections Manager:
  - `lingo-tracker add-resource --collection trackerResources --key collections.title --value "Collections" --comment "Page title for collections management dashboard"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.addButton --value "Add Collection" --comment "Button text to open dialog for creating a new collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.emptyState.message --value "No collections yet" --comment "Message shown when user has no collections"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.emptyState.cta --value "Create your first collection" --comment "Call-to-action button in empty state to create first collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.card.edit --value "Edit collection" --comment "Accessible label for edit icon button on collection card"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.card.delete --value "Delete collection" --comment "Accessible label for delete icon button on collection card"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.dialog.create.title --value "Create Collection" --comment "Dialog title when creating a new collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.dialog.edit.title --value "Edit Collection" --comment "Dialog title when editing an existing collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.dialog.delete.title --value "Delete Collection" --comment "Confirmation dialog title when deleting a collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.dialog.delete.message --value "Are you sure you want to delete {{name}}?" --comment "Confirmation message with collection name placeholder"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.form.name --value "Collection name" --comment "Label for collection name input field"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.form.translationsFolder --value "Translations folder" --comment "Label for translations folder path input field"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.form.locales --value "Locales" --comment "Label for locales input field"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.form.localesPlaceholder --value "Comma-separated (e.g., en,fr,es)" --comment "Placeholder text showing format for locale input"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.form.errors.required --value "This field is required" --comment "Validation error for required fields"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.toast.created --value "Collection created successfully" --comment "Success message after creating a collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.toast.updated --value "Collection updated successfully" --comment "Success message after editing a collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.toast.deleted --value "Collection deleted successfully" --comment "Success message after deleting a collection"`
  - `lingo-tracker add-resource --collection trackerResources --key collections.toast.error --value "An error occurred. Please try again." --comment "Generic error message for failed operations"`
- CLI will create proper folder structure and resource files in `assets/i18n`

#### 3.4 Transloco Directives Usage
- Import `TranslocoModule` in components that need translations
- Use `*transloco` structural directive for scoped translations
- Use `{{ 't.key' }}` for simple translations within *transloco scope
- Use `transloco` pipe for translations outside structural directive: `{{ 'key' | transloco }}`
- Use `translocoParams` for dynamic values: `{{ 'message' | transloco: {name: collectionName} }}`

#### 3.5 Transloco Service for Programmatic Access
- Inject `TranslocoService` in components needing dynamic translations
- Use `transloco.translate('key', params)` for toasts and dynamic messages
- Use `transloco.selectTranslate('key')` for observable-based translations
- Document pattern for using translations in TypeScript (e.g., confirmation dialogs)

---

### Phase 4: Shared Components

Build reusable components needed across the application.

#### 4.1 ConfirmationDialog Component Structure
- Create `apps/tracker/src/app/shared/components/confirmation-dialog/confirmation-dialog.ts`
- Standalone component with OnPush change detection
- Use Material Dialog (`MatDialogModule`)
- Inject dialog data using `MAT_DIALOG_DATA` token and `inject()` function
- Inject `MatDialogRef` for closing dialog with result
- Create component as generic/reusable with no business logic

#### 4.2 Dialog Data Interface
- Create `apps/tracker/src/app/shared/components/confirmation-dialog/confirmation-dialog-data.ts`
- Define `ConfirmationDialogData` interface:
  - `title: string` - Dialog header text
  - `message: string` - Main confirmation message
  - `confirmButtonText?: string` - Optional, defaults to "OK"
  - `cancelButtonText?: string` - Optional, defaults to "Cancel"
  - `actionType?: 'standard' | 'destructive'` - Optional, defaults to "standard"
- Export interface for use in components opening the dialog

#### 4.3 Dialog Template
- Create `apps/tracker/src/app/shared/components/confirmation-dialog/confirmation-dialog.html`
- Structure:
  - `<h2 mat-dialog-title>` - Display title from data
  - `<mat-dialog-content>` - Display message from data
  - `<mat-dialog-actions align="end">` - Action buttons
    - Cancel button (mat-button) - Closes with `false` result
    - Confirm button (mat-flat-button or mat-raised-button) - Closes with `true` result
- Apply different button color based on `actionType`:
  - `standard`: Primary color for confirm button
  - `destructive`: Warn color for confirm button

#### 4.4 Dialog Styles
- Create `apps/tracker/src/app/shared/components/confirmation-dialog/confirmation-dialog.scss`
- Style dialog content for readability (padding, line-height)
- Ensure proper spacing between title, message, and actions
- Style buttons with appropriate padding and spacing
- Add visual distinction for destructive actions (red/warn color)
- Ensure responsive sizing (min-width, max-width for dialog)

#### 4.5 Accessibility Implementation
- Set `role="alertdialog"` on dialog container
- Use `aria-labelledby` pointing to title element
- Use `aria-describedby` pointing to message element
- Implement keyboard navigation:
  - Tab cycles through Cancel → Confirm
  - Escape key closes dialog (handled by Material Dialog)
  - Enter key triggers confirm action when focused
- Add screen reader announcements for dialog opening
- Ensure focus is trapped within dialog while open
- Restore focus to trigger element after dialog closes

#### 4.6 Usage Pattern Documentation
- Document how to open dialog from other components:
  ```typescript
  private dialog = inject(MatDialog);

  openConfirmation() {
    const dialogRef = this.dialog.open(ConfirmationDialog, {
      data: {
        title: 'Delete Collection',
        message: 'Are you sure you want to delete this collection?',
        confirmButtonText: 'Delete',
        actionType: 'destructive'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        // User confirmed
      }
    });
  }
  ```
- Create example in component comments showing standard and destructive usage

---

### Phase 5: Collections Manager Feature

Implement the main collections management feature with full CRUD operations.

#### 5.1 API Endpoint - Add Edit Collection
- Create `PUT /api/collections/:collectionName` endpoint in `apps/api/src/app/collections/collections.controller.ts`
- Accept `UpdateCollectionDto` in request body (create in data-transfer lib)
- Define `UpdateCollectionDto` interface in `libs/data-transfer/src/lib/update-collection.dto.ts`:
  - `name?: string` - New collection name (for renaming)
  - `collection: LingoTrackerCollectionDto` - Updated collection config
- Implement controller method:
  - Decode URI-encoded collection name from params
  - Call core library function to update collection
  - Handle rename scenario if new name provided
  - Return success message
  - Handle errors (collection not found, name conflict, validation errors)

#### 5.2 Collections State Store (NgRx Signals)
- Create `apps/tracker/src/app/collections/store/collections.store.ts`
- Use `signalStore()` from `@ngrx/signals`
- Define state interface:
  - `collections: Record<string, LingoTrackerCollectionDto>` - Collections map from config
  - `isLoading: boolean` - Loading state for API calls
  - `error: string | null` - Error message if operation fails
- Implement state features using `withState()`, `withComputed()`, `withMethods()`
- Computed signals:
  - `collectionEntries = computed()` - Converts Record to array of `[name, config]` tuples for iteration
  - `hasCollections = computed()` - Returns true if collections map is not empty
- Methods (inject `CollectionsApiService`):
  - `loadCollections()` - Fetch config from API, update collections state
  - `createCollection(name, config)` - POST to API, reload config on success
  - `updateCollection(oldName, newName, config)` - PUT to API, reload config on success
  - `deleteCollection(name)` - DELETE to API, reload config on success
  - `setError(message)` - Set error state
  - `clearError()` - Clear error state
- Provide store at component level using `providers` array

#### 5.3 Collections API Service
- Create `apps/tracker/src/app/collections/services/collections-api.service.ts`
- Injectable service, use `inject(HttpClient)`
- Define methods:
  - `getConfig(): Observable<LingoTrackerConfigDto>` - GET `/api/config`
  - `createCollection(data: CreateCollectionDto): Observable<{message: string}>` - POST `/api/collections`
  - `updateCollection(name: string, data: UpdateCollectionDto): Observable<{message: string}>` - PUT `/api/collections/${encodeURIComponent(name)}`
  - `deleteCollection(name: string): Observable<{message: string}>` - DELETE `/api/collections/${encodeURIComponent(name)}`
- Handle HTTP errors with proper error messages
- Use RxJS operators (map, catchError) for error handling

#### 5.4 Collections Manager Component
- Create `apps/tracker/src/app/collections/collections-manager.ts`
- Standalone component with OnPush change detection
- Inject `CollectionsStore` using `inject()` function
- Inject `MatDialog` for opening create/edit/delete dialogs
- Inject `MatSnackBar` for success/error toasts
- Inject `Router` for navigation to Translation Browser
- Inject `TranslocoService` for translations
- Component logic:
  - Call `store.loadCollections()` in `ngOnInit()`
  - Handle loading, error, and empty states using computed signals
  - Open dialogs for create/edit/delete operations
  - Navigate to browser on card click
  - Show toasts for operation results

#### 5.5 Collections Manager Template
- Create `apps/tracker/src/app/collections/collections-manager.html`
- Structure:
  - Page header with title (`collections.title` translation) and "Add Collection" button
  - Loading spinner when `store.isLoading()`
  - Error message when `store.error()` is not null
  - Empty state when `!store.hasCollections()`
  - Responsive grid of collection cards when collections exist
- Empty state:
  - Icon (large, centered)
  - Message (`collections.emptyState.message`)
  - CTA button (`collections.emptyState.cta`) that opens create dialog
- Grid layout:
  - CSS Grid with responsive columns (1 on mobile, 2 on tablet, 3+ on desktop)
  - Gap between cards for spacing
  - Cards should have consistent height

#### 5.6 Collection Card Component
- Create `apps/tracker/src/app/collections/collection-card/collection-card.ts`
- Standalone component with OnPush change detection
- Inputs using `input()` function:
  - `name = input.required<string>()` - Collection name
  - `config = input.required<LingoTrackerCollectionDto>()` - Collection configuration
- Outputs using `output()` function:
  - `cardClick = output<void>()` - Emitted when card body clicked
  - `editClick = output<void>()` - Emitted when edit button clicked
  - `deleteClick = output<void>()` - Emitted when delete button clicked
- Use Material Card (`MatCardModule`)
- Template structure:
  - Card header with edit/delete icon buttons (right side)
  - Card content showing collection name (large) and translationsFolder (smaller)
  - Hover effect to indicate clickability
  - Icon buttons have accessible labels using `aria-label`

#### 5.7 Collection Card Template & Styles
- Create `apps/tracker/src/app/collections/collection-card/collection-card.html`
- Structure:
  - `<mat-card>` with click handler on content area
  - `<mat-card-header>` with action buttons (edit, delete)
  - `<mat-card-content>` with collection details
  - Edit button: mat-icon-button with edit icon
  - Delete button: mat-icon-button with delete icon
- Create `apps/tracker/src/app/collections/collection-card/collection-card.scss`
- Styles:
  - Card cursor: pointer on content area, default on buttons
  - Hover effect: elevation change, subtle background color change
  - Typography: larger font for name, smaller muted color for folder path
  - Button positioning: absolute or flex in header
  - Responsive padding and spacing

#### 5.8 Collection Form Dialog Component
- Create `apps/tracker/src/app/collections/collection-form-dialog/collection-form-dialog.ts`
- Standalone component with OnPush change detection
- Inject `MAT_DIALOG_DATA` for edit mode (contains existing collection name and config, or null for create)
- Inject `MatDialogRef` for closing with result
- Use Reactive Forms with typed FormGroup:
  ```typescript
  form = new FormGroup({
    name: new FormControl<string>('', {validators: [Validators.required], nonNullable: true}),
    translationsFolder: new FormControl<string>('', {validators: [Validators.required], nonNullable: true}),
    locales: new FormControl<string>('', {nonNullable: true})
  });
  ```
- Pre-populate form in constructor if editing (convert locales array to comma-separated string)
- On submit:
  - Validate form
  - Convert locales string to array (split by comma, trim whitespace, filter empty)
  - Build `CreateCollectionDto` or `UpdateCollectionDto`
  - Close dialog with result data
- On cancel: Close dialog with null result

#### 5.9 Collection Form Dialog Template & Styles
- Create `apps/tracker/src/app/collections/collection-form-dialog/collection-form-dialog.html`
- Structure:
  - `<h2 mat-dialog-title>` - Show create or edit title based on mode
  - `<mat-dialog-content>` - Form fields
    - Name field (mat-form-field with mat-input)
    - Translations folder field (mat-form-field with mat-input)
    - Locales field (mat-form-field with mat-input, placeholder text)
  - `<mat-dialog-actions align="end">` - Cancel and Save buttons
  - Use Transloco for all labels and placeholders
  - Show validation errors inline using mat-error
- Create `apps/tracker/src/app/collections/collection-form-dialog/collection-form-dialog.scss`
- Styles:
  - Form field full width
  - Consistent spacing between fields
  - Responsive dialog sizing

#### 5.10 Collections Manager - Dialog Integration
- In Collections Manager component, implement dialog methods:
  - `openCreateDialog()`:
    - Open `CollectionFormDialog` with no data
    - Subscribe to `afterClosed()`
    - If result, call `store.createCollection(result.name, result.collection)`
    - Show success toast or error toast based on result
  - `openEditDialog(name, config)`:
    - Open `CollectionFormDialog` with `{name, config}` data
    - Subscribe to `afterClosed()`
    - If result, call `store.updateCollection(name, result.name, result.collection)`
    - Show success toast or error toast based on result
  - `openDeleteDialog(name)`:
    - Open `ConfirmationDialog` with delete message (use Transloco with params)
    - Subscribe to `afterClosed()`
    - If confirmed, call `store.deleteCollection(name)`
    - Show success toast or error toast based on result

#### 5.11 Error Handling & Toasts
- Use `MatSnackBar` for all user feedback
- Success toasts (2-3 second duration, bottom center):
  - Collection created (`collections.toast.created`)
  - Collection updated (`collections.toast.updated`)
  - Collection deleted (`collections.toast.deleted`)
- Error toasts (3-4 second duration, bottom center, with "Close" action):
  - Network errors
  - Validation errors from API
  - Generic errors (`collections.toast.error`)
- Display errors from store state in template (above grid)
- Provide "Retry" or "Dismiss" actions for errors

#### 5.12 Keyboard Navigation & Accessibility
- Ensure all interactive elements are keyboard accessible
- Tab order: Add button → cards → edit buttons → delete buttons
- Card navigation:
  - Cards focusable with tabindex="0"
  - Enter/Space on card triggers navigation
  - Edit/Delete buttons accessible via Tab within card
- Focus management:
  - After creating collection, focus new card
  - After deleting collection, focus "Add Collection" button or first card
  - After closing dialog, restore focus to trigger button
- Screen reader support:
  - `aria-label` on icon buttons
  - `role="main"` on collections grid container
  - `aria-live="polite"` for loading/error messages
  - Announce toast messages to screen readers

#### 5.13 Routing Configuration
- Update `apps/tracker/src/app/app.routes.ts`:
  - Add route: `{path: 'collections', loadComponent: () => import('./collections/collections-manager').then(m => m.CollectionsManager)}`
  - Configure route data: `title: 'Collections'` for browser tab title
  - Ensure home redirect points to this route

---

### Phase 6: Translation Browser Placeholder

Create a placeholder component for future translation browser implementation.

#### 6.1 Translation Browser Component
- Create `apps/tracker/src/app/browser/translation-browser.ts`
- Standalone component with OnPush change detection
- Inject `ActivatedRoute` using `inject()` function to access route parameters
- Read `collectionName` from route params in `ngOnInit()` or using `toSignal()`
- Store collection name in a signal: `collectionName = signal<string>('')`
- Component serves as placeholder - minimal logic, ready for future implementation

#### 6.2 Translation Browser Template
- Create `apps/tracker/src/app/browser/translation-browser.html`
- Structure:
  - Page header showing collection name: "Translation Browser - {collectionName}"
  - Placeholder content area with message like "Translation browser coming soon"
  - Optional: Display collection name prominently
  - Optional: Back button or breadcrumb to return to collections list
- Use Transloco for any static text (can add placeholder translation keys)
- Keep template minimal and easy to replace with actual implementation

#### 6.3 Translation Browser Styles
- Create `apps/tracker/src/app/browser/translation-browser.scss`
- Basic layout styles:
  - Container padding and spacing
  - Header styling consistent with Collections Manager
  - Placeholder content centered or appropriately positioned
- Responsive layout foundation (mobile-first)
- Use CSS custom properties from theme system

#### 6.4 Routing Configuration
- Update `apps/tracker/src/app/app.routes.ts`:
  - Add route: `{path: 'browser/:collectionName', loadComponent: () => import('./browser/translation-browser').then(m => m.TranslationBrowser)}`
  - Configure route data: `title: 'Translation Browser'` for browser tab title
- Ensure route parameter `collectionName` is properly typed and decoded (handle URI encoding)

#### 6.5 Navigation from Collections Manager
- In Collections Manager component (`collections-manager.ts`):
  - Implement `navigateToBrowser(collectionName: string)` method
  - Use `router.navigate(['/browser', collectionName])`
  - URI-encode collection name if needed: `encodeURIComponent(collectionName)`
  - Call this method when collection card is clicked (via `cardClick` output)
- Test navigation works correctly with collection names containing special characters or spaces

#### 6.6 Optional Placeholder Features
- Display collection configuration details (translationsFolder, locales, etc.) from route resolver or API call
- Add "Under Construction" or similar visual indicator
- Include back navigation button with icon (Material back arrow)
- Show skeleton loading state or placeholder UI elements
- Add basic breadcrumb: Home > Collections > {collectionName}

---

## Code Organization

### Folder Structure

```
apps/tracker/src/
├── app/
│   ├── header/                           # App header component
│   │   ├── app-header.ts
│   │   ├── app-header.html
│   │   └── app-header.scss
│   ├── shared/                           # Shared utilities and components
│   │   ├── components/
│   │   │   └── confirmation-dialog/
│   │   │       ├── confirmation-dialog.ts
│   │   │       ├── confirmation-dialog.html
│   │   │       ├── confirmation-dialog.scss
│   │   │       └── confirmation-dialog-data.ts
│   │   └── services/
│   │       ├── theme.service.ts
│   │       └── transloco-loader.ts
│   ├── collections/                      # Collections feature
│   │   ├── collections-manager.ts
│   │   ├── collections-manager.html
│   │   ├── collections-manager.scss
│   │   ├── collection-card/
│   │   │   ├── collection-card.ts
│   │   │   ├── collection-card.html
│   │   │   └── collection-card.scss
│   │   ├── collection-form-dialog/
│   │   │   ├── collection-form-dialog.ts
│   │   │   ├── collection-form-dialog.html
│   │   │   └── collection-form-dialog.scss
│   │   ├── store/
│   │   │   └── collections.store.ts
│   │   └── services/
│   │       └── collections-api.service.ts
│   ├── browser/                          # Translation browser (placeholder)
│   │   ├── translation-browser.ts
│   │   ├── translation-browser.html
│   │   └── translation-browser.scss
│   ├── app.ts
│   ├── app.html
│   ├── app.scss
│   ├── app.config.ts
│   └── app.routes.ts
├── assets/
│   └── i18n/                             # Translation files (generated by CLI)
└── styles/
    ├── theme.scss                        # Material theme configuration
    ├── tokens.scss                       # CSS custom properties
    ├── typography.scss                   # Typography utilities
    ├── breakpoints.scss                  # Responsive breakpoints
    └── styles.scss                       # Global styles entry point
```

---

## Key Patterns & Standards

### Component Architecture
- All components are standalone (no NgModule)
- Use OnPush change detection strategy
- Use `inject()` function instead of constructor injection
- Use signals (`signal()`, `computed()`, `effect()`) for reactive state
- Use `input()` and `output()` functions for component I/O

### State Management
- NgRx Signal Store for feature-level state
- Signals for component-level state
- Avoid BehaviorSubject/Observable patterns in components

### Forms
- Reactive Forms with strict typing
- FormGroup and FormControl with explicit types
- Material form fields for consistent UI

### Styling
- CSS custom properties for theming
- Mobile-first responsive design
- Material Design elevation and spacing
- SCSS for component styles

### Accessibility
- Keyboard navigation for all interactive elements
- ARIA labels and roles
- Focus management in dialogs
- Screen reader announcements
- High contrast support through theme system

---

## Testing Strategy

### Unit Tests
- Test components with `@ngneat/spectator`
- Test state stores independently
- Test services with HttpClientTestingModule
- Test form validation logic

### Integration Tests
- Test dialog workflows end-to-end
- Test routing and navigation
- Test API service integration with stores

### Accessibility Tests
- Keyboard navigation verification
- Screen reader testing
- Focus management verification
- ARIA attributes validation

---

## Definition of Done

Each phase is complete when:
1. All components/services created as specified
2. Unit tests written and passing
3. Accessibility requirements met (keyboard nav, ARIA, focus)
4. Responsive design working on mobile/tablet/desktop
5. Theme system working (light/dark/system)
6. No console errors or warnings
7. Code follows Angular style guide and project standards
8. Translations integrated where applicable

---

## Next Steps After Phase 6

Once the scaffolding is complete:
1. Design Translation Browser feature specification
2. Plan resource tree navigation and editing
3. Implement resource CRUD operations
4. Add metadata management (status, tags, comments)
5. Integrate with existing API endpoints for resources
