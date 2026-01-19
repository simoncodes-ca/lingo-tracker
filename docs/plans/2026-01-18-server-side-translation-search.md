# Server-Side Translation Search Implementation Plan

**Date:** 2026-01-18
**Status:** Planned
**Component:** Backend API + Frontend Search UI
**Related Files:**
- Backend: `apps/api/src/app/collections/resources/resources.controller.ts`
- Frontend: `apps/tracker/src/app/browser/components/translation-search/`
- DTOs: `libs/data-transfer/src/lib/`
- Core: `libs/core/src/lib/resource/`

## Overview

This implementation adds server-side translation search functionality to LingoTracker. Users will be able to search across all translation keys and values within a collection, with the folder tree disabled during search mode to provide a focused search experience.

### Business Value

- **Fast Discovery:** Users can quickly find translations without navigating the folder hierarchy
- **Content Search:** Search across both keys and translation values in all locales
- **Context Preservation:** Search results show full key paths and all locale values
- **Performance:** Server-side search handles large collections efficiently

### Key Features

- Search across translation keys (dot-delimited paths)
- Search across translation values in all locales
- Debounced search input (300ms) to reduce server load
- Results ranked by relevance (exact matches first, then partial matches)
- Search mode disables folder tree navigation
- Clear search returns to folder browse mode
- Loading states and error handling

## Technical Context

### Current Architecture

The browser currently has:
- **BrowserStore:** Unified store managing folder navigation and translations
- **FolderTree:** Component with integrated folder search/filter (client-side)
- **TranslationList:** Component displaying translations with virtual scrolling
- **TranslationBrowser:** Main container orchestrating the browser UI

### Architecture Changes

```
Backend (NestJS):
libs/core/src/lib/resource/
├── search.ts                    # NEW: Core search logic
└── search.spec.ts               # NEW: Search tests

libs/data-transfer/src/lib/
├── search-translations.dto.ts   # NEW: Search request DTO
└── search-result.dto.ts         # NEW: Search response DTO

apps/api/src/app/collections/resources/
└── resources.controller.ts      # MODIFY: Add search endpoint

Frontend (Angular):
apps/tracker/src/app/browser/
├── store/
│   └── browser.store.ts         # MODIFY: Add search state
├── components/
│   └── translation-search/
│       ├── translation-search.ts     # NEW: Search component
│       ├── translation-search.html
│       ├── translation-search.scss
│       └── translation-search.spec.ts
├── services/
│   └── browser-api.service.ts   # MODIFY: Add search API call
└── translation-browser.ts       # MODIFY: Integrate search component
```

### State Management

The BrowserStore will be extended with search-related state:

```typescript
interface BrowserState {
  // ... existing state ...

  // Search state
  searchQuery: string;
  isSearchMode: boolean;
  searchResults: ResourceSummaryDto[];
  isSearchLoading: boolean;
  searchError: string | null;
}
```

### Data Flow

1. **User Types in Search:**
   - User types → Search component debounces (300ms)
   - Updates `searchQuery` in store
   - Sets `isSearchMode = true`
   - Disables folder tree via `isDisabled` flag

2. **Search Execution:**
   - Store triggers API call via `searchTranslations()` rxMethod
   - API endpoint `/api/collections/:name/resources/search?q=query`
   - Core library searches through resource files
   - Results ranked and returned as DTOs

3. **Display Results:**
   - Store updates `searchResults`
   - TranslationList displays search results instead of folder translations
   - Results show full key path and all locale values

4. **Clear Search:**
   - User clicks clear button
   - Resets `searchQuery`, `isSearchMode`, `searchResults`
   - Re-enables folder tree
   - Returns to last selected folder

## Phased Implementation

### Phase 1: Core Library Search Logic (Backend)

Build the core search functionality that will be called by the API.

#### Task 1.1: Create search function with tests (10 min)

