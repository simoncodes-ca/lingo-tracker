# Translation List Density Modes Feature

## Overview

This feature enhances the translation list component to support three display density modes (Compact, Medium, Full), providing users with flexible viewing options that match their workflow needs. The feature includes:

- **View Mode Toggle**: User-selectable density modes with persistence per collection
- **Roll-up Status Indicator**: Visual aggregation of translation status across all locales
- **Comment/Tag Popovers**: Non-intrusive display of metadata in Medium/Full modes
- **Per-Row Actions**: Edit, Move, Delete operations accessible via keyboard and mouse/touch
- **Placeholder Dialogs**: UI shells for Edit, Move, Delete operations (implementation to follow)
- **Keyboard Accessibility**: Full keyboard navigation and operation support
- **Touch Support**: Long-press gesture to trigger Edit action

This feature serves as the foundation for more advanced translation management capabilities while immediately improving the user experience through better information density control.

## Business Value

- **Productivity**: Users can quickly scan translations in Compact mode or see detailed context in Full mode
- **Flexibility**: Different tasks benefit from different density levels (reviewing vs. editing)
- **Performance**: Compact mode reduces rendering overhead for large translation lists
- **Accessibility**: Keyboard navigation makes the system usable without a mouse
- **Mobile-Ready**: Touch support enables effective use on tablets and touch-enabled devices

## Technical Context

### Current Architecture

The translation list is implemented using:
- **Angular 20** standalone components with OnPush change detection
- **NgRx Signals** for reactive state management (BrowserStore)
- **Angular CDK Virtual Scroll** for performance with large lists (currently fixed 120px height)
- **Angular Material** for UI components (dialogs, menus, buttons, tooltips)
- **Design Token System** for consistent theming across light/dark modes

### Key Files Affected

```
apps/tracker/src/app/browser/
├── store/browser.store.ts                    # State management - add density mode state
├── translations/
│   ├── header/
│   │   ├── translation-main-header.ts        # Add density toggle button group
│   │   ├── translation-main-header.html
│   │   └── translation-main-header.scss
│   └── list/
│       ├── translation-item.ts               # Implement density-aware display
│       ├── translation-item.html
│       ├── translation-item.scss
│       ├── translation-list.ts               # Update virtual scroll itemSize
│       ├── translation-list.html
│       └── translation-list.scss
└── dialogs/                                  # New directory
    ├── edit-resource-dialog/
    │   ├── edit-resource-dialog.ts           # Placeholder component
    │   ├── edit-resource-dialog.html
    │   └── edit-resource-dialog.scss
    ├── move-resource-dialog/
    │   ├── move-resource-dialog.ts           # Placeholder component
    │   ├── move-resource-dialog.html
    │   └── move-resource-dialog.scss
    └── delete-resource-dialog/
        ├── delete-resource-dialog.ts         # Placeholder component
        ├── delete-resource-dialog.html
        └── delete-resource-dialog.scss
```

### Data Model

The existing `ResourceSummaryDto` provides all required data:

```typescript
interface ResourceSummaryDto {
  key: string;
  translations: Record<string, string>;           // All locale values
  status: Record<string, TranslationStatus | undefined>;  // Per-locale status
  comment?: string;                               // Optional metadata
  tags?: string[];                                // Optional categorization
}

type TranslationStatus = 'new' | 'translated' | 'stale' | 'verified';
```

### State Management

The BrowserStore will be extended with:

```typescript
interface BrowserState {
  // ... existing state ...

  // New state for density feature
  densityMode: 'compact' | 'medium' | 'full';
  viewPreferences: Map<string, ViewPreferences>;  // Per-collection preferences
}

interface ViewPreferences {
  densityMode: 'compact' | 'medium' | 'full';
  selectedLocales: string[];
}
```

### Persistence Strategy

User preferences will be stored in localStorage using:
- **Key Pattern**: `lingo-tracker:view-prefs:{collectionName}`
- **Value**: JSON-serialized `ViewPreferences` object
- **Load Time**: When collection is selected
- **Save Time**: Immediately when density mode or locale filter changes

### Design Constraints

1. **Locale Filter Behavior**:
   - Multi-select locale filter controls which locales are **displayed** in the list
   - In Compact mode: enforce single locale selection (keep first if multiple selected)
   - When switching to Compact with multiple locales: automatically keep only the first
   - Roll-up status indicator always shows status across **ALL locales** (regardless of filter)

2. **Virtual Scroll Heights**:
   - Compact: ~60px per item
   - Medium: ~120px per item (current default)
   - Full: ~160px per item (with expand button for overflow)

