# Translation Browser: LocaleFilter and Search Components Implementation Plan

**Date:** 2026-01-15
**Status:** Ready for Implementation
**Component:** `apps/tracker/src/app/browser/`
**Related Spec:** `dev-tasks/13-ui-scafolding.md`
**Mockup:** `dev-tasks/translation-browser.png`

## Goal

Implement the LocaleFilter multi-select dropdown and Search input components for the Translation Browser feature, following TDD principles and Angular 20 best practices with NgRx Signals state management.

## Architecture

### Component Structure

```
apps/tracker/src/app/browser/
├── translation-browser.ts                    # Main container component
├── translation-browser.html
├── translation-browser.scss
├── components/
│   ├── locale-filter/
│   │   ├── locale-filter.ts                 # Multi-select dropdown component
│   │   ├── locale-filter.html
│   │   ├── locale-filter.scss
│   │   └── locale-filter.spec.ts
│   └── translation-search/
│       ├── translation-search.ts             # Search input with debouncing
│       ├── translation-search.html
│       ├── translation-search.scss
│       └── translation-search.spec.ts
└── store/
    └── browser.store.ts                      # NgRx Signals store for browser state
```

### State Management

The `BrowserStore` will manage:
- `selectedLocales: string[]` - Currently selected locales to display (default: all)
- `searchQuery: string` - Current search query text
- `isSearchMode: boolean` - Whether in search mode (true) or folder browse mode (false)
- `availableLocales: string[]` - List of locales from collection config

### Data Flow

1. **LocaleFilter**: User selects/deselects locales → updates `selectedLocales` in store → TranslationList filters display
2. **Search**: User types → debounced (300ms) → updates `searchQuery` and `isSearchMode` → FolderTree disables → API call for search results
3. **Clear Search**: User clears search → resets `searchQuery` and `isSearchMode` → FolderTree enables → returns to folder browsing

## Tech Stack

- **Angular 20** with standalone components
- **Angular Material** for UI components (MatSelect, MatFormField, MatInput, MatIcon, MatChip)
- **NgRx Signals** for state management
- **RxJS** for debouncing and stream handling
- **Vitest** for unit testing
- **OnPush** change detection strategy

## Phased Implementation

### Phase 1: Browser Store Setup

Create the NgRx Signals store for managing browser state.

#### Task 1.1: Create browser store with initial state (3 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/browser.store.spec.ts`

```typescript
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserStore } from './browser.store';

describe('BrowserStore', () => {
  let store: BrowserStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BrowserStore],
    });
    store = TestBed.inject(BrowserStore);
  });

  describe('Initial State', () => {
    it('should initialize with empty selectedLocales', () => {
      expect(store.selectedLocales()).toEqual([]);
    });

    it('should initialize with empty searchQuery', () => {
      expect(store.searchQuery()).toBe('');
    });

    it('should initialize with isSearchMode as false', () => {
      expect(store.isSearchMode()).toBe(false);
    });

    it('should initialize with empty availableLocales', () => {
      expect(store.availableLocales()).toEqual([]);
    });
  });
});
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/store/browser.store.spec.ts
```