**Test File:** `/Users/simon/git/lingo-tracker/libs/core/src/lib/resource/search.spec.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchTranslations, SearchParams, SearchResult } from './search';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('searchTranslations', () => {
  const testDir = join(__dirname, '__test_translations__');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const createTestResource = (path: string, entries: Record<string, any>, meta: Record<string, any>) => {
    const folderPath = join(testDir, ...path.split('.'));
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(join(folderPath, 'resource_entries.json'), JSON.stringify(entries, null, 2));
    writeFileSync(join(folderPath, 'tracker_meta.json'), JSON.stringify(meta, null, 2));
  };

  describe('Search by Key', () => {
    it('should find exact key match', () => {
      createTestResource('buttons', {
        ok: { en: 'OK', es: 'Aceptar' }
      }, {
        ok: { en: { status: 'verified' }, es: { status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'buttons.ok',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('buttons.ok');
      expect(results[0].matchType).toBe('exact-key');
    });

    it('should find partial key match', () => {
      createTestResource('common.buttons', {
        save: { en: 'Save', es: 'Guardar' },
        cancel: { en: 'Cancel', es: 'Cancelar' },
      }, {
        save: { en: { status: 'verified' }, es: { status: 'verified' } },
        cancel: { en: { status: 'verified' }, es: { status: 'verified' } },
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'button',
      };

      const results = searchTranslations(params);

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.key.toLowerCase().includes('button'))).toBe(true);
    });

    it('should be case insensitive', () => {
      createTestResource('messages', {
        error: { en: 'Error occurred', es: 'Ocurrió un error' }
      }, {
        error: { en: { status: 'verified' }, es: { status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'ERROR',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('messages.error');
    });
  });

  describe('Search by Value', () => {
    it('should find exact value match in any locale', () => {
      createTestResource('labels', {
        name: { en: 'Name', es: 'Nombre' }
      }, {
        name: { en: { status: 'verified' }, es: { status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'Nombre',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('labels.name');
      expect(results[0].matchType).toBe('exact-value');
      expect(results[0].matchedLocales).toContain('es');
    });

    it('should find partial value match', () => {
      createTestResource('messages', {
        welcome: { en: 'Welcome to our application', es: 'Bienvenido a nuestra aplicación' }
      }, {
        welcome: { en: { status: 'verified' }, es: { status: 'verified' } }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'application',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('partial-value');
      expect(results[0].matchedLocales).toContain('en');
    });

    it('should return all locale values for matched results', () => {
      createTestResource('common', {
        hello: { en: 'Hello', es: 'Hola', fr: 'Bonjour' }
      }, {
        hello: {
          en: { status: 'verified' },
          es: { status: 'verified' },
          fr: { status: 'verified' }
        }
      });

      const params: SearchParams = {
        translationsFolder: testDir,
        query: 'Hola',
      };

      const results = searchTranslations(params);

      expect(results).toHaveLength(1);
      expect(results[0].translations).toEqual({
        en: 'Hello',
        es: 'Hola',
        fr: 'Bonjour',
      });
    });
  });

  describe('Result Ranking', () => {
    beforeEach(() => {
      createTestResource('buttons', {
        save: { en: 'Save', es: 'Guardar' },
        saveAs: { en: 'Save As', es: 'Guardar como' },
        autoSave: { en: 'Auto Save', es: 'Guardado automático' },
      }, {
        save: { en: { status: 'verified' }, es: { status: 'verified' } },
        saveAs: { en: { status: 'verified' }, es: { status: 'verified' } },
        autoSave: { en: { status: 'verified' }, es: { status: 'verified' } },
      });
    });

    it('should rank exact key matches highest', () => {
      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'save',
      });

      // Exact match "buttons.save" should be first
      expect(results[0].key).toBe('buttons.save');
      expect(results[0].matchType).toBe('exact-key');
    });

    it('should rank exact value matches before partial', () => {
      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'Save',
      });

      // Find exact value match vs partial
      const exactMatch = results.find(r => r.matchType === 'exact-value');
      const partialMatch = results.find(r => r.matchType === 'partial-value');

      if (exactMatch && partialMatch) {
        const exactIdx = results.indexOf(exactMatch);
        const partialIdx = results.indexOf(partialMatch);
        expect(exactIdx).toBeLessThan(partialIdx);
      }
    });
  });

  describe('Search Limits', () => {
    it('should limit results to maxResults parameter', () => {
      // Create many resources
      for (let i = 0; i < 100; i++) {
        createTestResource(`test.item${i}`, {
          label: { en: `Item ${i}` }
        }, {
          label: { en: { status: 'verified' } }
        });
      }

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'item',
        maxResults: 10,
      });

      expect(results).toHaveLength(10);
    });

    it('should default to 100 results max', () => {
      // Create 150 resources
      for (let i = 0; i < 150; i++) {
        createTestResource(`test.item${i}`, {
          label: { en: `Item ${i}` }
        }, {
          label: { en: { status: 'verified' } }
        });
      }

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'item',
      });

      expect(results.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for empty query', () => {
      const results = searchTranslations({
        translationsFolder: testDir,
        query: '',
      });

      expect(results).toEqual([]);
    });

    it('should return empty array for no matches', () => {
      createTestResource('test', {
        key: { en: 'value' }
      }, {
        key: { en: { status: 'verified' } }
      });

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'nonexistent',
      });

      expect(results).toEqual([]);
    });

    it('should handle folders without resource files gracefully', () => {
      mkdirSync(join(testDir, 'empty'), { recursive: true });

      const results = searchTranslations({
        translationsFolder: testDir,
        query: 'test',
      });

      expect(results).toEqual([]);
    });
  });
});
```

