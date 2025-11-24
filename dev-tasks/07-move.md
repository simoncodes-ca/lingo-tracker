# Feature: Move Translation Resources

This feature allows users to move or rename translation resources. It supports moving single resources as well as bulk moves using wildcard patterns.

## Capabilities

### 1. Move Single Resource
Move a specific resource from one key to another.
- **Source**: `common.buttons.ok`
- **Destination**: `common.actions.ok`

### 2. Move Multiple Resources (Wildcard)
Move a group of resources matching a pattern to a new location.
- **Pattern**: `common.buttons.*`
- **Destination**: `common.actions`
- **Result**:
  - `common.buttons.ok` -> `common.actions.ok`
  - `common.buttons.cancel` -> `common.actions.cancel`

## Logic & Validation

### Resolution
1. **Single Move**:
   - Validate source key exists.
   - Validate destination key is valid and does not already exist (unless overwrite flag is provided - *optional consideration*).
   - Perform move.

2. **Wildcard Move**:
   - Identify all keys matching the source pattern.
   - For each match:
     - Extract the relative suffix (part matched by `*`).
     - Construct new key: `destination + '.' + suffix`.
     - Perform move.

### File Operations
Moving a resource involves:
1. **Read**: Retrieve data (source, comments, tags, translations, metadata) from source entry.
2. **Write**: Add data to destination entry (creating folders/files if needed).
3. **Delete**: Remove source entry.
4. **Cleanup**: Remove empty source files/folders if they become empty.

## Reporting

At the end of the operation, a report should be displayed:
- **Summary**: Total number of resources moved.
- **Warnings**: Any non-fatal errors or warnings that occurred during the process (e.g., skipped keys).
- **Verbose Mode**: If enabled, print each move operation as it happens (e.g., `Moved common.buttons.ok -> common.actions.ok`).

## Usage

### CLI
```bash
# Move single resource
lingo-tracker move \
  --source common.buttons.ok \
  --dest common.actions.ok \
  --verbose

# Move with wildcard
lingo-tracker move \
  --pattern "common.buttons.*" \
  --dest "common.actions"
```

### API
```bash
# Move resources
POST /api/collections/:collection/resources/move
Content-Type: application/json

{
  "moves": [
    {
      "source": "common.buttons.ok",
      "destination": "common.actions.ok"
    }
  ]
}
```
*Note: For wildcard moves via API, the client would typically resolve the pattern to a list of specific moves, or the API could support a pattern-based move operation.*
