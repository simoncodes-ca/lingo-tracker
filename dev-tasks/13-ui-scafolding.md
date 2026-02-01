# Feature: Translation Browser

This feature provides an interface for browsing, searching, and managing translations within a resource collection.
Main component with split layout: folder tree on left, translation list on right.

## Supporting Components
- `FolderTree` - Left sidebar with hierarchical folder navigation and search
- `TranslationList` - Main area displaying translation entries
- `TranslationItem` - Individual translation entry with locale lines
- `LocaleFilter` - Multi-select control for showing/hiding locales

## User Flows

1. **Browse by Folder** - Navigate folder tree, see translations from selected folder
2. **Load Folders** - Click unloaded folders to progressively load tree
3. **Search Folder Tree** - Filter tree to matching folders only
4. **Search Translations** - Server-side search, folder tree disabled during search
5. **Filter Locales** - Show/hide specific locales in the list
6. **Copy Translation Key** - Click key to copy to clipboard, see toast
7. **Load More** - Load translations from immediate child folders
8. **Edit Translation** - Open modal editor from context menu
9. **Move Translation** - Select new folder from tree picker modal
10. **Delete Translation** - Remove translation entry

## Performance Considerations

- Use virtual scrolling for translation list with 100+ items
- Implement debouncing for search input (300ms recommended)
- Load folders progressively rather than entire tree at once
- Consider pagination or infinite scroll for very large translation sets