**Implementation File:** `/Users/simon/git/lingo-tracker/libs/core/src/lib/resource/search.ts`

```typescript
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResourceEntry } from './types';
import type { TranslationMetadata } from './types';

/**
 * Match type for search results.
 */
export type MatchType = 'exact-key' | 'partial-key' | 'exact-value' | 'partial-value';

/**
 * Search result with match information.
 */
export interface SearchResult {
  /** Full dot-delimited key path */
  key: string;

  /** Translation values for all locales */
  translations: Record<string, string>;

  /** Translation status for each locale */
  status: Record<string, string | undefined>;

  /** Type of match found */
  matchType: MatchType;

  /** Locales where the match was found (for value matches) */
  matchedLocales?: string[];

  /** Optional comment */
  comment?: string;

  /** Optional tags */
  tags?: string[];
}

/**
 * Parameters for translation search.
 */
export interface SearchParams {
  /** Root translations folder to search in */
  translationsFolder: string;

  /** Search query (case-insensitive) */
  query: string;

  /** Maximum number of results to return (default: 100) */
  maxResults?: number;
}

/**
 * Searches translations by key and value across all locales.
 *
 * Search Algorithm:
 * 1. Exact key match (highest priority)
 * 2. Partial key match
 * 3. Exact value match in any locale
 * 4. Partial value match in any locale
 *
 * Results are ranked by match type and returned up to maxResults limit.
 *
 * @param params - Search parameters
 * @returns Array of search results sorted by relevance
 *
 * @example
 * const results = searchTranslations({
 *   translationsFolder: './translations',
 *   query: 'button',
 *   maxResults: 50
 * });
 */
export function searchTranslations(params: SearchParams): SearchResult[] {
  const { translationsFolder, query, maxResults = 100 } = params;

  // Empty query returns no results
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  /**
   * Recursively searches through folder structure.
   */
  function searchFolder(folderPath: string, keyPrefix: string): void {
    if (!existsSync(folderPath)) {
      return;
    }

    // Check for resource files in current folder
    const entriesFile = join(folderPath, 'resource_entries.json');
    const metaFile = join(folderPath, 'tracker_meta.json');

    if (existsSync(entriesFile)) {
      try {
        const entriesData = readFileSync(entriesFile, 'utf-8');
        const entries: Record<string, ResourceEntry> = JSON.parse(entriesData);

        let metadata: Record<string, TranslationMetadata> = {};
        if (existsSync(metaFile)) {
          const metaData = readFileSync(metaFile, 'utf-8');
          metadata = JSON.parse(metaData);
        }

        // Search each entry
        for (const [entryKey, entry] of Object.entries(entries)) {
          const fullKey = keyPrefix ? `${keyPrefix}.${entryKey}` : entryKey;
          const normalizedKey = fullKey.toLowerCase();

          // Check key matches
          let matchType: MatchType | null = null;
          let matchedLocales: string[] = [];

          if (normalizedKey === normalizedQuery) {
            matchType = 'exact-key';
          } else if (normalizedKey.includes(normalizedQuery)) {
            matchType = 'partial-key';
          }

          // Check value matches if no key match
          if (!matchType) {
            for (const [locale, value] of Object.entries(entry)) {
              if (typeof value === 'string') {
                const normalizedValue = value.toLowerCase();
                if (normalizedValue === normalizedQuery) {
                  matchType = 'exact-value';
                  matchedLocales.push(locale);
                } else if (normalizedValue.includes(normalizedQuery)) {
                  if (matchType !== 'exact-value') {
                    matchType = 'partial-value';
                  }
                  matchedLocales.push(locale);
                }
              }
            }
          }

          // Add to results if match found
          if (matchType) {
            const meta = metadata[entryKey] || {};
            const status: Record<string, string | undefined> = {};

            for (const locale in entry) {
              if (typeof entry[locale] === 'string') {
                status[locale] = meta[locale]?.status;
              }
            }

            results.push({
              key: fullKey,
              translations: entry as Record<string, string>,
              status,
              matchType,
              matchedLocales: matchedLocales.length > 0 ? matchedLocales : undefined,
              comment: meta.comment,
              tags: meta.tags,
            });

            // Stop if we've reached max results
            if (results.length >= maxResults) {
              return;
            }
          }
        }
      } catch (error) {
        // Skip folders with invalid JSON
        console.error(`Error reading resources in ${folderPath}:`, error);
      }
    }

    // Recurse into subdirectories
    try {
      const items = readdirSync(folderPath);
      for (const item of items) {
        const itemPath = join(folderPath, item);
        if (statSync(itemPath).isDirectory()) {
          const newPrefix = keyPrefix ? `${keyPrefix}.${item}` : item;
          searchFolder(itemPath, newPrefix);

          // Stop if we've reached max results
          if (results.length >= maxResults) {
            return;
          }
        }
      }
    } catch (error) {
      // Skip folders we can't read
      console.error(`Error reading directory ${folderPath}:`, error);
    }
  }

  // Start search from root
  searchFolder(translationsFolder, '');

  // Sort results by match type priority
  const priority: Record<MatchType, number> = {
    'exact-key': 1,
    'exact-value': 2,
    'partial-key': 3,
    'partial-value': 4,
  };

  results.sort((a, b) => {
    const priorityDiff = priority[a.matchType] - priority[b.matchType];
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort by key alphabetically
    return a.key.localeCompare(b.key);
  });

  return results;
}
```