3. **Accessibility Requirements**:
   - All interactive elements must be keyboard accessible (Tab, Enter, Escape)
   - Focus indicators must be visible per WCAG 2.1 AA standards
   - ARIA labels for icon-only buttons
   - Logical tab order (header controls → list items → actions)

4. **Theme Compatibility**:
   - All new styles must use CSS custom properties from `tokens.scss`
   - Must work in both light and dark themes
   - No hardcoded color values

## Phased Implementation Approach

### Phase 1: Foundation & State Management

**Goal**: Establish the state management foundation and persistence layer for density modes without changing the UI.

**Tasks**:
- [ ] Add `densityMode` state to BrowserStore with default value `'medium'`
- [ ] Add `viewPreferences` Map to BrowserStore state
- [ ] Create `ViewPreferences` interface in BrowserStore file
- [ ] Implement `setDensityMode(mode: 'compact' | 'medium' | 'full')` method in BrowserStore
- [ ] Implement localStorage persistence methods:
  - [ ] `loadViewPreferences(collectionName: string): ViewPreferences | null`
  - [ ] `saveViewPreferences(collectionName: string, prefs: ViewPreferences): void`
- [ ] Update `setSelectedCollection` to load persisted preferences on collection change
- [ ] Add effect to auto-save preferences when `densityMode` or `selectedLocales` changes
- [ ] Add computed property `canShowMultipleLocales` that returns `densityMode() !== 'compact'`
- [ ] Update `setDensityMode` to enforce single locale when switching to Compact mode
- [ ] Unit tests:
  - [ ] Test density mode state updates
  - [ ] Test localStorage persistence (save and load)
  - [ ] Test automatic locale adjustment when switching to Compact mode
  - [ ] Test preference loading when collection changes

**Acceptance Criteria**:
- Density mode state can be set and retrieved from BrowserStore
- Preferences persist across page reloads when collection is reselected
- Switching to Compact mode automatically reduces selectedLocales to first item
- All state transitions are tested

---

### Phase 2: Density Toggle UI

**Goal**: Add UI controls for density mode selection in the translation header.

**Tasks**:
- [ ] Create density toggle button group in `translation-main-header.html`:
  - [ ] Use `mat-button-toggle-group` with three options (Compact, Medium, Full)
  - [ ] Add Material icons: `view_compact`, `view_comfortable`, `view_day`
  - [ ] Include ARIA labels for accessibility
- [ ] Inject BrowserStore in `translation-main-header.ts`
- [ ] Bind button group value to `store.densityMode()`
- [ ] Wire up value change event to call `store.setDensityMode()`
- [ ] Add tooltip to each toggle button explaining the mode
- [ ] Style button group in `translation-main-header.scss`:
  - [ ] Position on right side of header (flex layout)
  - [ ] Use design tokens for spacing and colors
  - [ ] Ensure visibility in both light and dark themes
  - [ ] Add hover/focus states
- [ ] Update locale filter to disable multi-select when in Compact mode:
  - [ ] Pass `store.canShowMultipleLocales()` as input to locale filter component
  - [ ] Show helper text "Compact mode supports single locale only" when disabled
- [ ] Manual testing:
  - [ ] Verify toggle switches modes correctly
  - [ ] Verify tooltips display on hover
  - [ ] Verify keyboard navigation (Tab, Arrow keys, Enter)
  - [ ] Test in light and dark themes
  - [ ] Verify locale filter interaction with Compact mode

**Acceptance Criteria**:
- Toggle button group appears in header next to locale filter
- Clicking a density button updates the store state
- Visual feedback clearly indicates current selection
- Keyboard navigation works correctly
- Locale filter adapts to density mode constraints

---

### Phase 3: Compact View Implementation

**Goal**: Implement Compact density mode display with roll-up status indicator.

**Tasks**:
- [ ] Add computed property `currentDensityMode` to translation-item.ts that reads `inject(BrowserStore).densityMode()`
- [ ] Add computed property `rollupStatus` to translation-item.ts:
  - [ ] Calculate aggregated status across ALL locales (not just filtered)
  - [ ] Priority: `stale` > `new` > `translated` > `verified` (worst status wins)
  - [ ] Return tuple: `[status: TranslationStatus, count: number]`
- [ ] Add computed property `primaryLocale` to translation-item.ts:
  - [ ] Returns first locale from `locales()` input (for Compact mode)
- [ ] Add computed property `primaryLocaleValue` to translation-item.ts:
  - [ ] Returns translation value for primary locale
  - [ ] Returns `baseValue()` if primary locale is base locale
- [ ] Create Compact mode template in `translation-item.html`:
  - [ ] Horizontal layout: `[status-indicator] [key] [primary-locale-value] [actions]`
  - [ ] Status indicator: circular badge with color based on rollup status
  - [ ] Key: truncated with ellipsis, clickable to copy
  - [ ] Value: truncated with ellipsis, styled by status
  - [ ] Actions: inline icon buttons (Edit, Move, Delete)
