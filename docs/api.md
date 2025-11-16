# LingoTracker API Reference

## Overview

The LingoTracker API provides REST endpoints for managing translation resources, collections, and configuration.

- **Base URL**: `http://localhost:3030/api`
- **Default Port**: `3030` (configurable via `LINGO_TRACKER_PORT` environment variable)
- **Content-Type**: `application/json`
- **Response Format**: JSON
- **CORS**: Enabled with wildcard origin (`*`) in development
- **Swagger Documentation**: Available at `http://localhost:3030/api` when the server is running

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible.

## Health Check

### Get Health Status

Returns the health status of the API server.

**Endpoint**: `GET /api/health`

**Response**:

```json
{
  "status": "all is good"
}
```

**Status Codes**:
- `200 OK`: Server is healthy

**Example**:

```bash
curl http://localhost:3030/api/health
```

## Configuration API

### Get Configuration

Retrieves the current LingoTracker configuration including global settings and all collections.

**Endpoint**: `GET /api/config`

**Response**:

```typescript
interface LingoTrackerConfigDto {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, LingoTrackerCollectionDto>;
}

interface LingoTrackerCollectionDto {
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  baseLocale?: string;
  locales?: string[];
}
```

**Example Response**:

```json
{
  "exportFolder": "./exports",
  "importFolder": "./imports",
  "baseLocale": "en",
  "locales": ["en", "es", "fr", "de"],
  "collections": {
    "web-app": {
      "translationsFolder": "./apps/web/src/assets/i18n",
      "baseLocale": "en",
      "locales": ["en", "es", "fr"]
    },
    "mobile-app": {
      "translationsFolder": "./apps/mobile/src/i18n",
      "baseLocale": "en",
      "locales": ["en", "es"]
    }
  }
}
```

**Status Codes**:
- `200 OK`: Configuration retrieved successfully
- `500 Internal Server Error`: Configuration file could not be read

**Example**:

```bash
curl http://localhost:3030/api/config
```

## Collections API

### Create Collection

Creates a new translation collection with specified configuration.

**Endpoint**: `POST /api/collections`

**Request Body**:

```typescript
interface CreateCollectionDto {
  name: string;
  collection: LingoTrackerCollectionDto;
}

interface LingoTrackerCollectionDto {
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  baseLocale?: string;
  locales?: string[];
}
```

**Example Request**:

```json
{
  "name": "admin-portal",
  "collection": {
    "translationsFolder": "./apps/admin/src/i18n",
    "baseLocale": "en",
    "locales": ["en", "es", "fr", "de"]
  }
}
```

**Response**:

```json
{
  "message": "Collection 'admin-portal' added successfully"
}
```

**Status Codes**:
- `200 OK`: Collection created successfully
- `400 Bad Request`: Invalid request body or collection already exists
- `500 Internal Server Error`: Unexpected error during collection creation

**Example**:

```bash
curl -X POST http://localhost:3030/api/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "admin-portal",
    "collection": {
      "translationsFolder": "./apps/admin/src/i18n",
      "baseLocale": "en",
      "locales": ["en", "es", "fr"]
    }
  }'
```

**Error Example** (Collection Already Exists):

```bash
curl -X POST http://localhost:3030/api/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-app",
    "collection": {
      "translationsFolder": "./apps/web/src/i18n"
    }
  }'
```

Response:
```json
{
  "statusCode": 400,
  "message": "Collection 'web-app' already exists"
}
```

### Delete Collection

Deletes a collection by name.

**Endpoint**: `DELETE /api/collections/:collectionName`

**Path Parameters**:
- `collectionName` (string, required): The name of the collection to delete (URL-encoded if necessary)

**Response**:

```json
{
  "message": "Collection \"admin-portal\" deleted successfully"
}
```

**Status Codes**:
- `200 OK`: Collection deleted successfully
- `400 Bad Request`: Collection not found or deletion error
- `500 Internal Server Error`: Unexpected error during deletion

**Example**:

```bash
curl -X DELETE http://localhost:3030/api/collections/admin-portal
```

**Example with URL-Encoded Name**:

```bash
# For a collection named "my collection" (with space)
curl -X DELETE http://localhost:3030/api/collections/my%20collection
```

**Error Example** (Collection Not Found):

```bash
curl -X DELETE http://localhost:3030/api/collections/non-existent
```

Response:
```json
{
  "statusCode": 400,
  "message": "Collection 'non-existent' not found"
}
```

## Resources API

All resource endpoints are scoped to a specific collection.

### Add Resource(s)

Creates one or more translation resource entries within a collection. Supports both single resource and bulk operations.

**Endpoint**: `POST /api/collections/:collectionName/resources`

**Path Parameters**:
- `collectionName` (string, required): The name of the collection (URL-encoded if necessary)