**Update exports:** `/Users/simon/git/lingo-tracker/libs/core/src/index.ts`

Add:
```typescript
export { searchTranslations, type SearchParams, type SearchResult, type MatchType } from './lib/resource/search';
```

**Command:**
```bash
pnpm nx test core --testFile=src/lib/resource/search.spec.ts
```

**Commit:**
```bash
git add libs/core/src/lib/resource/search.ts libs/core/src/lib/resource/search.spec.ts libs/core/src/index.ts
git commit -m "feat(core): add translation search functionality"
```

### Phase 2: Data Transfer DTOs

Create DTOs for search requests and responses.

#### Task 2.1: Create search DTOs (3 min)

**File:** `/Users/simon/git/lingo-tracker/libs/data-transfer/src/lib/search-translations.dto.ts`

```typescript
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

/**
 * DTO for translation search request.
 */
export class SearchTranslationsDto {
  /**
   * Search query string (case-insensitive).
   * Searches across both keys and values.
   */
  @IsString()
  query: string;

  /**
   * Maximum number of results to return.
   * Default: 100, Max: 500
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxResults?: number;
}
```

**File:** `/Users/simon/git/lingo-tracker/libs/data-transfer/src/lib/search-result.dto.ts`

```typescript
import { TranslationStatus } from './translation-status';

/**
 * Match type for search results.
 */
export type MatchType = 'exact-key' | 'partial-key' | 'exact-value' | 'partial-value';

/**
 * DTO for a single search result.
 */
export interface SearchResultDto {
  /** Full dot-delimited key path */
  key: string;

  /** Translation values for all locales */
  translations: Record<string, string>;

  /** Translation status for each locale */
  status: Record<string, TranslationStatus | undefined>;

  /** Type of match found */
  matchType: MatchType;

  /** Locales where the match was found (for value matches) */
  matchedLocales?: string[];

  /** Optional comment */
  comment?: string;

  /** Optional tags */
  tags?: string[];
}

/**
 * DTO for search response.
 */
export interface SearchResultsDto {
  /** Search query that was executed */
  query: string;

  /** Array of search results */
  results: SearchResultDto[];

  /** Total number of results found (may be more than returned if limited) */
  totalFound: number;

  /** Whether results were limited by maxResults */
  limited: boolean;
}
```

**Update exports:** `/Users/simon/git/lingo-tracker/libs/data-transfer/src/index.ts`

Add:
```typescript
export { SearchTranslationsDto } from './lib/search-translations.dto';
export { SearchResultDto, SearchResultsDto, type MatchType } from './lib/search-result.dto';
```

**Commit:**
```bash
git add libs/data-transfer/src/lib/search-*.dto.ts libs/data-transfer/src/index.ts
git commit -m "feat(data-transfer): add search DTOs"
```

### Phase 3: API Endpoint

Add search endpoint to the resources controller.

#### Task 3.1: Add search endpoint to resources controller (6 min)

**Update File:** `/Users/simon/git/lingo-tracker/apps/api/src/app/collections/resources/resources.controller.ts`

Add imports:
```typescript
import { searchTranslations } from '@simoncodes-ca/core';
import { SearchTranslationsDto, SearchResultsDto } from '@simoncodes-ca/data-transfer';
```