- [ ] Style Compact mode in `translation-item.scss`:
  - [ ] Container height: ~60px
  - [ ] Horizontal flexbox layout with gap
  - [ ] Status indicator: 12px circle with status color
  - [ ] Key: flex-basis 30%, ellipsis overflow
  - [ ] Value: flex-basis 50%, ellipsis overflow
  - [ ] Actions: flex-shrink 0, icon buttons only
  - [ ] Use design tokens for all colors and spacing
- [ ] Update `translation-list.ts`:
  - [ ] Add computed property `currentItemSize` that returns height based on `store.densityMode()`
  - [ ] Bind `[itemSize]` to `currentItemSize()`
- [ ] Add keyboard support:
  - [ ] Enter on key button copies to clipboard
  - [ ] Tab navigates through key → action buttons
  - [ ] Enter/Space on action buttons triggers respective action
- [ ] Unit tests:
  - [ ] Test rollup status calculation with various locale statuses
  - [ ] Test Compact mode rendering
  - [ ] Test primary locale selection
- [ ] Manual testing:
  - [ ] Verify Compact mode displays correctly with single locale
  - [ ] Verify rollup status indicator shows correct color/status
  - [ ] Verify truncation works properly
  - [ ] Test keyboard navigation through items
  - [ ] Test in virtual scroll with many items

**Acceptance Criteria**:
- Compact mode displays all required information in ~60px height
- Roll-up status indicator accurately reflects worst status across all locales
- Text truncation prevents overflow
- Keyboard navigation works smoothly
- Virtual scroll performance is maintained

---

### Phase 4: Medium View Implementation

**Goal**: Implement Medium density mode (current default behavior with enhancements).

**Tasks**:
- [ ] Create Medium mode template in `translation-item.html`:
  - [ ] Vertical layout: `[header: key + actions] [base-value] [locales-grid] [metadata-row]`
  - [ ] Header: key (copyable) + roll-up indicator + action menu (vertical dots)
  - [ ] Base value: full text, multiple lines allowed
  - [ ] Locales grid: 2-column layout (locale code | value) with status coloring
  - [ ] Metadata row: tag chips + comment icon (if present)
- [ ] Add computed property `hasMetadata` to translation-item.ts:
  - [ ] Returns true if tags exist or comment exists
- [ ] Style Medium mode in `translation-item.scss`:
  - [ ] Container height: ~120px
  - [ ] Grid layout for locale translations (2 columns)
  - [ ] Tag chips: inline with max 3 visible + "+X more" indicator
  - [ ] Comment icon: info icon with subtle color
  - [ ] Maintain existing card hover effects
  - [ ] Use design tokens consistently
- [ ] Add roll-up status badge to header:
  - [ ] Position near key button (right side of key)
  - [ ] Tooltip showing detailed status breakdown: "2 stale, 3 verified, 1 new"
  - [ ] Small circular badge with count
- [ ] Update keyboard navigation:
  - [ ] Tab order: key → metadata icons → action menu → next item
  - [ ] Arrow keys to expand/collapse action menu
- [ ] Manual testing:
  - [ ] Verify Medium mode displays all locales in grid
  - [ ] Verify tag chips display correctly with overflow
  - [ ] Verify roll-up status tooltip content
  - [ ] Test keyboard navigation
  - [ ] Test hover states

**Acceptance Criteria**:
- Medium mode displays in ~120px height with proper layout
- Locale grid shows all filtered locales clearly
- Tags display with overflow handling
- Roll-up status badge shows aggregated information
- All interactive elements have proper keyboard support

---

### Phase 5: Full View Implementation

**Goal**: Implement Full density mode with expandable overflow and detailed metadata.

**Tasks**:
- [ ] Create Full mode template in `translation-item.html`:
  - [ ] Same structure as Medium but with more vertical spacing
  - [ ] Base value: multi-line with max-height constraint
  - [ ] Locales: full-width single column layout
  - [ ] Tags: show all tags (no limit)
  - [ ] Comment: display full comment text if present
  - [ ] Expand button: appears when base value or any locale value exceeds max-height
- [ ] Add signal `isExpanded` to translation-item.ts (default false)
- [ ] Add computed property `needsExpansion` to translation-item.ts:
  - [ ] Check if base value length > 200 characters
  - [ ] Check if any locale value length > 200 characters
  - [ ] Return true if any exceed threshold
