# Feature: Translation Collections

In a monorepo context it may be desirable to have multiple translation collections (translation sources) that LingoTracker should handle.

## Overview

Collections allow organizing translation resources into separate, isolated groups. Each collection has its own configuration and translation files, making it possible to manage translations for different applications or modules within the same project.

## Implemented Features

### Configuration Structure
- **LingoTrackerCollection**: Interface extending base config for individual collections
- **Collections Property**: Array of collections in main `.lingo-tracker.json`
- **Collection-Specific Config**: Each collection can override global settings

### CLI Commands
- **Init**: Prompts for collection name during initialization
- **Add Collection**: Create new collections via CLI
- **Delete Collection**: Remove collections by name

### API Endpoints
- **Delete Collection**: DELETE endpoint for removing collections by name
- **Create Collection**: POST endpoint with DTOs and mappers

### Tracker UI
- **Collection List View**: Card-based display of available collections
- **Collection Selection**: Automatic selection for single collection, picker for multiple
- **Collection Switching**: Navigate between collections
- **Delete Collection**: Icon button on collection cards with confirmation dialog
- **Create Collection**: Dialog-based creation with validation and API integration

## Usage

### CLI
```bash
# Initialize with collection
lingo-tracker init

# Add new collection
lingo-tracker add-collection --name my-collection

# Delete collection
lingo-tracker delete-collection --name my-collection
```

### API
```bash
# Create collection
POST /api/collections
{
  "name": "my-collection",
  "config": { ... }
}

# Delete collection
DELETE /api/collections/:name
```

## Future Enhancements

- Edit collection functionality from Tracker UI

---

**Status**: Core collection management completed. Edit functionality pending.