**Request Body** (Single Resource):

```typescript
interface CreateResourceDto {
  /** Dot-delimited key, e.g., "apps.common.buttons.ok" */
  key: string;
  /** Base locale value (the source text) */
  baseValue: string;
  /** Optional context for translators */
  comment?: string;
  /** Optional tags (stored as array) */
  tags?: string[];
  /** Optional target folder to override part of the path */
  targetFolder?: string;
  /** Base locale (defaults to collection's baseLocale) */
  baseLocale?: string;
  /** Localized translations with locale, value, and status */
  translations?: Array<{
    locale: string;
    value: string;
    status: 'new' | 'translated' | 'stale' | 'verified';
  }>;
}
```

**Request Body** (Multiple Resources):

```typescript
type CreateResourcesRequest = CreateResourceDto[];
```

**Example Request** (Single Resource with Manual Translations):

```json
{
  "key": "apps.common.buttons.ok",
  "baseValue": "OK",
  "comment": "Standard confirmation button",
  "tags": ["ui", "button"],
  "translations": [
    {
      "locale": "es",
      "value": "Aceptar",
      "status": "translated"
    },
    {
      "locale": "fr",
      "value": "D'accord",
      "status": "verified"
    },
    {
      "locale": "de",
      "value": "OK",
      "status": "new"
    }
  ]
}
```

**Example Request** (Single Resource with Auto-Generated Translations):

If `translations` is not provided, the system will automatically create entries for all configured locales with the base value and status `"new"`.

```json
{
  "key": "apps.common.buttons.cancel",
  "baseValue": "Cancel",
  "comment": "Standard cancel button"
}
```

**Example Request** (Bulk Creation):

```json
[
  {
    "key": "apps.common.buttons.save",
    "baseValue": "Save",
    "comment": "Save button"
  },
  {
    "key": "apps.common.buttons.delete",
    "baseValue": "Delete",
    "comment": "Delete button",
    "tags": ["dangerous"]
  },
  {
    "key": "apps.common.messages.success",
    "baseValue": "Operation completed successfully",
    "translations": [
      {
        "locale": "es",
        "value": "Operación completada con éxito",
        "status": "verified"
      }
    ]
  }
]
```

**Response**:

```typescript
interface CreateResourceResponseDto {
  /** Number of entries that were created (count of new resources) */
  entriesCreated: number;
  /** Whether at least one resource entry was newly created */
  created: boolean;
}
```

**Example Response** (Bulk Creation):

```json
{
  "entriesCreated": 3,
  "created": true
}
```

**Status Codes**:
- `200 OK`: Resources processed successfully (check `entriesCreated` to see how many were new)
- `400 Bad Request`: Invalid request body, validation error, or empty resource array
- `404 Not Found`: Collection not found
- `500 Internal Server Error`: Unexpected error during resource creation

**Translation Status Values**:
- `new`: Not yet translated (default for auto-generated translations)
- `translated`: Has translation but not verified
- `stale`: Base value changed, translation is out of sync
- `verified`: Reviewed and approved

**Key Format**:
- Keys must be dot-delimited (e.g., `apps.common.buttons.ok`)
- Keys are decomposed into folder paths: `apps.common.buttons.ok` → `apps/common/buttons/` folder with `ok` as the entry key
- The file structure is created automatically based on the key

**Examples**:

**Single Resource with Default Translations**:

```bash
curl -X POST http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "key": "apps.common.buttons.ok",
    "baseValue": "OK",
    "comment": "Confirmation button"
  }'
```

**Single Resource with Specific Translations**:

```bash
curl -X POST http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "key": "apps.common.buttons.cancel",
    "baseValue": "Cancel",
    "comment": "Cancel button",
    "tags": ["ui", "button"],
    "translations": [
      {
        "locale": "es",
        "value": "Cancelar",
        "status": "verified"
      },
      {
        "locale": "fr",
        "value": "Annuler",
        "status": "translated"
      }
    ]
  }'
```

**Bulk Resource Creation**:

```bash
curl -X POST http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '[
    {
      "key": "apps.common.buttons.save",
      "baseValue": "Save"
    },
    {
      "key": "apps.common.buttons.delete",
      "baseValue": "Delete",
      "tags": ["dangerous"]
    },
    {
      "key": "apps.common.messages.success",
      "baseValue": "Success!"
    }
  ]'
```

**Error Examples**:

Collection Not Found:
```bash
curl -X POST http://localhost:3030/api/collections/non-existent/resources \
  -H "Content-Type: application/json" \
  -d '{"key": "test.key", "baseValue": "Test"}'
```

Response:
```json
{
  "statusCode": 404,
  "message": "Collection \"non-existent\" not found"
}
```

Invalid Key Format:
```bash
curl -X POST http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "key": "invalid key with spaces",
    "baseValue": "Test"
  }'
```

