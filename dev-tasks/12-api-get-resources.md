# Feature: API to Load Translation Resources for Given Collection

## Overview

This feature provides a REST API endpoint to progressively fetch translation resources for a given collection in a hierarchical folder structure. Given scalability concerns, we don't want to load all resources at once - instead, we provide a tree-based API that allows clients to load folders on-demand with configurable depth.

The API uses a single unified endpoint that can load from root or any nested folder path, with an optional depth parameter to control how many levels of child folders are loaded recursively (default: 2).

When the API returns resources, it identifies all child folders and indicates whether their contents are loaded (based on depth) or available for future loading.

---

## API Contract & Response Structure

### Endpoint

```
GET /api/collections/:collectionName/resources/tree
```

### Query Parameters

- **path** (optional, string): Dot-delimited folder path (e.g., "apps.common.buttons"). Omit or use empty string for root.
- **depth** (optional, number): Recursive depth to load (default: 2, min: 0, max: 10)

### Response DTO Structure

```typescript
interface ResourceTreeDto {
  /** Current folder path (dot-delimited, empty string for root) */
  path: string;

  /** Resources in this folder */
  resources: ResourceSummaryDto[];

  /** Child folders (loaded or unloaded based on depth) */
  children: FolderNodeDto[];
}

interface ResourceSummaryDto {
  /** Entry key within folder (not full path) */
  key: string;

  /** Translation values per locale (includes source locale) */
  translations: Record<string, string>;

  /** Translation status per locale */
  status: Record<string, TranslationStatus>;

  /** Optional comment/note for translators */
  comment?: string;

  /** Optional tags for categorization/filtering */
  tags?: string[];
}

interface FolderNodeDto {
  /** Folder name (single segment, not full path) */
  name: string;

  /** Full dot-delimited path to this folder */
  fullPath: string;

  /** Whether this folder's contents are loaded */
  loaded: boolean;

  /** If loaded=true, contains nested tree structure */
  tree?: ResourceTreeDto;
}
```

### Example Response

```json
{
  "path": "apps.common",
  "resources": [
    {
      "key": "title",
      "translations": {
        "en": "Common Title",
        "es": "Título Común",
        "fr": "Titre Commun"
      },
      "status": {
        "en": "verified",
        "es": "translated",
        "fr": "stale"
      },
      "comment": "Main title for common section",
      "tags": ["ui", "common"]
    }
  ],
  "children": [
    {
      "name": "buttons",
      "fullPath": "apps.common.buttons",
      "loaded": true,
      "tree": {
        "path": "apps.common.buttons",
        "resources": [
          {
            "key": "ok",
            "translations": {
              "en": "OK",
              "es": "Aceptar",
              "fr": "D'accord"
            },
            "status": {
              "en": "verified",
              "es": "verified",
              "fr": "translated"
            }
          }
        ],
        "children": []
      }
    },
    {
      "name": "dialogs",
      "fullPath": "apps.common.dialogs",
      "loaded": false
    }
  ]
}
```

The recursive structure allows `depth=2` to return:
- Current folder with its resources
- Immediate children (depth 1) with their resources loaded
- Grandchildren (depth 2) folder names with `loaded=false`

---

## Implementation Architecture

### Layer Responsibilities

Following the existing LingoTracker architecture pattern:

#### API Layer (`apps/api/src/app/collections/resources/`)

- Add new `@Get('tree')` endpoint to existing `ResourcesController`
- Validate query parameters (path format, depth bounds)
- Retrieve collection configuration from `ConfigService`
- Call core library function `loadResourceTree()`
- Use mapper to convert core domain models to DTOs
- Handle HTTP errors (400, 404, 500)

#### Core Library (`libs/core/src/lib/resource/`)

- New file: `load-resource-tree.ts`
- Exports `loadResourceTree(translationsFolder, options)` function
- Recursively traverse folder structure up to specified depth
- Read `resource_entries.json` and `tracker_meta.json` at each level
- Build domain model representing the tree structure
- Reuse existing utilities from `resource-file-paths.ts`
- Track visited real paths to prevent symlink cycles
- Handle missing/corrupted files gracefully

#### Data Transfer (`libs/data-transfer/src/lib/`)

- New file: `resource-tree.dto.ts`
- Define the three DTOs: `ResourceTreeDto`, `ResourceSummaryDto`, `FolderNodeDto`
- Export from main index for use by API and Tracker UI

#### Mapper (`apps/api/src/app/mappers/`)