**Expected:** Test fails (file doesn't exist)

**Implementation File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/browser.store.ts`

```typescript
import { computed } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';

/**
 * State interface for the Browser store.
 */
interface BrowserState {
  /** List of currently selected locales to display (empty = all) */
  selectedLocales: string[];

  /** Current search query text */
  searchQuery: string;

  /** Whether in search mode (true) or folder browse mode (false) */
  isSearchMode: boolean;

  /** Available locales for the current collection */
  availableLocales: string[];
}

/**
 * Initial state for the Browser store.
 */
const initialState: BrowserState = {
  selectedLocales: [],
  searchQuery: '',
  isSearchMode: false,
  availableLocales: [],
};

/**
 * Signal store for managing translation browser state.
 *
 * @example
 * // In component
 * export class TranslationBrowser {
 *   readonly store = inject(BrowserStore);
 *
 *   ngOnInit() {
 *     this.store.setAvailableLocales(['en', 'es', 'fr']);
 *   }
 * }
 */
export const BrowserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ selectedLocales, availableLocales }) => ({
    /**
     * Returns true if all locales are selected or none are selected (showing all).
     */
    isShowingAllLocales: computed(() => {
      const selected = selectedLocales();
      const available = availableLocales();
      return selected.length === 0 || selected.length === available.length;
    }),

    /**
     * Returns the display text for the locale filter.
     */
    localeFilterText: computed(() => {
      const selected = selectedLocales();
      const available = availableLocales();

      if (selected.length === 0 || selected.length === available.length) {
        return 'All locales';
      }

      if (selected.length === 1) {
        return selected[0];
      }

      return `${selected.length} locales`;
    }),
  })),
  withMethods((store) => ({
    /**
     * Sets the available locales for the collection.
     */
    setAvailableLocales(locales: string[]): void {
      patchState(store, { availableLocales: locales });
    },

    /**
     * Updates the selected locales.
     */
    setSelectedLocales(locales: string[]): void {
      patchState(store, { selectedLocales: locales });
    },

    /**
     * Sets the search query and enables search mode.
     */
    setSearchQuery(query: string): void {
      patchState(store, {
        searchQuery: query,
        isSearchMode: query.length > 0,
      });
    },

    /**
     * Clears the search query and returns to browse mode.
     */
    clearSearch(): void {
      patchState(store, {
        searchQuery: '',
        isSearchMode: false,
      });
    },

    /**
     * Resets the entire store to initial state.
     */
    reset(): void {
      patchState(store, initialState);
    },
  }))
);
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/store/browser.store.spec.ts
```

**Expected:** Tests pass

**Commit:**
```bash
git add apps/tracker/src/app/browser/store/
git commit -m "feat(tracker): add browser store with initial state"
```

#### Task 1.2: Add store methods tests (3 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/browser.store.spec.ts` (append)

```typescript
  describe('setAvailableLocales', () => {
    it('should update available locales', () => {
      store.setAvailableLocales(['en', 'es', 'fr']);

      expect(store.availableLocales()).toEqual(['en', 'es', 'fr']);
    });
  });

  describe('setSelectedLocales', () => {
    it('should update selected locales', () => {
      store.setSelectedLocales(['en', 'es']);

      expect(store.selectedLocales()).toEqual(['en', 'es']);
    });
  });

  describe('setSearchQuery', () => {
    it('should update search query', () => {
      store.setSearchQuery('hello');

      expect(store.searchQuery()).toBe('hello');
    });

    it('should enable search mode when query is not empty', () => {
      store.setSearchQuery('test');

      expect(store.isSearchMode()).toBe(true);
    });

    it('should disable search mode when query is empty', () => {
      store.setSearchQuery('test');
      store.setSearchQuery('');

      expect(store.isSearchMode()).toBe(false);
    });
  });

  describe('clearSearch', () => {
    it('should clear search query', () => {
      store.setSearchQuery('test query');
      store.clearSearch();

      expect(store.searchQuery()).toBe('');
    });

    it('should disable search mode', () => {
      store.setSearchQuery('test');
      store.clearSearch();

      expect(store.isSearchMode()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      store.setAvailableLocales(['en', 'es']);
      store.setSelectedLocales(['en']);
      store.setSearchQuery('test');

      store.reset();

      expect(store.selectedLocales()).toEqual([]);
      expect(store.searchQuery()).toBe('');
      expect(store.isSearchMode()).toBe(false);
      expect(store.availableLocales()).toEqual([]);
    });
  });

  describe('Computed Properties', () => {
    beforeEach(() => {
      store.setAvailableLocales(['en', 'es', 'fr', 'de']);
    });

    describe('isShowingAllLocales', () => {
      it('should return true when no locales are selected', () => {
        store.setSelectedLocales([]);

        expect(store.isShowingAllLocales()).toBe(true);
      });

      it('should return true when all locales are selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);

        expect(store.isShowingAllLocales()).toBe(true);
      });

      it('should return false when some locales are selected', () => {
        store.setSelectedLocales(['en', 'es']);

        expect(store.isShowingAllLocales()).toBe(false);
      });
    });

    describe('localeFilterText', () => {
      it('should return "All locales" when none are selected', () => {
        store.setSelectedLocales([]);

        expect(store.localeFilterText()).toBe('All locales');
      });

      it('should return "All locales" when all are selected', () => {
        store.setSelectedLocales(['en', 'es', 'fr', 'de']);

        expect(store.localeFilterText()).toBe('All locales');
      });

      it('should return locale code when one is selected', () => {
        store.setSelectedLocales(['en']);

        expect(store.localeFilterText()).toBe('en');
      });

      it('should return count when multiple (but not all) are selected', () => {
        store.setSelectedLocales(['en', 'es']);

        expect(store.localeFilterText()).toBe('2 locales');
      });
    });
  });
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/store/browser.store.spec.ts
```