Add endpoint method:
```typescript
@Get('search')
async search(
  @Param('collectionName') collectionName: string,
  @Query() dto: SearchTranslationsDto
): Promise<SearchResultsDto> {
  try {
    const decodedCollectionName = decodeURIComponent(collectionName);
    const config = this.configService.getConfig();

    if (!config.collections || !config.collections[decodedCollectionName]) {
      throw new NotFoundException(`Collection "${decodedCollectionName}" not found`);
    }

    const collection = config.collections[decodedCollectionName];
    const translationsFolder = collection.translationsFolder;

    // Validate query
    if (!dto.query || dto.query.trim().length === 0) {
      return {
        query: dto.query || '',
        results: [],
        totalFound: 0,
        limited: false,
      };
    }

    // Default maxResults to 100, cap at 500
    const maxResults = Math.min(dto.maxResults || 100, 500);

    // Execute search
    const searchResults = searchTranslations({
      translationsFolder,
      query: dto.query,
      maxResults: maxResults + 1, // Request one extra to detect if limited
    });

    // Check if results were limited
    const limited = searchResults.length > maxResults;
    const results = limited ? searchResults.slice(0, maxResults) : searchResults;

    return {
      query: dto.query,
      results,
      totalFound: limited ? maxResults : results.length,
      limited,
    };
  } catch (error: unknown) {
    if (error instanceof NotFoundException) {
      throw error;
    }

    if (error instanceof HttpException) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Error searching translations';
    throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
```

**Manual Testing:**
```bash
# Start API
pnpm nx serve api

# Test search endpoint
curl "http://localhost:3030/api/collections/your-collection/resources/search?query=button"
```

**Commit:**
```bash
git add apps/api/src/app/collections/resources/resources.controller.ts
git commit -m "feat(api): add translation search endpoint"
```

### Phase 4: Frontend Browser API Service

Add search method to the browser API service.

#### Task 4.1: Add search method to BrowserApiService (4 min)

**Update File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/services/browser-api.service.ts`

Add imports:
```typescript
import { SearchResultsDto } from '@simoncodes-ca/data-transfer';
```

Add method:
```typescript
/**
 * Searches translations within a collection.
 *
 * @param collectionName - Name of the collection to search
 * @param query - Search query string
 * @param maxResults - Maximum results to return (default: 100)
 * @returns Observable of search results
 */
searchTranslations(
  collectionName: string,
  query: string,
  maxResults = 100
): Observable<SearchResultsDto> {
  const params = new HttpParams()
    .set('query', query)
    .set('maxResults', maxResults.toString());

  return this.http.get<SearchResultsDto>(
    `${this.apiUrl}/collections/${encodeURIComponent(collectionName)}/resources/search`,
    { params }
  );
}
```

**Add Test:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/services/browser-api.service.spec.ts`

```typescript
describe('searchTranslations', () => {
  it('should search translations with query', (done) => {
    const mockResults: SearchResultsDto = {
      query: 'button',
      results: [
        {
          key: 'common.buttons.save',
          translations: { en: 'Save', es: 'Guardar' },
          status: { en: 'verified', es: 'verified' },
          matchType: 'partial-key',
        },
      ],
      totalFound: 1,
      limited: false,
    };

    service.searchTranslations('test-collection', 'button').subscribe({
      next: (results) => {
        expect(results).toEqual(mockResults);
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne(
      `${service['apiUrl']}/collections/test-collection/resources/search?query=button&maxResults=100`
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResults);
  });

  it('should handle empty search results', (done) => {
    const mockResults: SearchResultsDto = {
      query: 'nonexistent',
      results: [],
      totalFound: 0,
      limited: false,
    };

    service.searchTranslations('test-collection', 'nonexistent').subscribe({
      next: (results) => {
        expect(results.results).toEqual([]);
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne((r) => r.url.includes('/search'));
    req.flush(mockResults);
  });
});
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/services/browser-api.service.spec.ts
```

**Commit:**
```bash
git add apps/tracker/src/app/browser/services/browser-api.service.ts
git commit -m "feat(tracker): add search method to BrowserApiService"
```

### Phase 5: Extend BrowserStore with Search State

Add search state and methods to the unified browser store.

#### Task 5.1: Add search state to BrowserStore (6 min)

**Update File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/browser.store.ts`

Add imports:
```typescript
import { SearchResultsDto } from '@simoncodes-ca/data-transfer';
```

Update interface:
```typescript
interface BrowserState {
  // ... existing fields ...

