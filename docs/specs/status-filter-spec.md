# Status Filter Feature Specification

## Overview

This specification defines the implementation of a status filter for the translation browser in LingoTracker. Users need the ability to filter translations by their translation status (new, stale, translated, verified) to focus on specific work items. For example, translators often want to see only "new" and "stale" translations that need attention, or to verify translations in the "translated" state.

The status filter will complement the existing locale filter, allowing users to combine both filters to narrow down the displayed translations based on both locale and status criteria. The filter will persist user preferences per collection, providing a consistent experience when switching between collections or browser sessions.

This feature improves workflow efficiency by reducing visual noise and helping users prioritize translation work based on status.

## Technical Context

### Architecture Integration

The status filter integrates into LingoTracker's Angular-based translation browser:

- **Store Integration**: Extends `BrowserStore` (`apps/tracker/src/app/browser/store/browser.store.ts`) with status filter state and computed signals
- **Component Structure**: New standalone component follows the pattern established by `LocaleFilter` component
- **State Persistence**: Leverages existing `ViewPreferences` localStorage pattern to save filter state per collection
- **Filtering Logic**: Hooks into existing `sortedTranslations` computed signal to apply status filtering before display

### Affected Systems

1. **Browser Store** (`apps/tracker/src/app/browser/store/browser.store.ts`)
   - Add `selectedStatuses` array to state
   - Extend `ViewPreferences` interface to include `selectedStatuses`
   - Add methods: `setSelectedStatuses()`, `toggleStatus()`, `selectAllStatuses()`, `clearAllStatuses()`
   - Modify `sortedTranslations` computed to filter by status

2. **Translation Main Header** (`apps/tracker/src/app/browser/translations/header/translation-main-header.html`)
   - Add status filter component between locale filter and sort button

3. **New Component**: Status Filter (`apps/tracker/src/app/browser/sidebar/status-filter/`)
   - Standalone Angular component
   - Multi-select checkboxes for each status
   - "Needs Work" preset (new + stale)
   - Visual status indicators with colored dots

### Dependencies

- **DTOs**: Uses existing `TranslationStatus` type from `@simoncodes-ca/data-transfer`
- **Styling**: Leverages CSS custom properties from `apps/tracker/src/styles/tokens.scss`
- **Material**: Mat-button, mat-menu, mat-checkbox, mat-icon modules
- **Store**: NgRx Signals Store for state management

### Status Colors and Configuration

Based on existing codebase patterns in `translation-rollup.ts`:

- **new**: Orange/warning (`#f97316`, `--color-warning`)
- **stale**: Yellow/warning (`#eab308`, `--color-warning`)
- **translated**: Blue/info (`#3b82f6`, `--color-info`)
- **verified**: Green/success (`#10b981`, `--color-success`)

### Multi-Locale Matching Logic

When filtering by status, the filter uses OR logic across selected locales:
- If `selectedLocales` is empty or contains all locales: check status across all non-base locales
- If `selectedLocales` has specific locales: check status only for those locales
- Show resource if ANY of the checked locales has a status matching ANY selected status filter
- This ensures users see relevant resources when combining locale and status filters

## Phased Implementation Approach

### Phase 1: Store Extensions and State Management

Extend the browser store with status filter state and persistence logic.

**Tasks:**
- [ ] Add `selectedStatuses: TranslationStatus[]` to `BrowserState` interface (default: empty array)
- [ ] Add `selectedStatuses: TranslationStatus[]` to `ViewPreferences` interface
- [ ] Update `initialState` to include `selectedStatuses: []`
- [ ] Implement `setSelectedStatuses(statuses: TranslationStatus[]): void` method in store
- [ ] Implement `toggleStatus(status: TranslationStatus): void` method in store
- [ ] Implement `selectAllStatuses(): void` method to set all four statuses
- [ ] Implement `clearAllStatuses(): void` method to set empty array
- [ ] Add `selectedStatuses()` to the auto-save effect dependencies (line ~485)
- [ ] Update `loadViewPreferences` to load `selectedStatuses` from localStorage
- [ ] Update `saveViewPreferences` to persist `selectedStatuses` to localStorage
- [ ] Update `arraysEqual` comparison in effect to check `selectedStatuses` equality
- [ ] Unit tests: Test each new store method (setSelectedStatuses, toggleStatus, etc.)
- [ ] Unit tests: Test selectedStatuses persistence to/from localStorage
- [ ] Unit tests: Test selectedStatuses is restored when switching collections