**Expected:** Tests pass

**Commit:**
```bash
git add apps/tracker/src/app/browser/store/browser.store.spec.ts
git commit -m "test(tracker): add comprehensive browser store tests"
```

---

### Phase 2: LocaleFilter Component

Create the multi-select dropdown component for filtering locales.

#### Task 2.1: Create LocaleFilter component skeleton with basic tests (4 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/locale-filter/locale-filter.spec.ts`

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { LocaleFilter } from './locale-filter';
import { BrowserStore } from '../../store/browser.store';

describe('LocaleFilter', () => {
  let component: LocaleFilter;
  let fixture: ComponentFixture<LocaleFilter>;
  let mockStore: Partial<BrowserStore>;

  beforeEach(async () => {
    mockStore = {
      availableLocales: signal(['en', 'es', 'fr', 'de']),
      selectedLocales: signal([]),
      localeFilterText: signal('All locales'),
      isShowingAllLocales: signal(true),
      setSelectedLocales: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LocaleFilter],
      providers: [
        { provide: BrowserStore, useValue: mockStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocaleFilter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should inject store', () => {
      expect(component.store).toBe(mockStore);
    });
  });

  describe('Template Rendering', () => {
    it('should display filter trigger button', () => {
      const button = fixture.nativeElement.querySelector('[data-testid="locale-filter-trigger"]');
      expect(button).toBeTruthy();
    });

    it('should show filter icon', () => {
      const icon = fixture.nativeElement.querySelector('mat-icon');
      expect(icon?.textContent?.trim()).toBe('filter_list');
    });

    it('should display current selection text', () => {
      const text = fixture.nativeElement.querySelector('.filter-text');
      expect(text?.textContent?.trim()).toBe('All locales');
    });

    it('should show dropdown arrow', () => {
      const arrow = fixture.nativeElement.querySelector('.arrow-icon');
      expect(arrow?.textContent?.trim()).toBe('arrow_drop_down');
    });
  });
});
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/components/locale-filter/locale-filter.spec.ts
```

**Expected:** Test fails (file doesn't exist)

**Implementation File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/locale-filter/locale-filter.ts`

```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BrowserStore } from '../../store/browser.store';

/**
 * LocaleFilter component provides a multi-select dropdown for filtering
 * which locales are displayed in the translation list.
 *
 * Features:
 * - Displays "All locales" by default when none or all are selected
 * - Shows count of selected locales when partially selected
 * - Allows toggling individual locales
 * - Provides "Select All" and "Clear All" quick actions
 *
 * @example
 * <app-locale-filter />
 */
@Component({
  selector: 'app-locale-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
  ],
  templateUrl: './locale-filter.html',
  styleUrl: './locale-filter.scss',
})
export class LocaleFilter {
  readonly store = inject(BrowserStore);
}
```

**Template File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/locale-filter/locale-filter.html`

```html
<button
  mat-stroked-button
  [matMenuTriggerFor]="localeMenu"
  data-testid="locale-filter-trigger"
  class="locale-filter-trigger"
>
  <mat-icon class="filter-icon">filter_list</mat-icon>
  <span class="filter-text">{{ store.localeFilterText() }}</span>
  <mat-icon class="arrow-icon">arrow_drop_down</mat-icon>
</button>