  // Search state
  searchQuery: string;
  isSearchMode: boolean;
  searchResults: ResourceSummaryDto[];
  isSearchLoading: boolean;
  searchError: string | null;
}
```

Update initialState:
```typescript
const initialState: BrowserState = {
  // ... existing fields ...

  searchQuery: '',
  isSearchMode: false,
  searchResults: [],
  isSearchLoading: false,
  searchError: null,
};
```

Add computed property:
```typescript
withComputed(({ /* existing params */, isSearchMode, searchResults, translations }) => ({
  // ... existing computed properties ...

  /**
   * Returns translations to display (search results or folder translations).
   */
  displayedTranslations: computed(() => {
    return isSearchMode() ? searchResults() : translations();
  }),
})),
```

Add methods:
```typescript
withMethods((store) => {
  const api = inject(BrowserApiService);

  return {
    // ... existing methods ...

    /**
     * Sets the search query and enters search mode.
     */
    setSearchQuery(query: string): void {
      patchState(store, {
        searchQuery: query,
        isSearchMode: query.length > 0,
      });

      // Disable folder tree during search
      if (query.length > 0) {
        patchState(store, { isDisabled: true });
      } else {
        patchState(store, { isDisabled: false });
      }
    },

    /**
     * Clears search and returns to folder browse mode.
     */
    clearSearch(): void {
      patchState(store, {
        searchQuery: '',
        isSearchMode: false,
        searchResults: [],
        searchError: null,
        isDisabled: false,
      });
    },

    /**
     * Searches translations in the current collection.
     */
    searchTranslations: rxMethod<string>(
      pipe(
        tap(() => patchState(store, {
          isSearchLoading: true,
          searchError: null,
        })),
        switchMap((query) => {
          const collection = store.selectedCollection();
          if (!collection || query.trim().length === 0) {
            patchState(store, { isSearchLoading: false });
            return of(null);
          }

          return api.searchTranslations(collection, query).pipe(
            tap((response: SearchResultsDto) => {
              patchState(store, {
                searchResults: response.results,
                isSearchLoading: false,
                searchError: null,
              });
            }),
            catchError((error: unknown) => {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : 'Failed to search translations';
              patchState(store, {
                isSearchLoading: false,
                searchError: errorMessage,
                searchResults: [],
              });
              return of(null);
            })
          );
        })
      )
    ),
  };
});
```

**Add Tests:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/store/browser.store.spec.ts`

```typescript
describe('Search State', () => {
  beforeEach(() => {
    store.setSelectedCollection({
      collectionName: 'test',
      locales: ['en', 'es']
    });
  });

  it('should initialize with empty search state', () => {
    expect(store.searchQuery()).toBe('');
    expect(store.isSearchMode()).toBe(false);
    expect(store.searchResults()).toEqual([]);
  });

  it('should set search query and enter search mode', () => {
    store.setSearchQuery('test query');

    expect(store.searchQuery()).toBe('test query');
    expect(store.isSearchMode()).toBe(true);
    expect(store.isDisabled()).toBe(true);
  });

  it('should exit search mode when query is empty', () => {
    store.setSearchQuery('test');
    store.setSearchQuery('');

    expect(store.isSearchMode()).toBe(false);
    expect(store.isDisabled()).toBe(false);
  });

  it('should clear search state', () => {
    store.setSearchQuery('test');
    store.clearSearch();

    expect(store.searchQuery()).toBe('');
    expect(store.isSearchMode()).toBe(false);
    expect(store.isDisabled()).toBe(false);
  });

  describe('displayedTranslations', () => {
    it('should return folder translations when not in search mode', () => {
      const mockTranslations = [
        { key: 'test', translations: { en: 'Test' }, status: {} },
      ];

      // Simulate loading folder translations
      // (This would normally happen via selectFolder)
      patchState(store, { translations: mockTranslations });

      expect(store.displayedTranslations()).toEqual(mockTranslations);
    });

    it('should return search results when in search mode', () => {
      const mockResults = [
        { key: 'found', translations: { en: 'Found' }, status: {}, matchType: 'exact-key' },
      ];

      patchState(store, {
        isSearchMode: true,
        searchResults: mockResults,
      });

      expect(store.displayedTranslations()).toEqual(mockResults);
    });
  });
});
```

**Command:**
```bash
pnpm nx test tracker --testFile=src/app/browser/store/browser.store.spec.ts
```

**Commit:**
```bash
git add apps/tracker/src/app/browser/store/browser.store.ts
git commit -m "feat(tracker): add search state to BrowserStore"
```

### Phase 6: TranslationSearch Component

Create the search input component with debouncing.

#### Task 6.1: Create TranslationSearch component (8 min)

**Test File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.spec.ts`

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TranslationSearch } from './translation-search';
import { BrowserStore } from '../../store/browser.store';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('TranslationSearch', () => {
  let component: TranslationSearch;
  let fixture: ComponentFixture<TranslationSearch>;
  let mockStore: any;

  beforeEach(async () => {
    mockStore = {
      searchQuery: signal(''),
      isSearchMode: signal(false),
      isSearchLoading: signal(false),
      setSearchQuery: vi.fn(),
      clearSearch: vi.fn(),
      searchTranslations: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TranslationSearch, NoopAnimationsModule],
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
      const icon = fixture.nativeElement.querySelector('.search-icon');
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

    it('should show loading spinner when searching', () => {
      mockStore.isSearchLoading = signal(true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
    });
  });

  describe('Search Debouncing', () => {
    it('should update store search query after typing', async () => {
      component.searchControl.setValue('test');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('test');
    });

    it('should trigger search after debounce', async () => {
      component.searchControl.setValue('button');

      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockStore.searchTranslations).toHaveBeenCalledWith('button');
    });

    it('should not search for empty query', async () => {
      component.searchControl.setValue('test');
      await new Promise(resolve => setTimeout(resolve, 350));

      mockStore.setSearchQuery.mockClear();
      mockStore.searchTranslations.mockClear();

      component.searchControl.setValue('');
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockStore.setSearchQuery).toHaveBeenCalledWith('');
      expect(mockStore.searchTranslations).not.toHaveBeenCalled();
    });
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
});
```