- [ ] Add method `toggleExpansion()` to handle expand/collapse
- [ ] Style Full mode in `translation-item.scss`:
  - [ ] Container height: ~160px (collapsed), auto (expanded)
  - [ ] Base value: max 4 lines when collapsed, unlimited when expanded
  - [ ] Locale values: max 3 lines when collapsed, unlimited when expanded
  - [ ] Expand button: positioned bottom-right, icon rotates on toggle
  - [ ] Smooth height transition animation
  - [ ] Full tag list with wrapping
  - [ ] Comment section with subtle background
- [ ] Add keyboard support for expansion:
  - [ ] Enter/Space on expand button toggles expansion
  - [ ] Escape collapses if expanded
- [ ] Update virtual scroll handling:
  - [ ] When item expands, trigger viewport recheck (may need custom handling)
  - [ ] Consider using `cdkVirtualScrollViewport.checkViewportSize()`
- [ ] Unit tests:
  - [ ] Test `needsExpansion` logic with various content lengths
  - [ ] Test expansion toggle state
- [ ] Manual testing:
  - [ ] Verify Full mode displays with proper spacing
  - [ ] Test expand/collapse animation
  - [ ] Verify all tags and comment are visible
  - [ ] Test keyboard expansion controls
  - [ ] Test virtual scroll behavior with mixed expanded/collapsed items

**Acceptance Criteria**:
- Full mode displays in ~160px height (collapsed)
- Expansion works smoothly with animation
- All metadata (tags, comments) is fully visible
- Virtual scroll handles dynamic heights correctly
- Keyboard controls work for expansion

---

### Phase 6: Comment and Tag Popovers

**Goal**: Add interactive popovers for viewing comments and tag lists in Medium mode.

**Tasks**:
- [ ] Create `CommentPopover` component:
  - [ ] Standalone component in `apps/tracker/src/app/browser/shared/`
  - [ ] Input: `comment: string`
  - [ ] Uses `MatTooltip` or `MatMenu` for positioning
  - [ ] Displays comment text in styled container with max-width
  - [ ] Template: `<div class="comment-popover">{{ comment }}</div>`
- [ ] Create `TagListPopover` component:
  - [ ] Standalone component in `apps/tracker/src/app/browser/shared/`
  - [ ] Input: `tags: string[]`
  - [ ] Displays all tags as chips in a popover
  - [ ] Template: wraps tag-list component with popover container
- [ ] Integrate comment popover in `translation-item.html` (Medium mode):
  - [ ] Comment icon button: `<button [matMenuTriggerFor]="commentMenu">...</button>`
  - [ ] Wire up menu with comment content
  - [ ] Show count indicator if comment is truncated
- [ ] Integrate tag popover in `translation-item.html` (Medium mode):
  - [ ] "+X more" button when tags exceed visible limit (3)
  - [ ] Wire up menu to show all tags
  - [ ] Click outside to close
- [ ] Style popovers:
  - [ ] Use Material menu styling as base
  - [ ] Max-width: 400px
  - [ ] Padding from design tokens
  - [ ] Shadow for depth
  - [ ] Support light/dark themes
- [ ] Add keyboard support:
  - [ ] Tab to popover trigger button
  - [ ] Enter/Space to open
  - [ ] Escape to close
  - [ ] Tab navigates within popover (if interactive content)
- [ ] Unit tests:
  - [ ] Test CommentPopover renders comment text
  - [ ] Test TagListPopover renders all tags