<mat-menu #localeMenu="matMenu" class="locale-filter-menu">
  <div class="menu-header" (click)="$event.stopPropagation()">
    <button
      mat-button
      class="action-button"
      (click)="selectAll()"
      data-testid="select-all"
    >
      Select All
    </button>
    <button
      mat-button
      class="action-button"
      (click)="clearAll()"
      data-testid="clear-all"
    >
      Clear All
    </button>
  </div>

  @for (locale of store.availableLocales(); track locale) {
    <button
      mat-menu-item
      (click)="toggleLocale(locale); $event.stopPropagation()"
      [attr.data-testid]="'locale-option-' + locale"
      class="locale-option"
    >
      <mat-checkbox
        [checked]="isLocaleSelected(locale)"
        (click)="$event.preventDefault()"
        class="locale-checkbox"
      >
        {{ locale }}
      </mat-checkbox>
    </button>
  }
</mat-menu>
```

**Style File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/locale-filter/locale-filter.scss`

```scss
.locale-filter-trigger {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--font-size-sm);

  .filter-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }

  .filter-text {
    font-weight: 500;
  }

  .arrow-icon {
    font-size: 20px;
    width: 20px;
    height: 20px;
    margin-left: auto;
  }
}

.locale-filter-menu {
  .menu-header {
    display: flex;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    border-bottom: 1px solid var(--color-border);
    gap: var(--spacing-2);

    .action-button {
      font-size: var(--font-size-xs);
      padding: var(--spacing-1) var(--spacing-2);
      min-width: auto;
    }
  }

  .locale-option {
    .locale-checkbox {
      width: 100%;
    }
  }
}
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/components/locale-filter/locale-filter.spec.ts
```

**Expected:** Tests pass

**Commit:**
```bash
git add apps/tracker/src/app/browser/components/locale-filter/
git commit -m "feat(tracker): add LocaleFilter component skeleton"
```

#### Task 2.2: Implement locale selection logic with tests (4 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/locale-filter/locale-filter.spec.ts` (append)

```typescript
  describe('Locale Selection Logic', () => {
    it('should check if locale is selected', () => {
      mockStore.selectedLocales = signal(['en', 'es']);
      fixture.detectChanges();

      expect(component.isLocaleSelected('en')).toBe(true);
      expect(component.isLocaleSelected('fr')).toBe(false);
    });

    it('should toggle locale on when not selected', () => {
      mockStore.selectedLocales = signal(['en']);

      component.toggleLocale('es');

      expect(mockStore.setSelectedLocales).toHaveBeenCalledWith(['en', 'es']);
    });

    it('should toggle locale off when already selected', () => {
      mockStore.selectedLocales = signal(['en', 'es']);

      component.toggleLocale('es');

      expect(mockStore.setSelectedLocales).toHaveBeenCalledWith(['en']);
    });

    it('should select all locales', () => {
      mockStore.availableLocales = signal(['en', 'es', 'fr']);

      component.selectAll();

      expect(mockStore.setSelectedLocales).toHaveBeenCalledWith(['en', 'es', 'fr']);
    });

    it('should clear all locales', () => {
      component.clearAll();

      expect(mockStore.setSelectedLocales).toHaveBeenCalledWith([]);
    });
  });

  describe('User Interactions', () => {
    it('should toggle locale when menu item is clicked', () => {
      const menuItem = fixture.nativeElement.querySelector('[data-testid="locale-option-en"]');

      menuItem?.click();

      expect(mockStore.setSelectedLocales).toHaveBeenCalled();
    });

    it('should select all when "Select All" button is clicked', () => {
      // Open menu first
      const trigger = fixture.nativeElement.querySelector('[data-testid="locale-filter-trigger"]');
      trigger?.click();
      fixture.detectChanges();

      const selectAllBtn = fixture.nativeElement.querySelector('[data-testid="select-all"]');
      selectAllBtn?.click();

      expect(mockStore.setSelectedLocales).toHaveBeenCalled();
    });

    it('should clear all when "Clear All" button is clicked', () => {
      const trigger = fixture.nativeElement.querySelector('[data-testid="locale-filter-trigger"]');
      trigger?.click();
      fixture.detectChanges();

      const clearAllBtn = fixture.nativeElement.querySelector('[data-testid="clear-all"]');
      clearAllBtn?.click();

      expect(mockStore.setSelectedLocales).toHaveBeenCalledWith([]);
    });
  });
```

**Implementation:** Update `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/locale-filter/locale-filter.ts`

