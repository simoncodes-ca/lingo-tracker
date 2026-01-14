# Collection Cards Visual Update Design

**Date:** 2026-01-13
**Status:** Approved
**Component:** `apps/tracker/src/app/collections/collections-manager`

## Overview

Update the collection cards in the Collections Manager to display folder icons, collection names, folder paths, and locale badges matching the design mockup in `docs/collections-management.png`.

## Current State

Collection cards currently display:
- Collection name as header
- Folder path as secondary text
- Edit/delete action buttons

The store only maintains the collections object without access to global config for locale resolution.

## Proposed Changes

### 1. Store Enhancement

**File:** `apps/tracker/src/app/collections/store/collections.store.ts`

**Changes:**
- Update `CollectionsState` interface to store full `LingoTrackerConfigDto` instead of just collections
- Add computed property `collectionEntriesWithLocales` that resolves effective locales for each collection
- Locale resolution logic: use collection-specific locales if defined, otherwise fall back to global locales

**Data Structure:**
```typescript
interface CollectionsState {
  config: LingoTrackerConfigDto | null;  // Full config instead of just collections
  isLoading: boolean;
  error: string | null;
}

// New computed property
collectionEntriesWithLocales: computed(() => {
  const config = state.config();
  if (!config) return [];

  return Object.entries(config.collections).map(([name, collection]) => ({
    name,
    config: collection,
    locales: collection.locales || config.locales,
    baseLocale: collection.baseLocale || config.baseLocale,
  }));
})
```

### 2. Template Updates

**File:** `apps/tracker/src/app/collections/collections-manager.html`

**Changes:**
- Add folder icon next to collection name
- Restructure card layout with title section (icon + name)
- Add locale badges section below folder path
- Update iteration to use new `collectionEntriesWithLocales` computed property

**New Card Structure:**
```html
<div class="collection-card">
  <div class="card-header">
    <div class="card-title">
      <mat-icon class="folder-icon">folder</mat-icon>
      <h3 class="collection-name">{{ item.name }}</h3>
    </div>
    <div class="card-actions">
      <!-- existing edit/delete buttons -->
    </div>
  </div>

  <div class="card-content">
    <p class="folder-path">{{ item.config.translationsFolder }}</p>
    <div class="locale-badges">
      @for (locale of item.locales; track locale) {
        <span class="locale-badge">{{ locale }}</span>
      }
    </div>
  </div>
</div>
```

### 3. Styling Updates

**File:** `apps/tracker/src/app/collections/collections-manager.scss`

**New Styles:**

1. **Card Title Layout:**
```scss
.card-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex: 1;

  .folder-icon {
    font-size: 24px;
    width: 24px;
    height: 24px;
    color: var(--color-primary);
    flex-shrink: 0;
  }
}
```

2. **Locale Badges:**
```scss
.locale-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  margin-top: var(--spacing-4);
}

.locale-badge {
  display: inline-block;
  padding: var(--spacing-1) var(--spacing-3);
  background: var(--color-primary-alpha-10, rgba(63, 81, 181, 0.1));
  color: var(--color-primary, #3f51b5);
  border-radius: var(--radius-full, 999px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  font-family: var(--font-mono, monospace);
}
```

3. **Card Content Updates:**
```scss
.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}
```

## Design Decisions

### Why Store Full Config?
Storing the full config in the store provides:
- Single source of truth for global settings
- Frontend control over locale resolution logic
- No additional API calls needed
- Easier to maintain and test

### Locale Resolution Strategy
Collections inherit global locales by default but can override them. The resolution happens in a computed property for:
- Reactivity - updates automatically when config changes
- Performance - computed once and cached
- Testability - pure function logic

### Visual Design
- Folder icon establishes visual hierarchy
- Locale badges use monospace font for consistency with technical content
- Small badge size keeps focus on collection name
- Pill shape with subtle background matches modern UI patterns

## Testing Considerations

1. **Store Tests:** Verify locale resolution logic handles:
   - Collection with explicit locales
   - Collection inheriting global locales
   - Missing global config (null check)

2. **Visual Tests:** Verify:
   - Cards display correctly with varying numbers of locales (1, 5, 10+)
   - Badge wrapping on narrow screens
   - Folder icon alignment

3. **Integration:** Verify:
   - Edit/delete functionality still works
   - Navigation to browser still works
   - Loading/error states display correctly

## Implementation Notes

- All changes are backwards compatible
- No API changes required
- Uses existing design system tokens
- Maintains accessibility (badges are decorative, info available in collection config)