Response:
```json
{
  "statusCode": 400,
  "message": "Validation error for resource: Invalid key format"
}
```

Empty Request:
```bash
curl -X POST http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '[]'
```

Response:
```json
{
  "statusCode": 400,
  "message": "At least one resource is required"
}
```

### Delete Resource(s)

Deletes one or more translation resource entries from a collection. This is a best-effort operation: if some keys fail to delete, the operation continues and returns details about failures.

**Endpoint**: `DELETE /api/collections/:collectionName/resources`

**Path Parameters**:
- `collectionName` (string, required): The name of the collection (URL-encoded if necessary)

**Request Body**:

```typescript
interface DeleteResourceDto {
  /** Array of full dot-delimited keys to delete */
  keys: string[];
}
```

**Example Request** (Single Key):

```json
{
  "keys": ["apps.common.buttons.ok"]
}
```

**Example Request** (Multiple Keys):

```json
{
  "keys": [
    "apps.common.buttons.ok",
    "apps.common.buttons.cancel",
    "apps.common.buttons.save",
    "apps.common.messages.success"
  ]
}
```

**Response**:

```typescript
interface DeleteResourceResponseDto {
  /** Number of resource entries successfully deleted */
  entriesDeleted: number;
  /** Optional array of errors for entries that failed to delete */
  errors?: Array<{
    /** The key that failed to delete */
    key: string;
    /** Error message describing why the deletion failed */
    error: string;
  }>;
}
```

**Example Response** (All Successful):

```json
{
  "entriesDeleted": 4,
  "errors": []
}
```

**Example Response** (Partial Success):

```json
{
  "entriesDeleted": 2,
  "errors": [
    {
      "key": "apps.common.buttons.nonexistent",
      "error": "Resource key not found"
    },
    {
      "key": "apps.invalid",
      "error": "Invalid key format"
    }
  ]
}
```

**Status Codes**:
- `200 OK`: Deletion attempted (check `entriesDeleted` and `errors` for details)
- `400 Bad Request`: Invalid request (missing or empty `keys` array)
- `404 Not Found`: Collection not found
- `500 Internal Server Error`: Unexpected error during deletion

**Best-Effort Behavior**:

The delete operation uses a best-effort approach:
- If some keys are valid and others are invalid, valid keys will be deleted
- If some keys exist and others don't, existing keys will be deleted
- The response includes `entriesDeleted` (count of successful deletions) and `errors` (array of failures)
- A `200 OK` response doesn't guarantee all deletions succeeded - always check the response body

**Examples**:

**Delete Single Resource**:

```bash
curl -X DELETE http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["apps.common.buttons.ok"]
  }'
```

**Delete Multiple Resources**:

```bash
curl -X DELETE http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "keys": [
      "apps.common.buttons.save",
      "apps.common.buttons.delete",
      "apps.common.buttons.cancel"
    ]
  }'
```

**Error Examples**:

Collection Not Found:
```bash
curl -X DELETE http://localhost:3030/api/collections/non-existent/resources \
  -H "Content-Type: application/json" \
  -d '{"keys": ["test.key"]}'
```

Response:
```json
{
  "statusCode": 404,
  "message": "Collection \"non-existent\" not found"
}
```

Empty Keys Array:
```bash
curl -X DELETE http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{"keys": []}'
```

Response:
```json
{
  "statusCode": 400,
  "message": "Invalid request: keys array is required and must not be empty"
}
```

Missing Keys Field:
```bash
curl -X DELETE http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "statusCode": 400,
  "message": "Invalid request: keys array is required and must not be empty"
}
```

Partial Failure (Some Keys Don't Exist):
```bash
curl -X DELETE http://localhost:3030/api/collections/web-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "keys": [
      "apps.common.buttons.ok",
      "apps.common.nonexistent.key",
      "apps.common.buttons.cancel"
    ]
  }'
```

Response:
```json
{
  "entriesDeleted": 2,
  "errors": [
    {
      "key": "apps.common.nonexistent.key",
      "error": "Resource key not found in resource_entries.json"
    }
  ]
}
```

## Error Responses

All error responses follow a consistent format:

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string; // Optional error type
}
```

### Common HTTP Status Codes

- **200 OK**: Request succeeded
- **400 Bad Request**: Invalid request body, missing required fields, or validation error
- **404 Not Found**: Resource or collection not found
- **500 Internal Server Error**: Unexpected server error

### Error Response Examples

**Validation Error** (400):
```json
{
  "statusCode": 400,
  "message": "Validation error for resource: Invalid key format"
}
```

**Not Found** (404):
```json
{
  "statusCode": 404,
  "message": "Collection \"unknown-collection\" not found"
}
```

**Server Error** (500):
```json
{
  "statusCode": 500,
  "message": "Error creating resources"
}
```

## Complete Workflow Examples

### Example 1: Create a Collection and Add Resources

```bash
# Step 1: Create a new collection
curl -X POST http://localhost:3030/api/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "collection": {
      "translationsFolder": "./src/i18n",
      "baseLocale": "en",
      "locales": ["en", "es", "fr"]
    }
  }'