```typescript
export class LocaleFilter {
  readonly store = inject(BrowserStore);

  /**
   * Checks if a locale is currently selected.
   */
  isLocaleSelected(locale: string): boolean {
    return this.store.selectedLocales().includes(locale);
  }

  /**
   * Toggles a locale's selection state.
   */
  toggleLocale(locale: string): void {
    const current = this.store.selectedLocales();
    const isSelected = current.includes(locale);

    if (isSelected) {
      // Remove locale
      this.store.setSelectedLocales(current.filter(l => l !== locale));
    } else {
      // Add locale
      this.store.setSelectedLocales([...current, locale]);
    }
  }

  /**
   * Selects all available locales.
   */
  selectAll(): void {
    this.store.setSelectedLocales([...this.store.availableLocales()]);
  }

  /**
   * Clears all locale selections.
   */
  clearAll(): void {
    this.store.setSelectedLocales([]);
  }
}
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/components/locale-filter/locale-filter.spec.ts
```

**Expected:** Tests pass

**Commit:**
```bash
git add apps/tracker/src/app/browser/components/locale-filter/
git commit -m "feat(tracker): implement locale selection logic in LocaleFilter"
```

---

### Phase 3: TranslationSearch Component

Create the search input component with debouncing.

#### Task 3.1: Create TranslationSearch component skeleton with tests (4 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.spec.ts`

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TranslationSearch } from './translation-search';
import { BrowserStore } from '../../store/browser.store';

describe('TranslationSearch', () => {
  let component: TranslationSearch;
  let fixture: ComponentFixture<TranslationSearch>;
  let mockStore: Partial<BrowserStore>;

  beforeEach(async () => {
    mockStore = {
      searchQuery: signal(''),
      isSearchMode: signal(false),
      setSearchQuery: vi.fn(),
      clearSearch: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TranslationSearch],
      providers: [
        { provide: BrowserStore, useValue: mockStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationSearch);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should inject store', () => {
      expect(component.store).toBe(mockStore);
    });

    it('should initialize search control with empty value', () => {
      expect(component.searchControl.value).toBe('');
    });
  });

  describe('Template Rendering', () => {
    it('should render search input field', () => {
      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input).toBeTruthy();
    });

    it('should have correct placeholder', () => {
      const input = fixture.nativeElement.querySelector('input');
      expect(input?.placeholder).toBe('Search translations...');
    });

    it('should show search icon', () => {
      const icon = fixture.nativeElement.querySelector('mat-icon');
      expect(icon?.textContent?.trim()).toBe('search');
    });

    it('should not show clear button when search is empty', () => {
      const clearBtn = fixture.nativeElement.querySelector('[data-testid="clear-search"]');
      expect(clearBtn).toBeFalsy();
    });

    it('should show clear button when search has value', () => {
      component.searchControl.setValue('test');
      fixture.detectChanges();

      const clearBtn = fixture.nativeElement.querySelector('[data-testid="clear-search"]');
      expect(clearBtn).toBeTruthy();
    });
  });
});
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/components/translation-search/translation-search.spec.ts
```

**Expected:** Test fails (file doesn't exist)

**Implementation File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.ts`

```typescript
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BrowserStore } from '../../store/browser.store';

/**
 * TranslationSearch component provides a search input with debouncing
 * for server-side translation search.
 *
 * Features:
 * - 300ms debounce to reduce API calls
 * - Clear button appears when text is entered
 * - Search mode disables folder tree navigation
 * - Clearing search returns to folder browse mode
 *
 * @example
 * <app-translation-search />
 */
@Component({
  selector: 'app-translation-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './translation-search.html',
  styleUrl: './translation-search.scss',
})
export class TranslationSearch implements OnInit, OnDestroy {
  readonly store = inject(BrowserStore);

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  ngOnInit(): void {
    // Implementation will be added in next task
  }

  ngOnDestroy(): void {
    // Implementation will be added in next task
  }
}
```

**Template File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.html`

```html
<mat-form-field appearance="outline" class="search-field">
  <mat-icon matPrefix class="search-icon">search</mat-icon>

  <input
    matInput
    type="text"
    placeholder="Search translations..."
    [formControl]="searchControl"
    data-testid="search-input"
  />

  @if (searchControl.value) {
    <button
      matSuffix
      mat-icon-button
      (click)="onClearSearch()"
      [attr.aria-label]="'Clear search'"
      data-testid="clear-search"
      class="clear-button"
    >
      <mat-icon>close</mat-icon>
    </button>
  }
