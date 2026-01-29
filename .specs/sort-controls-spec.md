# Translation Browser Sort Controls Feature

## Overview

This feature adds sorting controls to the translation browser interface in LingoTracker's web UI. Users will be able to sort the translation list by resource key (alphabetically) or translation status (prioritizing items needing attention). The sort controls will be integrated into the main header alongside existing filters, with the sort preference persisted to localStorage for each collection.

The sorting capability improves workflow efficiency by allowing users to:
- Quickly find specific translations alphabetically by key
- Prioritize translations that need attention (new, stale, translated, verified)
- Maintain their preferred sort order across browser sessions

This feature applies a flat sort to all displayed resources, meaning it sorts items at the current level regardless of folder hierarchy. The sort operates on the currently displayed translations, respecting the user's folder navigation and search context.

## Technical Context

### Affected Components
- **Translation Main Header** (`apps/tracker/src/app/browser/translations/header/translation-main-header.*`) - UI controls for sort field and direction
- **Browser Store** (`apps/tracker/src/app/browser/store/browser.store.ts`) - State management for sort preferences and computed sorted list
- **View Preferences** - Extended to include sort settings in localStorage persistence

### Integration Points
- The sort controls sit between the locale filter and density toggle in the header
- Sort is applied via a computed signal that transforms the `displayedTranslations` list
- Persistence leverages the existing `ViewPreferences` mechanism that already handles density mode and locale selection

### Key Architectural Decisions
1. **Flat Sort**: Sort operates on the current list of translations, not hierarchically by folder
2. **Sort After Filter**: The sort is applied to `displayedTranslations`, which already respects search mode vs browse mode
3. **Status Sort Priority**: Uses a weighted approach where `new` and `stale` (items needing work) are prioritized, followed by `translated`, then `verified`
4. **Persistence Scope**: Sort preferences are saved per-collection, consistent with other view preferences

### Data Structures

**ResourceSummaryDto/SearchResultDto Structure:**
```typescript
interface ResourceSummaryDto {
  key: string;                                      // For key sorting
  translations: Record<string, string>;
  status: Record<string, TranslationStatus | undefined>; // For status sorting
  comment?: string;
  tags?: string[];
}

type TranslationStatus = 'new' | 'translated' | 'stale' | 'verified';
```

**Sort State:**
```typescript
{
  sortField: 'key' | 'status';  // What to sort by
  sortDirection: 'asc' | 'desc'; // Sort direction
}
```

## Phased Implementation Approach

### Phase 1: Sort State and Persistence

Add sort state to the browser store and integrate with the existing persistence mechanism.

**Tasks:**
- [ ] Update `ViewPreferences` interface in `browser.store.ts` to include `sortField` and `sortDirection` fields
- [ ] Add `sortField` and `sortDirection` to `BrowserState` interface with defaults ('key' and 'asc')
- [ ] Update `initialState` to include default sort settings
- [ ] Modify the `effect()` in the persistence section to include sort fields in saved preferences
- [ ] Update `setSelectedCollection()` to load sort preferences from localStorage
- [ ] Add `setSortField(field: 'key' | 'status')` method to browser store
- [ ] Add `setSortDirection(direction: 'asc' | 'desc')` method to browser store
- [ ] Unit tests: Create test file `apps/tracker/src/app/browser/store/browser.store.sorting.spec.ts`
  - Test default sort state is 'key' ascending
  - Test `setSortField` updates state correctly
  - Test `setSortDirection` updates state correctly
  - Test sort preferences persist to localStorage when changed
  - Test sort preferences are restored when collection is loaded

### Phase 2: Sort Utility Function

Create a reusable sort utility that handles both key and status-based sorting.

**Tasks:**
- [ ] Create new file `apps/tracker/src/app/browser/translations/utils/sort-translations.ts`
- [ ] Implement `sortByKey()` function that sorts ResourceSummaryDto[] alphabetically by key (case-insensitive)
- [ ] Implement `sortByStatus()` function that sorts by translation status priority:
  - Status priority order (ascending): new (0) → stale (1) → translated (2) → verified (3)
  - For resources with multiple locales, use the "worst" status (lowest priority number)
  - Secondary sort by key when statuses are equal
  - Handle undefined status (treat as verified)
- [ ] Implement main `sortTranslations()` function that accepts items, field, direction, and selected locales
- [ ] Add utility function `getWorstStatus()` to determine priority status across multiple locales
- [ ] Unit tests: Create test file `apps/tracker/src/app/browser/translations/utils/sort-translations.spec.ts`
  - Test key sorting ascending and descending
  - Test key sorting is case-insensitive
  - Test status sorting with single locale (all status values)
  - Test status sorting with multiple locales (uses worst status)
  - Test status sorting fallback to key sort for ties
  - Test undefined status handling
  - Test empty array handling
  - Test descending direction reverses order

### Phase 3: Computed Sorted List

Add a computed signal to the browser store that applies sorting to displayed translations.