**Implementation File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/translation-search/translation-search.ts`

```typescript
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
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
 * - Loading indicator during search
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
    MatProgressSpinnerModule,
  ],
  templateUrl: './translation-search.html',
  styleUrl: './translation-search.scss',
})
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
          // Update store state
          this.store.setSearchQuery(query);

          // Trigger search if query is not empty
          if (query.trim().length > 0) {
            this.store.searchTranslations(query);
          }
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

  @if (store.isSearchLoading()) {
    <mat-spinner matSuffix [diameter]="20" class="search-spinner"></mat-spinner>
  }

  @if (searchControl.value && !store.isSearchLoading()) {
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
    color: rgba(0, 0, 0, 0.54);
    margin-right: 8px;
  }

  .search-spinner {
    margin-right: 8px;
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

**Commit:**
```bash
git add apps/tracker/src/app/browser/components/translation-search/
git commit -m "feat(tracker): add TranslationSearch component"
```

### Phase 7: Integration with TranslationBrowser

Integrate the search component and update TranslationList to use search results.

#### Task 7.1: Integrate TranslationSearch into TranslationBrowser (3 min)

**Update File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-browser.ts`

Add import:
```typescript
import { TranslationSearch } from './components/translation-search/translation-search';
```

Add to imports array in @Component decorator.

Update template to include search component in toolbar (adjust based on current layout):

```html
<div class="browser-toolbar">
  <app-translation-search />
  <!-- Other toolbar items -->
</div>
```

**Commit:**
```bash
git add apps/tracker/src/app/browser/translation-browser.ts
git commit -m "feat(tracker): integrate TranslationSearch into browser toolbar"
```

#### Task 7.2: Update TranslationList to display search results (4 min)

**Update File:** `/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/translation-list.ts`

Update to use `store.displayedTranslations()` instead of `store.translations()`:

```typescript
// In template, ensure it reads from store.displayedTranslations()
// which automatically switches between folder translations and search results
```

Add search result indicator to template:

```html
@if (store.isSearchMode()) {
  <div class="search-info">
    <mat-icon>search</mat-icon>
    <span>Showing search results for "{{ store.searchQuery() }}"</span>
    <button mat-button (click)="store.clearSearch()">Clear Search</button>
  </div>
}

<!-- Existing translation list using store.displayedTranslations() -->
```

**Add CSS:**

```scss
.search-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: #e3f2fd;
  border-left: 4px solid #2196f3;
  margin-bottom: 16px;

  mat-icon {
    color: #2196f3;
  }

  span {
    flex: 1;
    font-weight: 500;
  }
}
```

**Commit:**
```bash
git add apps/tracker/src/app/browser/translation-list.*
git commit -m "feat(tracker): update TranslationList to display search results"
```

### Phase 8: Testing and Polish

Final integration testing and polish.

#### Task 8.1: Integration testing (10 min)

**Manual Test Checklist:**

1. **Search Functionality**
   - [ ] Type in search box triggers debounced search (300ms)
   - [ ] Loading spinner appears during search
   - [ ] Search results appear in TranslationList
   - [ ] Folder tree is disabled during search
   - [ ] Search info banner shows current query
   - [ ] Clear button clears search and returns to folder view

2. **Search Results**
   - [ ] Exact key matches appear first
   - [ ] Partial key matches appear
   - [ ] Value matches in any locale appear
   - [ ] Results show full key paths
   - [ ] All locale values are displayed
   - [ ] Match type is indicated (if shown in UI)

3. **Error Handling**
   - [ ] Empty search query shows no results
   - [ ] No matches found shows empty state
   - [ ] Network errors display error message
   - [ ] Error state doesn't break the UI

4. **State Management**
   - [ ] Search state persists across folder navigation attempts
   - [ ] Clearing search returns to last selected folder
   - [ ] Search state resets when changing collections
   - [ ] Loading states are accurate

5. **Accessibility**
   - [ ] Search input has proper label
   - [ ] Clear button has aria-label
   - [ ] Keyboard navigation works
   - [ ] Screen reader announces search results

**Run All Tests:**
```bash
pnpm nx test tracker
pnpm nx test core
pnpm nx test api
```

**E2E Testing:**
```bash
pnpm nx serve tracker
pnpm nx serve api
```

Test complete user flow:
1. Navigate to collection
2. Search for "button"
3. Verify results
4. Clear search
5. Navigate folder
6. Search again
7. Change collections

**Commit:**
```bash
git add .
git commit -m "feat(tracker): complete translation search integration with testing"
```

#### Task 8.2: Documentation and barrel exports (3 min)

**Create barrel export:**

`/Users/simon/git/lingo-tracker/apps/tracker/src/app/browser/components/index.ts`

```typescript
export { TranslationSearch } from './translation-search/translation-search';
// Add other components as needed
```

**Update imports in translation-browser.ts to use barrel:**

```typescript
import { TranslationSearch } from './components';
```

**Add JSDoc comments to key methods if not already present.**

**Commit:**
```bash
git add .
git commit -m "chore(tracker): add barrel exports and documentation"
```

## Success Criteria

**Backend:**
- [ ] Core search function implemented with comprehensive tests
- [ ] Search algorithm ranks results by relevance
- [ ] Search DTOs created and exported
- [ ] API endpoint handles search requests correctly
- [ ] Error handling for edge cases (empty query, no matches, etc.)

**Frontend:**
- [ ] BrowserStore extended with search state
- [ ] TranslationSearch component with debounced input
- [ ] Search disables folder tree during search mode
- [ ] TranslationList displays search results
- [ ] Clear search returns to folder browse mode
- [ ] Loading states during search
- [ ] Error handling and display

**Testing:**
- [ ] All unit tests pass (core, API, frontend)
- [ ] Manual testing checklist completed
- [ ] Search performance acceptable for large collections
- [ ] Accessibility requirements met

**Code Quality:**
- [ ] Follows Angular 20 best practices (signals, OnPush, standalone)
- [ ] TDD approach with test-first implementation
- [ ] Clean separation of concerns
- [ ] Proper TypeScript types throughout
- [ ] JSDoc comments on public APIs

## Integration Points

### BrowserStore Methods

- `setSearchQuery(query: string)` - Sets query and enters search mode
- `clearSearch()` - Clears search and returns to browse mode
- `searchTranslations(query: string)` - Executes search via API (rxMethod)

### BrowserStore State

- `searchQuery: string` - Current search text
- `isSearchMode: boolean` - Whether in search or browse mode
- `searchResults: ResourceSummaryDto[]` - Array of search results
- `isSearchLoading: boolean` - Search in progress
- `searchError: string | null` - Error message if search failed

### BrowserStore Computed

- `displayedTranslations()` - Returns search results or folder translations based on mode
- `isDisabled()` - Disables folder tree during search

### API Endpoint

- `GET /api/collections/:name/resources/search?query=<query>&maxResults=<num>`
- Returns `SearchResultsDto` with results array and metadata

### Core Library

- `searchTranslations(params: SearchParams): SearchResult[]`
- Recursively searches translation files
- Ranks results by match type
- Limits results to maxResults parameter

## Performance Considerations

- **Debouncing:** 300ms debounce prevents excessive API calls during typing
- **Result Limiting:** Default 100 results, max 500 to prevent large payloads
- **Server-Side Search:** Offloads search logic from client for better performance
- **Virtual Scrolling:** TranslationList already uses virtual scrolling for large result sets
- **Caching:** Consider adding result caching for repeated queries (future enhancement)

## Future Enhancements

- Add search filters (by status, locale, tags)
- Add advanced search syntax (exact match with quotes, regex, etc.)
- Highlight matched text in search results
- Add search history/recent searches
- Add keyboard shortcuts (Ctrl+F to focus search)
- Export search results to CSV
- Add search within current folder only (scoped search)
- Cache search results for repeated queries
- Add search suggestions/autocomplete

## Notes

- Search is collection-scoped (searches within one collection at a time)
- Search is case-insensitive
- Search covers both keys and values across all locales
- Match type information helps users understand why a result appeared
- Folder tree is disabled during search to avoid confusion about current location
- Clearing search returns to previous folder context

## API Response Example

```json
{
  "query": "button",
  "results": [
    {
      "key": "common.buttons.save",
      "translations": {
        "en": "Save",
        "es": "Guardar",
        "fr": "Enregistrer"
      },
      "status": {
        "en": "verified",
        "es": "verified",
        "fr": "translated"
      },
      "matchType": "partial-key",
      "comment": "Action button for saving changes"
    },
    {
      "key": "forms.labels.submitButton",
      "translations": {
        "en": "Submit",
        "es": "Enviar"
      },
      "status": {
        "en": "verified",
        "es": "verified"
      },
      "matchType": "partial-value",
      "matchedLocales": ["en"]
    }
  ],
  "totalFound": 2,
  "limited": false
}
```