</mat-form-field>
```

**Style File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.scss`

```scss
.search-field {
  width: 100%;
  max-width: 600px;

  .search-icon {
    color: var(--color-text-secondary);
    margin-right: var(--spacing-2);
  }

  .clear-button {
    .mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
  }
}
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/components/translation-search/translation-search.spec.ts
```

**Expected:** Tests pass

**Commit:**
```bash
git add apps/tracker/src/app/browser/components/translation-search/
git commit -m "feat(tracker): add TranslationSearch component skeleton"
```

#### Task 3.2: Implement debounced search logic with tests (5 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.spec.ts` (append)

```typescript
import { fakeAsync, tick } from '@angular/core/testing';

  describe('Search Debouncing', () => {
    it('should not call setSearchQuery immediately', () => {
      component.searchControl.setValue('test');

      expect(mockStore.setSearchQuery).not.toHaveBeenCalled();
    });

    it('should call setSearchQuery after 300ms debounce', fakeAsync(() => {
      component.searchControl.setValue('test');

      tick(300);

      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('test');
    }));

    it('should debounce multiple rapid changes', fakeAsync(() => {
      component.searchControl.setValue('t');
      tick(100);
      component.searchControl.setValue('te');
      tick(100);
      component.searchControl.setValue('tes');
      tick(100);
      component.searchControl.setValue('test');

      tick(300);

      expect(mockStore.setSearchQuery).toHaveBeenCalledTimes(1);
      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('test');
    }));

    it('should handle empty search query', fakeAsync(() => {
      component.searchControl.setValue('');

      tick(300);

      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('');
    }));
  });

  describe('Clear Search', () => {
    it('should clear search control', () => {
      component.searchControl.setValue('test query');

      component.onClearSearch();

      expect(component.searchControl.value).toBe('');
    });

    it('should call store clearSearch method', () => {
      component.onClearSearch();

      expect(mockStore.clearSearch).toHaveBeenCalled();
    });
  });

  describe('Lifecycle', () => {
    it('should unsubscribe on destroy', () => {
      const subscription = component['subscription'];
      const unsubscribeSpy = vi.spyOn(subscription, 'unsubscribe');

      component.ngOnDestroy();

      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });
```

**Implementation:** Update `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.ts`

```typescript
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export class TranslationSearch implements OnInit, OnDestroy {
  readonly store = inject(BrowserStore);

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  private subscription = new Subscription();

  ngOnInit(): void {
    // Subscribe to search control changes with debouncing
    this.subscription.add(
      this.searchControl.valueChanges
        .pipe(
          debounceTime(300), // Wait 300ms after user stops typing
          distinctUntilChanged() // Only emit if value actually changed
        )
        .subscribe((query) => {
          this.store.setSearchQuery(query);
        })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /**
   * Clears the search input and returns to browse mode.
   */
  onClearSearch(): void {
    this.searchControl.setValue('');
    this.store.clearSearch();
  }
}
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/components/translation-search/translation-search.spec.ts
```

**Expected:** Tests pass

**Commit:**
```bash
git add apps/tracker/src/app/browser/components/translation-search/
git commit -m "feat(tracker): implement debounced search logic"
```

---

### Phase 4: Integration with TranslationBrowser

Integrate both components into the main TranslationBrowser component.

#### Task 4.1: Update TranslationBrowser to use new components (3 min)