- [ ] Manual testing:
  - [ ] Verify popover positioning (doesn't go off-screen)
  - [ ] Test keyboard open/close
  - [ ] Verify click-outside closes popover
  - [ ] Test in virtual scroll (popover overlay doesn't clip)

**Acceptance Criteria**:
- Comment popover displays full comment text on icon click
- Tag popover shows all tags when "+X more" is clicked
- Popovers are positioned correctly and don't overflow viewport
- Keyboard interaction works smoothly
- Popovers work within virtual scroll viewport

---

### Phase 7: Per-Row Actions Enhancement

**Goal**: Enhance existing Edit/Move/Delete actions with better UX and touch support.

**Tasks**:
- [ ] Add touch gesture support to `translation-item.ts`:
  - [ ] Add `touchStartTime: number | null` signal
  - [ ] Implement `onTouchStart()` method to record timestamp
  - [ ] Implement `onTouchEnd()` method:
    - [ ] Calculate touch duration
    - [ ] If duration > 500ms, emit `editTranslation` event
    - [ ] Show visual feedback during long press (e.g., scale animation)
  - [ ] Add `isTouchPressed` signal for visual feedback
- [ ] Update `translation-item.html` action buttons:
  - [ ] Add `(touchstart)` and `(touchend)` handlers to item container
  - [ ] Add ARIA labels to all action buttons
  - [ ] Ensure focus indicators are visible on all buttons
  - [ ] Add tooltips to action buttons in Compact mode (icon-only)
- [ ] Style touch feedback in `translation-item.scss`:
  - [ ] Add class `.touch-pressed` with scale transform
  - [ ] Add subtle pulse animation during long press
  - [ ] Ensure touch target size ≥ 44x44px for accessibility
- [ ] Add keyboard shortcuts for actions:
  - [ ] When item has focus, `e` key triggers Edit
  - [ ] When item has focus, `m` key triggers Move
  - [ ] When item has focus, `Delete` key triggers Delete
  - [ ] Add `(keydown)` handler to item container
- [ ] Update action menu in Medium/Full modes:
  - [ ] Ensure menu items have proper focus states
  - [ ] Add keyboard shortcuts to menu item labels (e.g., "Edit (E)")
- [ ] Manual testing:
  - [ ] Test long-press on touch device or simulator
  - [ ] Verify visual feedback appears during long press
  - [ ] Test keyboard shortcuts with focused item
  - [ ] Verify touch targets are large enough
  - [ ] Test action menu keyboard navigation

**Acceptance Criteria**:
- Long press (>500ms) on touch devices triggers Edit action
- Visual feedback shows during long press
- Keyboard shortcuts work when item is focused
- All action buttons meet 44x44px touch target size
- Focus indicators are clearly visible

---

### Phase 8: Placeholder Dialogs

**Goal**: Create placeholder dialog components for Edit, Move, and Delete actions.

**Tasks**:
- [ ] Create `EditResourceDialog` component:
  - [ ] Standalone component in `apps/tracker/src/app/browser/dialogs/edit-resource-dialog/`
  - [ ] Use `MatDialogModule` and `MatDialog` service
  - [ ] Input data: `{ resource: ResourceSummaryDto, collectionName: string }`
  - [ ] Template: Dialog with title "Edit Resource", close button, placeholder content
  - [ ] Placeholder content: "Edit functionality coming soon"
  - [ ] Footer: Cancel button only
  - [ ] SCSS: Use design tokens, max-width 600px
- [ ] Create `MoveResourceDialog` component:
  - [ ] Standalone component in `apps/tracker/src/app/browser/dialogs/move-resource-dialog/`
  - [ ] Input data: `{ resource: ResourceSummaryDto, collectionName: string }`
  - [ ] Template: Dialog with title "Move Resource", close button, placeholder content
  - [ ] Placeholder content: "Move functionality coming soon"
  - [ ] Footer: Cancel button only
  - [ ] SCSS: Use design tokens, max-width 600px
- [ ] Create `DeleteResourceDialog` component:
  - [ ] Standalone component in `apps/tracker/src/app/browser/dialogs/delete-resource-dialog/`
  - [ ] Input data: `{ resource: ResourceSummaryDto, collectionName: string }`
  - [ ] Template: Dialog with title "Delete Resource", close button, confirmation message
  - [ ] Content: "Are you sure you want to delete '{key}'? This action cannot be undone."
  - [ ] Footer: Cancel button + Delete button (danger style)
  - [ ] SCSS: Use design tokens, max-width 500px
  - [ ] Delete button triggers dialog close with result `{ confirmed: true }`
  - [ ] Cancel button triggers dialog close with result `{ confirmed: false }`
- [ ] Update `translation-list.ts` to open dialogs:
  - [ ] Inject `MatDialog` service
  - [ ] Update `handleEdit()` to open `EditResourceDialog`:
    - [ ] Call `dialog.open(EditResourceDialog, { data: { resource, collectionName } })`
    - [ ] Subscribe to afterClosed() (no action needed yet)
  - [ ] Update `handleMove()` to open `MoveResourceDialog`
  - [ ] Update `handleDelete()` to open `DeleteResourceDialog`:
    - [ ] Subscribe to afterClosed()
    - [ ] Show snackbar "Delete functionality coming soon" if confirmed
- [ ] Add keyboard support:
  - [ ] Escape key closes dialog (default Material behavior)
  - [ ] Tab navigates through dialog controls
  - [ ] Enter on Delete button confirms (DeleteResourceDialog only)
- [ ] Style dialogs consistently:
  - [ ] Use `--spacing-*` tokens for padding
  - [ ] Use `--color-*` tokens for backgrounds and text
  - [ ] Delete button uses `--color-error` for danger styling
  - [ ] Ensure dark theme compatibility
- [ ] Unit tests:
  - [ ] Test EditResourceDialog opens with correct data
  - [ ] Test MoveResourceDialog opens with correct data
  - [ ] Test DeleteResourceDialog opens and returns confirmation result
- [ ] Manual testing:
  - [ ] Verify all dialogs open from respective actions
  - [ ] Test keyboard navigation within dialogs
  - [ ] Verify Escape closes dialog
  - [ ] Test delete confirmation flow
  - [ ] Verify dialogs work in light and dark themes

**Acceptance Criteria**:
- Edit dialog opens with resource information displayed
- Move dialog opens with resource information displayed
- Delete dialog opens with confirmation message and Cancel/Delete buttons
- All dialogs close properly on Escape or button click
- Delete dialog returns confirmation result
- Dialogs are styled consistently with design system

---

### Phase 9: Accessibility Polish and Testing

**Goal**: Comprehensive accessibility audit and keyboard navigation refinement.

**Tasks**:
- [ ] Add ARIA attributes throughout:
  - [ ] `aria-label` on all icon-only buttons
  - [ ] `aria-describedby` for status indicators linking to tooltip
  - [ ] `role="list"` on virtual scroll viewport
  - [ ] `role="listitem"` on translation-item containers
  - [ ] `aria-expanded` on expandable items (Full mode)
  - [ ] `aria-current` for selected density mode toggle
- [ ] Implement focus management:
  - [ ] When dialog opens, focus moves to first focusable element
  - [ ] When dialog closes, focus returns to trigger button
  - [ ] When switching density modes, maintain scroll position and focus
- [ ] Add skip navigation:
  - [ ] "Skip to list" link in header for keyboard users
  - [ ] Focus moves directly to first translation item
- [ ] Test with screen readers:
  - [ ] Test with NVDA (Windows) or VoiceOver (macOS)
  - [ ] Verify all controls are announced correctly
  - [ ] Verify status indicators are announced
  - [ ] Verify list items are navigable
- [ ] Keyboard navigation testing:
  - [ ] Document full keyboard navigation flow
  - [ ] Test Tab navigation through all controls
  - [ ] Test all keyboard shortcuts (e, m, Delete)
  - [ ] Test focus indicators visibility in all themes
  - [ ] Test Enter/Space activation on all buttons
- [ ] Create keyboard shortcuts documentation:
  - [ ] Add "?" key to show keyboard shortcuts overlay (future enhancement marker)
  - [ ] Document shortcuts in user-facing docs
- [ ] Color contrast testing:
  - [ ] Verify all text meets WCAG AA contrast ratios (4.5:1 for normal text)
  - [ ] Test status indicator colors for distinguishability
  - [ ] Test in both light and dark themes
- [ ] Focus indicator refinement:
  - [ ] Ensure focus ring is 2px solid with adequate contrast
  - [ ] Test focus visible on all interactive elements
  - [ ] Verify focus ring doesn't get clipped by overflow
- [ ] Manual testing checklist:
  - [ ] Complete keyboard-only navigation of entire feature
  - [ ] Test with browser zoom at 200%
  - [ ] Test with Windows High Contrast mode
  - [ ] Test focus indicators in all density modes
  - [ ] Test screen reader announcements

**Acceptance Criteria**:
- All interactive elements have appropriate ARIA labels
- Focus management works correctly for dialogs
- Keyboard navigation covers all functionality without mouse
- Focus indicators are visible and meet contrast requirements
- Screen readers correctly announce all controls and status
- Feature passes WCAG 2.1 AA accessibility standards

---

### Phase 10: Performance Optimization and Edge Cases

**Goal**: Ensure excellent performance with large lists and handle all edge cases gracefully.

**Tasks**:
- [ ] Virtual scroll optimization:
  - [ ] Test with 1000+ translation items
  - [ ] Measure scroll performance (should maintain 60fps)
  - [ ] Optimize itemSize calculation for dynamic heights in Full mode
  - [ ] Consider adding `trackBy` optimization for locale translations
- [ ] Handle edge cases in templates:
  - [ ] Empty translation value for selected locale: show "—" or placeholder
  - [ ] No tags: hide tag section entirely in Medium/Full
  - [ ] No comment: hide comment icon in Medium/Full
  - [ ] Very long keys (>100 chars): ensure truncation works
  - [ ] Very long values (>500 chars): ensure expansion works
  - [ ] Zero locales selected (Compact mode): show error message
  - [ ] All translations verified: roll-up indicator shows success state
- [ ] Add loading states:
  - [ ] Skeleton screens while switching density modes (if needed)
  - [ ] Smooth transition animations between modes
- [ ] Memory leak prevention:
  - [ ] Verify subscriptions are properly cleaned up
  - [ ] Test rapid density mode switching
  - [ ] Check for proper component cleanup in virtual scroll
- [ ] Add error boundaries:
  - [ ] Graceful degradation if localStorage is unavailable
  - [ ] Fallback to default Medium mode if preferences fail to load
- [ ] Test locale filter edge cases:
  - [ ] Switch to Compact with 5 locales selected → keeps first only
  - [ ] Switch back to Medium → restores previous selection
  - [ ] Select all locales → verify "All locales" text in filter
- [ ] Performance profiling:
  - [ ] Use Angular DevTools to measure change detection cycles
  - [ ] Verify OnPush strategy is effective
  - [ ] Check for unnecessary re-renders
- [ ] Unit tests for edge cases:
  - [ ] Test empty values
  - [ ] Test missing metadata
  - [ ] Test extremely long content
  - [ ] Test roll-up with all same status
  - [ ] Test roll-up with mixed statuses
- [ ] Manual testing with edge cases:
  - [ ] Create test collection with edge case data
  - [ ] Test with very long keys and values
  - [ ] Test with no tags, no comments
  - [ ] Test with all locales in same status
  - [ ] Test rapid mode switching
  - [ ] Test with browser localStorage disabled

**Acceptance Criteria**:
- Scrolling remains smooth (60fps) with 1000+ items
- All edge cases render correctly without errors
- No memory leaks detected during testing
- Graceful fallback when localStorage is unavailable
- Change detection cycles are minimal and appropriate
- All edge cases covered by unit tests

---

## Success Criteria

- [ ] Users can switch between Compact, Medium, and Full density modes
- [ ] Density mode preference persists per collection in localStorage
- [ ] Compact mode displays single locale with roll-up status indicator
- [ ] Medium mode displays multiple locales with tags and comment icons
- [ ] Full mode displays all details with expandable overflow
- [ ] Roll-up status indicator correctly aggregates status across all locales
- [ ] Comment and tag popovers display metadata in Medium mode
- [ ] Edit, Move, Delete actions are accessible via keyboard and mouse
- [ ] Long-press gesture on touch devices triggers Edit action
- [ ] Placeholder dialogs open for Edit, Move, Delete actions
- [ ] All interactions are keyboard accessible
- [ ] Virtual scroll performance is maintained in all modes
- [ ] Feature works in both light and dark themes
- [ ] All accessibility requirements met (WCAG 2.1 AA)
- [ ] No console errors or warnings
- [ ] All unit tests passing

---

## Testing Strategy

### Unit Tests (Vitest)

Focus on:
- BrowserStore density mode state management
- ViewPreferences localStorage persistence
- Roll-up status calculation logic
- Locale filtering logic with density mode constraints
- Expansion logic in Full mode
- Touch gesture duration calculation

Run with: `pnpm run test:tracker --testFile=browser/store/browser.store.spec.ts`

### Manual Testing Scenarios

1. **Density Mode Switching**:
   - Switch between modes and verify layout changes
   - Verify virtual scroll itemSize updates correctly
   - Check preference persistence across page reloads

2. **Compact Mode**:
   - Select multiple locales, switch to Compact, verify single locale displayed
   - Verify roll-up status shows correct aggregation
   - Test truncation with very long keys/values

3. **Medium Mode**:
   - Verify locale grid displays all selected locales
   - Test tag overflow and "+X more" button
   - Test comment icon popover

4. **Full Mode**:
   - Test expand/collapse with long content
   - Verify all tags and comment are visible
   - Test smooth height transitions

5. **Keyboard Navigation**:
   - Navigate entire feature using only Tab, Enter, Escape, Arrow keys
   - Verify focus indicators are visible at each step
   - Test keyboard shortcuts (e, m, Delete)

6. **Touch Interaction**:
   - Test long-press on touch device or simulator
   - Verify visual feedback during press
   - Confirm Edit dialog opens after 500ms

7. **Dialogs**:
   - Open each dialog type from actions
   - Test keyboard navigation within dialogs
   - Verify Escape closes dialogs
   - Test delete confirmation flow

8. **Accessibility**:
   - Test with screen reader (NVDA/VoiceOver)
   - Test with browser zoom at 200%
   - Verify color contrast in both themes
   - Test focus visible indicators

9. **Performance**:
   - Test with collection containing 1000+ translations
   - Measure scroll smoothness
   - Check memory usage during extended use

10. **Edge Cases**:
    - Test with missing metadata (no tags, no comment)
    - Test with empty translation values
    - Test with very long keys (>100 chars)
    - Test with localStorage disabled
    - Test rapid mode switching

---

## Notes

### Future Enhancements (Out of Scope for This Phase)

These features are acknowledged but deferred to future work:

1. **Keyboard Shortcuts Overlay**: "?" key to display all available shortcuts
2. **Column Sorting**: Sort translations by key, status, or locale value
3. **Bulk Actions**: Multi-select translations for batch edit/move/delete
4. **Custom Density Settings**: User-defined heights and visible fields
5. **Export to CSV**: Export filtered translation list with selected density
6. **Inline Editing**: Quick-edit translation values without opening dialog
7. **Drag-and-Drop Reordering**: Visual key reordering (affects file structure)

### Design Decisions and Rationale

1. **Why Three Density Modes?**
   - Research shows 3 options balance choice with decision paralysis
   - Maps to common workflows: scan (Compact), review (Medium), edit (Full)
   - Each mode has distinct visual identity (horizontal, grid, vertical)

2. **Why Roll-up Status Uses Worst Status?**
   - Negative bias helps surface issues requiring attention
   - "Stale" translations are critical to catch early
   - Positive-only indicator would hide problems

3. **Why Persist Per Collection?**
   - Different collections may have different optimal densities
   - Large collections benefit from Compact, small collections benefit from Full
   - User preference is contextual, not global

4. **Why Virtual Scroll with Fixed Heights?**
   - Dynamic heights complicate virtual scroll performance
   - Full mode uses expand button to avoid dynamic height during scroll
   - Trade-off: predictable performance vs. maximum info density

5. **Why Placeholder Dialogs Now?**
   - Establishes UX flow early, allowing user testing
   - Future implementation can focus on business logic, not UI shell
   - Enables end-to-end workflow testing even without backend integration

### Known Limitations

1. **Virtual Scroll with Expanded Items**:
   - When an item in Full mode is expanded, virtual scroll may not perfectly reposition
   - Mitigation: Expansion is relatively rare, and users can scroll to reposition
   - Future: Consider using CDK's dynamic size virtual scroll

2. **Touch Long-Press Conflicts**:
   - Native context menus may interfere with long-press gesture
   - Mitigation: Use `touch-action: manipulation` CSS to prevent defaults
   - May need platform-specific tuning (iOS vs. Android)

3. **Accessibility with Popovers**:
   - Popovers may be difficult to use with some screen readers
   - Mitigation: Ensure popovers are properly announced and keyboard-accessible
   - Consider alternative presentation for assistive tech users

4. **localStorage Quota**:
   - Storing preferences per collection could theoretically hit storage limits
   - Mitigation: Preferences are small (<1KB each), unlikely to be an issue
   - Future: Implement LRU eviction if needed

---

## Dependencies

### External Libraries (Already in Project)

- Angular Material: Dialogs, Menus, Tooltips, Button Toggles
- Angular CDK: Virtual Scroll, Overlay positioning
- NgRx Signals: State management
- Transloco: Internationalization (for button labels, tooltips)

### Internal Dependencies

- BrowserStore: Central state management
- Design Token System: CSS custom properties in `tokens.scss`
- Tag List Component: Existing component for tag display
- Translation Components: Existing locale filter and search components

### No New Dependencies Required

All functionality can be implemented with existing libraries and components.

---

## Rollout Plan

1. **Development**: Implement phases 1-10 sequentially
2. **Internal Testing**: Full manual test pass + accessibility audit
3. **User Acceptance Testing**: Share with 2-3 pilot users for feedback
4. **Documentation**: Update user guide with density mode usage
5. **Release**: Deploy to production with announcement
6. **Monitoring**: Track localStorage usage, performance metrics, user feedback
7. **Iteration**: Address feedback in follow-up release

---

## Appendix: File Structure Reference

```
apps/tracker/src/app/browser/
├── dialogs/
│   ├── edit-resource-dialog/
│   │   ├── edit-resource-dialog.ts
│   │   ├── edit-resource-dialog.html
│   │   └── edit-resource-dialog.scss
│   ├── move-resource-dialog/
│   │   ├── move-resource-dialog.ts
│   │   ├── move-resource-dialog.html
│   │   └── move-resource-dialog.scss
│   └── delete-resource-dialog/
│       ├── delete-resource-dialog.ts
│       ├── delete-resource-dialog.html
│       └── delete-resource-dialog.scss
├── shared/
│   ├── comment-popover/
│   │   ├── comment-popover.ts
│   │   ├── comment-popover.html
│   │   └── comment-popover.scss
│   └── tag-list-popover/
│       ├── tag-list-popover.ts
│       ├── tag-list-popover.html
│       └── tag-list-popover.scss
├── store/
│   └── browser.store.ts (modified)
└── translations/
    ├── header/
    │   ├── translation-main-header.ts (modified)
    │   ├── translation-main-header.html (modified)
    │   └── translation-main-header.scss (modified)
    └── list/
        ├── translation-item.ts (modified)
        ├── translation-item.html (modified)
        ├── translation-item.scss (modified)
        ├── translation-list.ts (modified)
        ├── translation-list.html (modified)
        └── translation-list.scss (modified)
```

---

**Document Version**: 1.0
**Created**: 2026-01-23
**Last Updated**: 2026-01-23
**Author**: Devon (Technical Project Manager)