**Tasks:**
- [ ] Add `sortedTranslations` computed signal to browser store in `withComputed()` section
- [ ] Compute uses `displayedTranslations()`, `sortField()`, `sortDirection()`, and `selectedLocales()`
- [ ] Import and call `sortTranslations()` utility function within the computed
- [ ] Update any component that currently reads `displayedTranslations()` to read `sortedTranslations()` instead
- [ ] Verify that search results and browse mode both respect sorting
- [ ] Unit tests: Add to existing `browser.store.spec.ts` or create `browser.store.sorted-translations.spec.ts`
  - Test `sortedTranslations` sorts by key ascending by default
  - Test changing sort field updates sorted list
  - Test changing sort direction updates sorted list
  - Test sorted list updates when translations change
  - Test sorted list works in both browse and search mode
  - Test reactivity: verify computed updates when dependencies change

### Phase 4: UI Controls in Header

Add Material select dropdown for sort field and icon button for sort direction to the header.

**Tasks:**
- [ ] Add `MatSelectModule` and `MatFormFieldModule` to imports in `translation-main-header.ts`
- [ ] Create type `SortField = 'key' | 'status'` in component file
- [ ] Create type `SortDirection = 'asc' | 'desc'` in component file
- [ ] Add `handleSortFieldChange(field: SortField)` method that calls `store.setSortField()`
- [ ] Add `handleSortDirectionToggle()` method that toggles between 'asc' and 'desc'
- [ ] In `translation-main-header.html`, add sort controls after `<app-locale-filter>` and before density toggle:
  - Add wrapper div with class `sort-controls`
  - Add `<mat-form-field>` with `<mat-select>` for sort field
  - Add options for "Key" (value='key') and "Status" (value='status')
  - Bind select value to `store.sortField()`
  - Bind change event to `handleSortFieldChange()`
  - Add `<button mat-icon-button>` for sort direction toggle
  - Show `arrow_upward` icon when direction is 'asc'
  - Show `arrow_downward` icon when direction is 'desc'
  - Bind click to `handleSortDirectionToggle()`
  - Add tooltips: "Sort ascending" / "Sort descending"

### Phase 5: Styling and Polish

Style the sort controls to match the existing header design and ensure accessibility.

**Tasks:**
- [ ] Add `.sort-controls` styles to `translation-main-header.scss`:
  - Set display to flex with gap between field and toggle
  - Align items vertically centered
  - Add `flex-shrink: 0` to prevent unwanted shrinking
- [ ] Style the mat-form-field to match header aesthetics:
  - Reduce padding/margins to match compact header style
  - Set appropriate width (e.g., 120px) so "Status" and "Key" fit comfortably
  - Match font size and colors to other header controls
  - Consider using `appearance="outline"` or custom styling
- [ ] Style the direction toggle button:
  - Ensure icon size matches other header icons (20px)
  - Apply hover/focus states consistent with density toggle
  - Ensure button color matches text color scheme
- [ ] Add accessibility attributes:
  - `aria-label` on select: "Sort translations by"
  - `aria-label` on toggle button: "Toggle sort direction"
  - Ensure tooltip text is descriptive
- [ ] Test responsive behavior: ensure controls don't break layout on narrow screens
- [ ] Test keyboard navigation: Tab through controls, Space/Enter to activate

### Phase 6: Integration Testing and Documentation

Verify the feature works end-to-end and document behavior for users.

**Tasks:**
- [ ] Manual testing: Start app and navigate to browser view
- [ ] Verify default sort is Key ascending
- [ ] Verify changing sort field to Status re-sorts list correctly
- [ ] Verify toggling sort direction reverses order
- [ ] Verify sort preference persists after browser refresh
- [ ] Verify sort works correctly in search mode
- [ ] Verify sort works correctly when navigating folders
- [ ] Verify sort works correctly when changing locale filters
- [ ] Verify sort persists per-collection (switch collections and verify independent settings)
- [ ] Verify status sort prioritizes 'new' and 'stale' items when ascending
- [ ] Add inline code comments explaining status sort priority logic
- [ ] Update user-facing documentation if applicable (optional, only if docs exist)

## Success Criteria

- [ ] Users can select sort field (Key or Status) from dropdown in header
- [ ] Users can toggle sort direction with dedicated arrow button
- [ ] Key sort is alphabetical and case-insensitive
- [ ] Status sort prioritizes items needing attention: new → stale → translated → verified
- [ ] Sort preference persists to localStorage per collection
- [ ] Sort controls appear between locale filter and density toggle
- [ ] Sort works correctly in both browse mode and search mode
- [ ] All unit tests passing with >80% coverage for new code
- [ ] UI is accessible (keyboard navigable, proper ARIA labels, tooltips)
- [ ] Styling is consistent with existing header controls

## Notes

### Status Sort Logic
When sorting by status, each resource may have multiple locales with different statuses. The sort uses the "worst" status (item needing most attention) across all selected locales. For example, if a resource is `verified` in English but `new` in French, it will sort as `new`.

Status priority (ascending):
1. `new` (priority 0) - Not yet translated
2. `stale` (priority 1) - Translation outdated
3. `translated` (priority 2) - Translated but not verified
4. `verified` (priority 3) - Fully reviewed
5. `undefined` (treat as verified, priority 3) - Typically only for base locale

### Future Enhancements (Out of Scope)
- Multi-field sorting (e.g., status then key)
- Hierarchical folder-aware sorting
- Custom sort orders
- Sort by last modified date
- Sort by comment presence or tag