**Update File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.ts`

```typescript
import { Component, ChangeDetectionStrategy, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../i18n-types/tracker-resources';
import { BrowserStore } from './store/browser.store';
import { LocaleFilter } from './components/locale-filter/locale-filter';
import { TranslationSearch } from './components/translation-search/translation-search';
import { CollectionsStore } from '../collections/store/collections.store';

/**
 * Translation Browser component for viewing and managing translations within a collection.
 *
 * Features:
 * - Display all translation keys in the collection
 * - Filter and search translations
 * - Edit translation values
 * - View translation metadata and status
 * - Add new translation keys
 */
@Component({
  selector: 'app-translation-browser',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    TranslocoModule,
    LocaleFilter,
    TranslationSearch,
  ],
  templateUrl: './translation-browser.html',
  styleUrl: './translation-browser.scss',
})
export class TranslationBrowser implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly browserStore = inject(BrowserStore);
  readonly collectionsStore = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;

  /**
   * The name of the collection being browsed.
   */
  readonly collectionName = signal<string>('');

  ngOnInit(): void {
    // Read collection name from route params
    const name = this.route.snapshot.paramMap.get('collectionName');
    if (name) {
      this.collectionName.set(decodeURIComponent(name));
      this.loadCollectionLocales(name);
    }
  }

  ngOnDestroy(): void {
    // Reset browser store when leaving the page
    this.browserStore.reset();
  }

  /**
   * Loads available locales for the current collection.
   */
  private loadCollectionLocales(collectionName: string): void {
    const collection = this.collectionsStore.collections()[collectionName];
    const config = this.collectionsStore.config();

    if (collection && config) {
      const locales = collection.locales || config.locales || [];
      this.browserStore.setAvailableLocales(locales);
    }
  }

  /**
   * Navigates back to the collections manager.
   */
  navigateToCollections(): void {
    this.router.navigate(['/collections']);
  }
}
```

**Update Template:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.html`

```html
<div class="browser-container">
  <header class="browser-header">
    <button
      mat-icon-button
      (click)="navigateToCollections()"
      [attr.aria-label]="TOKENS.BROWSER.BACKBUTTON | transloco"
    >
      <mat-icon>arrow_back</mat-icon>
    </button>
    <h1 class="collection-title">{{ collectionName() }}</h1>
  </header>

  <div class="browser-toolbar">
    <app-translation-search />
    <app-locale-filter />
  </div>

  <main class="browser-content">
    <mat-card class="placeholder-card">
      <mat-card-content>
        <div class="placeholder-content">
          <mat-icon class="placeholder-icon">construction</mat-icon>
          <h2>{{ TOKENS.BROWSER.PLACEHOLDER.TITLE | transloco }}</h2>
          <p>{{ TOKENS.BROWSER.PLACEHOLDER.MESSAGE | transloco }}</p>
          <p class="collection-info">
            {{ TOKENS.BROWSER.PLACEHOLDER.COLLECTION | transloco }}:
            <strong>{{ collectionName() }}</strong>
          </p>

          <!-- Debug info -->
          <div class="debug-info">
            <p><strong>Search Mode:</strong> {{ browserStore.isSearchMode() }}</p>
            <p><strong>Search Query:</strong> "{{ browserStore.searchQuery() }}"</p>
            <p><strong>Selected Locales:</strong> {{ browserStore.selectedLocales().join(', ') || 'All' }}</p>
            <p><strong>Available Locales:</strong> {{ browserStore.availableLocales().join(', ') }}</p>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  </main>
</div>
```

**Update Styles:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.scss`

```scss
:host {
  display: block;
  height: 100%;
}

.browser-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background);
}

.browser-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-6);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);

  .collection-title {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--color-text-primary);
  }
}

.browser-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-6);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);

  app-translation-search {
    flex: 1;
  }
}