- New file: `resource-tree.mapper.ts`
- Function: `mapResourceTreeToDto(domainModel, collectionConfig)`
- Convert core domain objects to DTOs
- Handle locale-specific status extraction from metadata

### Data Flow

```
File System → Core (domain models) → Mapper → DTO → HTTP Response
```

This follows the established pattern seen in `createResources`, `delete`, and `move` endpoints where business logic lives in core and API orchestrates.

---

## Core Library Implementation Details

### New File: `libs/core/src/lib/resource/load-resource-tree.ts`

#### Domain Model (internal to core)

```typescript
export interface ResourceTreeNode {
  /** Folder path segments (empty array for root) */
  folderPathSegments: string[];

  /** Resources in this folder */
  resources: ResourceTreeEntry[];

  /** Child folders */
  children: FolderChild[];
}

export interface ResourceTreeEntry {
  key: string;
  source: string;
  translations: Record<string, string>;
  comment?: string;
  tags?: string[];
  metadata: Record<string, ResourceEntryMetadata>;
}

export interface FolderChild {
  name: string;
  fullPathSegments: string[];
  loaded: boolean;
  tree?: ResourceTreeNode;
}

export interface LoadResourceTreeOptions {
  /** Root translations folder path */
  translationsFolder: string;

  /** Folder to start from (dot-delimited, empty for root) */
  path?: string;

  /** Depth to recursively load */
  depth?: number;

  /** Current working directory */
  cwd?: string;
}
```

#### Algorithm

```typescript
export function loadResourceTree(options: LoadResourceTreeOptions): ResourceTreeNode {
  // 1. Parse path into folder segments
  // 2. Resolve absolute folder path using existing utilities
  // 3. If folder doesn't exist, throw error
  // 4. Initialize visited paths set for cycle detection
  // 5. Call recursive load function
}

function loadFolderRecursive(
  folderPath: string,
  pathSegments: string[],
  currentDepth: number,
  maxDepth: number,
  visitedPaths: Set<string>
): ResourceTreeNode {
  // 1. Check for cycle using fs.realpathSync()
  // 2. Load resource_entries.json and tracker_meta.json
  // 3. Build ResourceTreeEntry array
  // 4. If currentDepth < maxDepth:
  //    - Scan for subdirectories
  //    - Recursively load children (currentDepth + 1)
  // 5. If currentDepth >= maxDepth:
  //    - List subdirectories but mark loaded=false
  // 6. Return ResourceTreeNode
}
```

The implementation reuses the pattern from `loadFolderRecursively` in `export-common.ts` but with:
- Depth limiting
- Cycle detection for symlinks
- Different return structure (tree vs flat list)

---

## Error Handling & Edge Cases

### API Controller Error Handling

Following the existing pattern in `ResourcesController`:

#### 400 Bad Request
- Invalid path format (contains invalid characters)
- Depth out of bounds (< 0 or > 10)
- Path references non-existent folder

#### 404 Not Found
- Collection doesn't exist in configuration
- Folder path doesn't exist in translations structure

#### 500 Internal Server Error
- File system read errors
- JSON parse errors in resource files
- Unexpected errors during traversal

### Core Library Edge Cases

#### Missing or corrupted files
- If `resource_entries.json` exists but `tracker_meta.json` is missing: skip resources in that folder, log warning
- If JSON is malformed: skip folder, return partial tree with error indication
- If folder has no resource files: return empty `resources: []` array, continue to children

#### Symlinks
- Follow symlinks normally using standard directory traversal
- Track visited real paths using `fs.realpathSync()` to prevent infinite loops
- If a symlink creates a cycle (already visited real path), skip that child folder

#### Depth boundary
- At `depth=0`: load current folder resources but mark all children as `loaded: false`
- Children array still populated with folder names for UI tree structure
- Allows progressive loading - UI can request specific child folders

#### Empty folders
- Return valid tree with empty `resources: []` and populated `children`
- Allows UI to show folder structure even without translations yet

#### Hidden folders
- Skip folders starting with `.` (like `.git`, `.DS_Store` parent folders)
- Standard practice for file system traversal

---

## Testing Strategy

### Core Library Tests

**File**: `libs/core/src/lib/resource/load-resource-tree.spec.ts`

Following the Vitest pattern used in other core tests:

#### Unit Tests
- ✓ Load root folder with `depth=0` (resources only, children marked unloaded)
- ✓ Load root folder with `depth=2` (recursive loading)
- ✓ Load nested folder path (e.g., "apps.common")
- ✓ Load folder with no resources (empty array)
- ✓ Load folder with no children (empty children array)
- ✓ Handle missing `tracker_meta.json` gracefully
- ✓ Handle malformed JSON files
- ✓ Handle non-existent folder path (throws error)
- ✓ Respect depth parameter (don't load beyond specified depth)
- ✓ Track visited paths to prevent symlink cycles
- ✓ Skip hidden folders (starting with `.`)

#### Test Fixture Structure
```
test-fixtures/load-resource-tree/
  collection1/
    en/
      resource_entries.json
      tracker_meta.json
      apps/
        common/
          resource_entries.json
          tracker_meta.json
          buttons/
            resource_entries.json
            tracker_meta.json
```

### API Controller Tests

**File**: `apps/api/src/app/collections/resources/resources.controller.spec.ts`

#### Integration Tests
- ✓ `GET /api/collections/:name/resources/tree` - returns root tree with default depth
- ✓ `GET` with `?path=apps.common` - returns nested folder tree
- ✓ `GET` with `?depth=0` - returns only current folder resources
- ✓ `GET` with `?depth=5` - respects depth parameter
- ✓ Returns 404 for non-existent collection
- ✓ Returns 404 for non-existent folder path
- ✓ Returns 400 for invalid depth values (negative, > 10)
- ✓ Returns 400 for malformed path parameter

### Mapper Tests

**File**: `apps/api/src/app/mappers/resource-tree.mapper.spec.ts`

#### Unit Tests
- ✓ Map domain `ResourceTreeNode` to `ResourceTreeDto`
- ✓ Extract status from metadata for each locale correctly
- ✓ Build recursive structure for loaded children
- ✓ Mark unloaded children correctly
- ✓ Handle missing metadata fields gracefully

---

## Phased Implementation Plan

### Phase 1: Data Transfer Objects (DTOs)

**Estimated Effort**: Small (1-2 hours)

**Files to create**:
- `libs/data-transfer/src/lib/resource-tree.dto.ts`

**Tasks**:
1. Define `ResourceTreeDto` interface
2. Define `ResourceSummaryDto` interface
3. Define `FolderNodeDto` interface
4. Export from `libs/data-transfer/src/index.ts`
5. Ensure `TranslationStatus` type is exported from core

**Validation**:
- DTOs compile without errors
- Can be imported by API project
- Run `pnpm nx build data-transfer`

**Dependencies**: None

---

### Phase 2: Core Library - Domain Models & Logic

**Estimated Effort**: Medium (4-6 hours)

**Files to create**:
- `libs/core/src/lib/resource/load-resource-tree.ts`
- `libs/core/src/lib/resource/load-resource-tree.spec.ts`

**Tasks**:
1. Define domain model interfaces (`ResourceTreeNode`, `ResourceTreeEntry`, `FolderChild`)
2. Define `LoadResourceTreeOptions` interface
3. Implement `loadResourceTree()` main function
4. Implement `loadFolderRecursive()` helper with:
   - Resource and metadata loading
   - Recursive child traversal
   - Depth limiting logic
   - Symlink cycle detection using `fs.realpathSync()` and visited Set
   - Hidden folder filtering
5. Handle missing/corrupted files gracefully (try-catch, warnings)
6. Create test fixtures with nested folder structure
7. Write comprehensive unit tests (all scenarios listed in Testing Strategy)
8. Export from `libs/core/src/index.ts`

**Validation**:
- All unit tests pass: `pnpm nx test core --testFile=src/lib/resource/load-resource-tree.spec.ts`
- Code coverage > 80%
- Build succeeds: `pnpm nx build core`

**Dependencies**: Phase 1 (needs domain understanding, though not direct DTO dependency)

---

### Phase 3: API Layer - Mapper

**Estimated Effort**: Small-Medium (2-3 hours)

**Files to create**:
- `apps/api/src/app/mappers/resource-tree.mapper.ts`
- `apps/api/src/app/mappers/resource-tree.mapper.spec.ts`

**Tasks**:
1. Implement `mapResourceTreeToDto(node: ResourceTreeNode): ResourceTreeDto`
2. Implement `mapResourceEntryToSummary(entry: ResourceTreeEntry): ResourceSummaryDto`
   - Extract translations from entry
   - Extract status from metadata per locale
   - Include comment and tags
3. Implement recursive mapping for children:
   - Map loaded children by recursively calling `mapResourceTreeToDto`
   - Keep unloaded children with `loaded: false`
4. Convert path segments to dot-delimited strings
5. Write unit tests for:
   - Simple tree mapping
   - Recursive child mapping
   - Status extraction
   - Missing optional fields (comment, tags)

**Validation**:
- Mapper tests pass
- Correctly transforms domain models to DTOs
- Run `pnpm nx test api --testFile=src/app/mappers/resource-tree.mapper.spec.ts`

**Dependencies**: Phases 1 and 2

---

### Phase 4: API Layer - Controller Endpoint

**Estimated Effort**: Medium (3-4 hours)

**Files to modify**:
- `apps/api/src/app/collections/resources/resources.controller.ts`
- `apps/api/src/app/collections/resources/resources.controller.spec.ts`

**Tasks**:
1. Add `@Get('tree')` endpoint method to `ResourcesController`
2. Extract and validate query parameters:
   - `path` (optional string, default empty)
   - `depth` (optional number, default 2, validate 0-10 range)
3. Decode `collectionName` from URL parameter
4. Retrieve collection config from `ConfigService`
5. Validate collection exists (404 if not)
6. Call `loadResourceTree()` from core library with options
7. Use `mapResourceTreeToDto()` to convert result
8. Implement error handling:
   - Catch "folder not found" errors → 404
   - Catch validation errors → 400
   - Catch unexpected errors → 500
9. Write integration tests:
   - Successful tree loading scenarios
   - Error cases (invalid collection, path, depth)
   - Query parameter variations

**Validation**:
- Integration tests pass
- Endpoint returns correct HTTP status codes
- Run `pnpm nx test api --testFile=src/app/collections/resources/resources.controller.spec.ts`
- Manual smoke test with `pnpm run serve:api`

**Dependencies**: Phases 1, 2, and 3

---

### Phase 5: End-to-End Testing & Documentation

**Estimated Effort**: Small (1-2 hours)

**Tasks**:
1. Start API server: `pnpm run serve:api`
2. Manual testing with curl/Postman:
   ```bash
   # Test root loading
   curl "http://localhost:3030/api/collections/my-collection/resources/tree"

   # Test nested path
   curl "http://localhost:3030/api/collections/my-collection/resources/tree?path=apps.common"

   # Test depth parameter
   curl "http://localhost:3030/api/collections/my-collection/resources/tree?depth=0"
   curl "http://localhost:3030/api/collections/my-collection/resources/tree?depth=3"

   # Test error cases
   curl "http://localhost:3030/api/collections/non-existent/resources/tree"
   curl "http://localhost:3030/api/collections/my-collection/resources/tree?path=invalid.path"
   curl "http://localhost:3030/api/collections/my-collection/resources/tree?depth=99"
   ```
3. Verify response structure matches DTOs
4. Test with real translation data
5. Update API documentation:
   - Add Swagger/NestJS decorators if needed
   - Document query parameters
   - Add example responses
6. Update `CLAUDE.md` or `README.md` with new endpoint

**Validation**:
- API works end-to-end with real data
- Response format matches specification
- Documentation is accurate and complete
- All error cases handled gracefully

**Dependencies**: Phase 4

---

## Implementation Notes

### Reusable Patterns

This implementation follows existing patterns from:
- **Resource loading**: Similar to `export-common.ts` `loadFolderRecursively()`
- **Path resolution**: Uses utilities from `resource-file-paths.ts`
- **Controller pattern**: Matches existing `createResources()`, `delete()`, `move()` endpoints
- **Error handling**: Consistent with other endpoints (404, 400, 500)

### Future Enhancements (Out of Scope)

These are explicitly NOT part of this initial implementation:

- Pagination within a single folder (assumes reasonable folder sizes)
- Filtering resources by status or tags (can be added later via query params)
- Caching or ETag support for performance
- WebSocket/SSE for real-time updates
- Bulk operations on tree structures

### Performance Considerations

- Default depth of 2 balances initial load vs subsequent requests
- Max depth of 10 prevents excessive recursion
- Symlink cycle detection prevents infinite loops
- Skip hidden folders reduces unnecessary I/O
- No pagination assumes folders won't exceed reasonable sizes (if they do, that's a sign to reorganize structure)

---

## Success Criteria

The feature is complete when:

1. ✓ All unit tests pass for core library
2. ✓ All integration tests pass for API controller
3. ✓ Manual testing shows correct behavior with real data
4. ✓ Error cases are handled gracefully
5. ✓ Documentation is updated
6. ✓ Code follows existing architectural patterns
7. ✓ TypeScript compilation succeeds with no errors
8. ✓ `pnpm run build` succeeds for all affected projects