### Phase 2: Filtering Logic Implementation

Implement the computed signal that filters translations by status.

**Tasks:**
- [ ] Create `statusFilterText` computed signal that returns filter button text (e.g., "All statuses", "2 statuses", or single status name)
- [ ] Create `hasActiveStatusFilter` computed signal that returns `true` when selectedStatuses is non-empty
- [ ] Create helper function `matchesStatusFilter(resource: ResourceSummaryDto, selectedStatuses: TranslationStatus[], selectedLocales: string[], baseLocale: string): boolean`
  - If selectedStatuses is empty, return true (no filter)
  - Get effective locales to check (exclude base locale)
  - If selectedLocales is empty, check all non-base locales; otherwise check only selectedLocales
  - Return true if ANY checked locale has a status in selectedStatuses
- [ ] Modify `sortedTranslations` computed signal to apply status filtering
  - Call `matchesStatusFilter` for each item before sorting
  - Chain filtering: first filter by status, then apply existing sort logic
- [ ] Unit tests: Test `matchesStatusFilter` with various combinations of selectedStatuses and selectedLocales
- [ ] Unit tests: Test empty selectedStatuses shows all translations (no filtering)
- [ ] Unit tests: Test single status selection filters correctly
- [ ] Unit tests: Test multiple status selection uses OR logic
- [ ] Unit tests: Test status filter respects selectedLocales (multi-locale matching)
- [ ] Unit tests: Test status filter excludes base locale from checking

### Phase 3: Status Filter Component

Create the status filter UI component following the LocaleFilter pattern.

**Tasks:**
- [ ] Create component directory: `apps/tracker/src/app/browser/sidebar/status-filter/`
- [ ] Create `status-filter.ts` with standalone component configuration
- [ ] Create `status-filter.html` template with:
  - Button trigger with mat-stroked-button
  - Filter icon, dynamic text, arrow icon
  - Mat-menu with multi-select checkboxes
  - Menu header with "Select All" and "Clear All" actions
  - "Needs Work" preset button (selects new + stale)
  - Four status options with checkboxes and colored status dots
- [ ] Create `status-filter.scss` with styling:
  - Trigger button layout (gap, padding, icon sizes)
  - Status dot indicators (8px circles with status colors)
  - Menu header layout
  - Action button styling
- [ ] Implement component class with:
  - `inject(BrowserStore)` for store access
  - `viewChild` reference to menu for programmatic control
  - `isStatusSelected(status: TranslationStatus): boolean` method
  - `toggleStatus(status: TranslationStatus): void` method
  - `selectAll(): void` method
  - `clearAll(): void` method
  - `selectNeedsWork(): void` method (sets new + stale)
  - `getStatusConfig(status: TranslationStatus)` helper returning label, icon, color
- [ ] Add TypeScript interface `StatusConfig { label: string; icon: string; color: string }`
- [ ] Create status configuration map with labels, icons, colors for each status
- [ ] Implement computed signal `displayedStatusDots` that shows colored dots for selected statuses
- [ ] Unit tests: Test component renders correctly
- [ ] Unit tests: Test clicking status checkbox toggles selection
- [ ] Unit tests: Test "Select All" selects all four statuses
- [ ] Unit tests: Test "Clear All" deselects all statuses
- [ ] Unit tests: Test "Needs Work" preset selects new + stale only
- [ ] Unit tests: Test status dots render with correct colors for active filters