.browser-content {
  flex: 1;
  padding: var(--spacing-8);
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.placeholder-card {
  max-width: 800px;
  width: 100%;
}

.placeholder-content {
  text-align: center;
  padding: var(--spacing-8);

  .placeholder-icon {
    font-size: 64px;
    width: 64px;
    height: 64px;
    color: var(--color-text-secondary);
    margin: 0 auto var(--spacing-6);
  }

  h2 {
    margin: 0 0 var(--spacing-4);
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  p {
    margin: 0 0 var(--spacing-4);
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
    line-height: 1.6;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .collection-info {
    margin-top: var(--spacing-6);
    padding: var(--spacing-4);
    background-color: var(--color-background);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);

    strong {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  .debug-info {
    margin-top: var(--spacing-8);
    padding: var(--spacing-4);
    background-color: var(--color-background);
    border-radius: var(--radius-md);
    text-align: left;
    font-size: var(--font-size-xs);
    font-family: monospace;

    p {
      margin: var(--spacing-2) 0;
      color: var(--color-text-primary);
    }
  }
}
```

**Manual Testing:**
```bash
pnpm nx serve tracker
```

Navigate to a collection browser page and verify:
1. Search input appears in toolbar
2. Locale filter appears in toolbar
3. Components are responsive
4. Debug info shows state changes

**Commit:**
```bash
git add apps/tracker/src/app/browser/
git commit -m "feat(tracker): integrate LocaleFilter and TranslationSearch into browser"
```

---

### Phase 5: Manual Testing & Polish

#### Task 5.1: Run all tests and verify integration (2 min)

**Command:**
```bash
pnpm nx test tracker
```

**Expected:** All tests pass

#### Task 5.2: Manual UI testing (5 min)

**Start dev server:**
```bash
pnpm nx serve tracker
```

**Test Checklist:**

1. **LocaleFilter Component**
   - [ ] Opens dropdown menu on click
   - [ ] Shows all available locales
   - [ ] Checkboxes reflect selection state
   - [ ] "Select All" selects all locales
   - [ ] "Clear All" clears all selections
   - [ ] Display text shows "All locales" when appropriate
   - [ ] Display text shows count when partially selected
   - [ ] Display text shows locale code when one selected

2. **TranslationSearch Component**
   - [ ] Search input accepts text
   - [ ] Clear button appears when text is entered
   - [ ] Clear button clears input
   - [ ] Placeholder text displays correctly
   - [ ] Debouncing prevents immediate state updates (check debug info)

3. **Integration**
   - [ ] Both components appear in toolbar
   - [ ] Toolbar layout is responsive
   - [ ] Debug info shows correct state changes
   - [ ] Store state persists across component updates
   - [ ] Navigating away resets store

4. **Accessibility**
   - [ ] All buttons have aria-labels
   - [ ] Tab navigation works
   - [ ] Keyboard can open/close menu
   - [ ] Screen reader announces filter state

#### Task 5.3: Final polish and documentation (3 min)

**Create index files for easier imports:**

`/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/index.ts`

```typescript
export { LocaleFilter } from './locale-filter/locale-filter';
export { TranslationSearch } from './translation-search/translation-search';
```

**Update imports in translation-browser.ts to use index:**

```typescript
import { LocaleFilter, TranslationSearch } from './components';
```

**Commit:**
```bash
git add apps/tracker/src/app/browser/
git commit -m "chore(tracker): add barrel exports and final polish"
```

---

## Success Criteria

- [ ] All unit tests pass
- [ ] LocaleFilter displays available locales with multi-select
- [ ] LocaleFilter updates store state correctly
- [ ] TranslationSearch implements 300ms debouncing
- [ ] TranslationSearch shows/hides clear button appropriately
- [ ] Both components integrate cleanly into TranslationBrowser
- [ ] BrowserStore manages state correctly
- [ ] Components follow Angular 20 best practices (signals, OnPush, inject)
- [ ] Code is well-documented with JSDoc comments
- [ ] Accessibility requirements met (ARIA labels, keyboard navigation)
- [ ] Manual testing checklist completed

## Future Integration Points

### FolderTree Component (Future Phase)
- Will read `browserStore.isSearchMode()` to disable during search
- Will clear search when folder is clicked

### TranslationList Component (Future Phase)
- Will read `browserStore.selectedLocales()` to filter displayed locales
- Will read `browserStore.searchQuery()` to trigger search API call
- Will display search results when in search mode

### API Integration (Future Phase)
- Add search endpoint: `GET /api/collections/:name/search?q=query`
- Search component will trigger API call after debounce
- Results will populate TranslationList

## Notes

- All components use standalone architecture
- OnPush change detection for performance
- Signals for reactive state management
- TDD approach ensures correctness
- Components are isolated and testable
- Store provides single source of truth
- Debouncing reduces API load
- Clean separation of concerns

## Test Execution Summary

```bash
# Run all browser store tests
pnpm nx test tracker --testFile=src/app/browser/store/browser.store.spec.ts

# Run locale filter tests
pnpm nx test tracker --testFile=src/app/browser/components/locale-filter/locale-filter.spec.ts

# Run translation search tests
pnpm nx test tracker --testFile=src/app/browser/components/translation-search/translation-search.spec.ts

# Run all tracker tests
pnpm nx test tracker

# Serve for manual testing
pnpm nx serve tracker
```