# Response:
# {
#   "message": "Collection 'my-app' added successfully"
# }

# Step 2: Add resources to the collection
curl -X POST http://localhost:3030/api/collections/my-app/resources \
  -H "Content-Type: application/json" \
  -d '[
    {
      "key": "app.welcome.title",
      "baseValue": "Welcome",
      "comment": "Main welcome message"
    },
    {
      "key": "app.welcome.subtitle",
      "baseValue": "Start your journey here",
      "comment": "Welcome subtitle"
    }
  ]'

# Response:
# {
#   "entriesCreated": 2,
#   "created": true
# }

# Step 3: Verify the configuration
curl http://localhost:3030/api/config

# The response will include "my-app" in the collections
```

### Example 2: Add Translations and Update Status

```bash
# Add a resource with verified translations
curl -X POST http://localhost:3030/api/collections/my-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "key": "app.buttons.submit",
    "baseValue": "Submit",
    "comment": "Form submit button",
    "tags": ["form", "button"],
    "translations": [
      {
        "locale": "es",
        "value": "Enviar",
        "status": "verified"
      },
      {
        "locale": "fr",
        "value": "Soumettre",
        "status": "verified"
      }
    ]
  }'

# Response:
# {
#   "entriesCreated": 1,
#   "created": true
# }
```

### Example 3: Bulk Operations with Cleanup

```bash
# Add multiple resources
curl -X POST http://localhost:3030/api/collections/my-app/resources \
  -H "Content-Type: application/json" \
  -d '[
    {
      "key": "temp.test1",
      "baseValue": "Test 1"
    },
    {
      "key": "temp.test2",
      "baseValue": "Test 2"
    },
    {
      "key": "temp.test3",
      "baseValue": "Test 3"
    }
  ]'

# Response:
# {
#   "entriesCreated": 3,
#   "created": true
# }

# Clean up - delete the temporary resources
curl -X DELETE http://localhost:3030/api/collections/my-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["temp.test1", "temp.test2", "temp.test3"]
  }'

# Response:
# {
#   "entriesDeleted": 3,
#   "errors": []
# }
```

### Example 4: Error Handling in Bulk Operations

```bash
# Attempt to delete a mix of existing and non-existing keys
curl -X DELETE http://localhost:3030/api/collections/my-app/resources \
  -H "Content-Type: application/json" \
  -d '{
    "keys": [
      "app.welcome.title",
      "app.nonexistent.key",
      "app.welcome.subtitle",
      "another.nonexistent.key"
    ]
  }'

# Response (partial success):
# {
#   "entriesDeleted": 2,
#   "errors": [
#     {
#       "key": "app.nonexistent.key",
#       "error": "Resource key not found"
#     },
#     {
#       "key": "another.nonexistent.key",
#       "error": "Resource key not found"
#     }
#   ]
# }
```

## Notes and Best Practices

### Resource Keys

- Use dot-delimited format: `namespace.category.subcategory.item`
- Keys are case-sensitive
- Avoid special characters except dots and underscores
- Keys should be descriptive and hierarchical

### Translation Status Lifecycle

The typical status progression is:
1. `new` - Newly created, needs translation
2. `translated` - Translation provided, needs review
3. `verified` - Translation reviewed and approved
4. `stale` - Source text changed, translation needs updating (automatically set by checksum comparison)

### Bulk Operations

- The resources API supports both single and array payloads for creation
- Bulk creation processes all resources and returns the total count of created entries
- Individual resource errors during bulk creation are handled gracefully (partial success)
- Delete operations always use an array of keys and support partial success

### Best-Effort Deletes

- Delete operations continue even if some keys fail
- Always check both `entriesDeleted` and `errors` in the response
- Non-existent keys are reported in errors but don't stop deletion of valid keys
- This allows for idempotent cleanup scripts

### Checksums and Stale Detection

The system automatically:
- Computes MD5 checksums for base values and translations
- Detects when source text changes (marks translations as `stale`)
- Maintains metadata in `tracker_meta.json` files alongside `resource_entries.json`

### File Structure

Resources are stored as:
```
translations-folder/
  locale/
    namespace/
      category/
        resource_entries.json
        tracker_meta.json
```

Where:
- Key `apps.common.buttons.ok` becomes folder path `apps/common/buttons/`
- Entry key `ok` is stored in `resource_entries.json`
- Metadata (checksums, status) stored in `tracker_meta.json`