### Phase 4: Component Specs and Documentation

Create unit tests for the status filter component.

**Tasks:**
- [ ] Create `status-filter.spec.ts` with ComponentFixture setup
- [ ] Test: Component initializes with no statuses selected
- [ ] Test: Clicking a status checkbox calls store.toggleStatus()
- [ ] Test: "Select All" button calls store.selectAllStatuses()
- [ ] Test: "Clear All" button calls store.clearAllStatuses()
- [ ] Test: "Needs Work" button calls store.setSelectedStatuses(['new', 'stale'])
- [ ] Test: Button text displays "All statuses" when no filter active
- [ ] Test: Button text displays single status name when one selected
- [ ] Test: Button text displays "X statuses" when multiple selected
- [ ] Test: Status dots render in button for each selected status
- [ ] Test: Checkboxes reflect correct checked state based on store
- [ ] Test: Component is accessible (aria labels, keyboard navigation)

### Phase 5: Integration with Main Header

Add the status filter component to the translation browser header.

**Tasks:**
- [ ] Import `StatusFilter` component in `translation-main-header.ts`
- [ ] Add `<app-status-filter />` to template after `<app-locale-filter>` (line 5)
- [ ] Update header layout styles if needed to accommodate new filter
- [ ] Verify responsive behavior on smaller screens
- [ ] Manual test: Status filter appears between locale filter and sort button
- [ ] Manual test: Filter persists when switching folders
- [ ] Manual test: Filter persists when switching collections
- [ ] Manual test: Filter persists across browser refreshes
- [ ] Manual test: Combined locale + status filtering works correctly
- [ ] Manual test: Status filter works in search mode
- [ ] Manual test: Accessibility testing (keyboard navigation, screen reader)

## Success Criteria

- [ ] Status filter dropdown renders in main header between locale filter and sort button
- [ ] Four status options (new, stale, translated, verified) available as checkboxes
- [ ] "Needs Work" preset button selects new + stale together
- [ ] Empty selection shows all translations (no filtering applied)
- [ ] Selected statuses filter translations using OR logic across selected locales
- [ ] Filter state persists to localStorage per collection
- [ ] Filter state restores when switching collections or refreshing browser
- [ ] Button shows colored status dots for active filters
- [ ] Button text accurately reflects filter state ("All statuses", "2 statuses", or status name)
- [ ] Combined locale + status filtering works correctly
- [ ] Multi-locale matching: shows resource if ANY selected locale has matching status
- [ ] Base locale excluded from status checking
- [ ] All unit tests passing (store methods, filtering logic, component)
- [ ] Component accessible via keyboard and screen readers
- [ ] Filter works in both browse and search modes
- [ ] No performance degradation with large translation lists

## Notes

### Design Decisions

1. **Empty Selection Behavior**: Following the locale filter pattern, an empty `selectedStatuses` array means "show all" rather than "show none". This is more intuitive and prevents users from accidentally hiding all translations.

2. **Multi-Locale OR Logic**: When multiple locales are selected, a resource appears if ANY of those locales has a matching status. This is the most useful behavior for translators who want to see all resources needing attention across their working languages.

3. **Preset Button**: The "Needs Work" preset is valuable enough to warrant a dedicated button rather than requiring users to manually select new + stale each time.

4. **Visual Indicators**: Colored status dots in the filter button provide at-a-glance feedback about active filters without requiring users to open the menu.

5. **Persistence**: Per-collection persistence ensures users don't lose their filter preferences when switching contexts.

### Future Enhancements (Out of Scope)

- Custom preset creation (user-defined status combinations)
- Status-based sorting in addition to filtering
- Quick filter chips below the header for one-click toggling
- Filter history/favorites
- Keyboard shortcuts for common filter presets
- Badge counts showing number of translations per status
- "Invert selection" action

### Open Questions

None at this time. All requirements are clearly defined.
