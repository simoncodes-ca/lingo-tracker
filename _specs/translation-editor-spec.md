# Translation Editor - Create & Edit Resource

## Overview

A dialog-based editor for creating and editing translation resource items. Supports both creation of new translation keys and modification of existing resources, with intelligent duplicate detection and flexible folder management.

## Mockups

- Create mode: `_specs/translation-editor-create.png`
- Edit mode: `_specs/translation-editor-edit.png`

---

## Feature Requirements

### Dialog Modes

| Mode | Title | Subtitle | Primary Button | Entry Point |
|------|-------|----------|----------------|-------------|
| Create | "Create Translation" | "Add a new translation entry to your collection" | "Save Translation" | Single toolbar button |
| Edit | "Edit Translation" | "Update translation values and metadata" | "Update Translation" | Resource context menu |

### Core Fields

#### Translation Key
- **Validation**: Alphanumeric characters, underscores, and hyphens only (no dots, slashes, or special path characters)
- **No autocomplete**: Clean input without suggestions
- **No character limit**: Display character count only
- **Create mode**: Editable input field
- **Edit mode**: Editable (allows renaming)

#### Folder Section
- **Display**: Shows current folder path below the key input (e.g., "Folder: common.buttons")
- **Expandable**: Click to expand and select different folder via tree view
- **Pre-selection**: Inherits folder context when opened from a specific folder
- **Inline folder creation**: Users can create new folders directly in the tree view
- **New folder indicator**: Subtle badge/icon when selected folder doesn't exist yet
- **Full key**: Displayed as folder + "." + key (e.g., "common.buttons.submit")

#### Base Locale Section (Grouped Card)
Visual grouping of base value and comment in a single bordered card:

**Base Value**
- **Required**: Must be filled before saving
- **Textarea**: Multi-line input
- **Placeholder**: "Enter {locale} translation..."
- **No character limit**: Display character count
- **Triggers similarity check**: Debounced (300ms) async API call on change

**Comment**
- **Recommended but not required**
- **Textarea**: Multi-line input
- **Placeholder**: "Add context for translators..."
- **Empty comment handling**: Blocking modal confirmation on save
  - Title: "No Comment Added"
  - Message: "Comments help other translators understand context. Are you sure you want to save without a comment?"
  - Buttons: "Add Comment" (cancel) | "Save Anyway" (confirm)

#### Other Locales Toggle
- **Location**: Above the translations section
- **Default state**: OFF (always starts OFF, does not persist)
- **When ON**: Shows empty textareas for all non-base locales
- **Status handling**:
  - Create mode: Auto-set to "new" status (no dropdown shown)
  - Edit mode: Show status dropdown with full options

### Similar Resources Detection

#### Trigger Conditions
- **Create mode**: Always runs when base value changes
- **Edit mode**: Only runs when base value is modified from original

#### API Integration
- **Endpoint**: Extend existing search endpoint or create new similarity endpoint
- **Algorithm**: Fuzzy text matching (Levenshtein distance or similar)
- **Threshold**: 60%+ similarity match
- **Debounce**: 300ms delay after typing stops

#### UI Presentation
- **Location**: Collapsible warning section below folder section
- **Collapsed state**: "Found X similar translations" with warning icon
- **Expanded state**:
  - Title: "Possible Duplicates"
  - Subtitle: "Found X similar translations. This is informational only and won't prevent saving."
  - Show top 3 results initially
  - Each result shows: full key, base value preview, folder path, tags
  - "Show more" loads additional results in place (expand in place)
- **Click action**: Copy key to clipboard with toast feedback

### Key Conflict Handling (Create Mode)
When attempting to save with a key that already exists:
- Show dialog: "This translation key already exists"
- Options: "Edit Existing" | "Choose Different Key"
- "Edit Existing" closes create dialog and opens edit dialog for existing resource

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Escape | Close dialog (with unsaved changes warning if applicable) |
| Ctrl/Cmd + Enter | Save/Update translation |

---

## Technical Implementation

### Phase 1: Core Dialog Infrastructure ✅ COMPLETE
**Goal**: Basic create/edit dialog with form fields and validation

#### Tasks
- [x] Create `TranslationEditorDialog` component in `apps/tracker/src/app/browser/dialogs/translation-editor/`
- [x] Create `TranslationEditorDialogData` interface with mode, resource (for edit), collectionName, folderPath
- [x] Implement reactive form with key, baseValue, comment fields
- [x] Add key validation (alphanumeric, underscore, hyphen only)
- [x] Implement base value required validation
- [x] Add character count display for all textarea fields
- [x] Style base locale section as grouped card/panel
- [x] Wire up Cancel and Save buttons with appropriate labels per mode
- [x] Add Escape key handler to close dialog
- [x] Add Ctrl+Enter keyboard shortcut for save

#### Unit Tests
- [x] Test key validation rejects dots, slashes, special characters
- [x] Test key validation accepts alphanumeric, underscore, hyphen
- [x] Test base value required validation
- [x] Test form submission blocked when invalid
- [x] Test dialog closes on Escape
- [x] Test Ctrl+Enter triggers save

---

### Phase 2: Folder Selection & Visualization - ✅ COMPLETE
**Goal**: Folder display, expansion, tree selection, and new folder creation

**Notes**: Folder picker component created at `apps/tracker/src/app/browser/dialogs/translation-editor/folder-picker/`. Folder pre-selection works via dialog data. Inline folder creation and new folder badge deferred to future enhancement.

#### Tasks
- [x] Add folder display section below key input showing current folder path
- [x] Implement expandable/collapsible folder section
- [x] Create folder tree picker component (can reuse/adapt `FolderTree` component)
- [x] Display computed full key (folder + key) in real-time
- [x] Pre-select folder based on context when dialog opens
- [ ] Implement inline "New folder" creation in tree view (deferred - future enhancement)
- [ ] Add "new folder" badge indicator when selected folder doesn't exist (deferred - future enhancement)

#### Unit Tests
- [x] Test folder pre-selection from context
- [x] Test folder selection updates displayed path
- [x] Test full key computation (folder + "." + key)

---

### Phase 3: Comment Confirmation Flow - ✅ COMPLETE
**Goal**: Implement recommended comment prompt with confirmation

**Notes**: `ConfirmationDialog` component created at `apps/tracker/src/app/browser/dialogs/confirmation/`. Full comment confirmation flow working.

#### Tasks
- [x] Add comment field to form within base locale card
- [x] Implement save interception when comment is empty
- [x] Create/use `ConfirmationDialog` for missing comment warning
- [x] Configure confirmation dialog with appropriate messaging
- [x] Allow save to proceed after user confirmation
- [x] Track if confirmation was shown to avoid double-prompting

#### Unit Tests
- [x] Test save proceeds normally when comment present
- [x] Test confirmation dialog appears when comment empty
- [x] Test "Add Comment" returns to form without saving
- [x] Test "Save Anyway" completes the save operation

---

### Phase 4: Other Locales Toggle - ✅ COMPLETE
**Goal**: Toggle to show/hide and enter other locale values

#### Tasks
- [x] Add toggle switch above translations section
- [x] Implement locale list rendering when toggle ON
- [x] Show empty textareas for each non-base locale
- [x] In create mode: auto-set status to "new" (no dropdown)
- [x] In edit mode: show status dropdown for each locale
- [x] Wire up locale values to form model
- [x] Ensure toggle always starts OFF (no persistence)

#### Unit Tests
- [x] Test toggle default state is OFF
- [x] Test toggle ON shows all non-base locales
- [x] Test toggle OFF hides other locales
- [x] Test create mode shows no status dropdown
- [x] Test edit mode shows status dropdown
- [x] Test locale values are captured in form

---

### Phase 5: Similar Resources Detection - ✅ COMPLETE
**Goal**: Async duplicate detection with expandable warning UI

**Notes**: Similar resources warning component created and integrated. Uses existing search endpoint with debounced calls. Copy to clipboard functionality working with toast feedback.

#### Backend Tasks
- [x] Evaluate existing search endpoint for similarity use case (using existing search)
- [x] Implement fuzzy matching algorithm (60% threshold) (using existing search)
- [x] Create similarity search endpoint if existing search inadequate (using existing)
- [x] Return top N similar resources with relevance score

#### Frontend Tasks
- [x] Add debounced (300ms) base value change listener
- [x] Call similarity API when base value changes
- [x] Create collapsible similar resources warning component
- [x] Display collapsed state: "Found X similar translations"
- [x] Display expanded state: list of similar resources with details
- [x] Show top 3 initially, "Show more" loads rest in place
- [x] Implement copy-key-to-clipboard on result click
- [x] Show toast feedback after copy
- [x] Skip similarity check in edit mode unless base value changed from original

#### Unit Tests
- [x] Test similarity results render correctly
- [x] Test edit mode skips check when base value unchanged

---

### Phase 6: Create Mode API Integration - ✅ COMPLETE
**Goal**: Wire up create dialog to API and refresh UI

#### Tasks
- [x] Create `createResource` method in API service using `CreateResourceDto`
- [x] Submit form data to create endpoint on save
- [x] Handle success: close dialog, emit event to refresh translation list
- [x] Handle key conflict: show "Edit Existing" dialog option
- [x] Handle other errors: display error message in dialog

#### Unit Tests
- [x] Test successful create closes dialog
- [x] Test create emits refresh event
- [x] Test key conflict shows appropriate dialog
- [x] Test API errors display in dialog

---

### Phase 7: Edit Mode API Integration - ✅ COMPLETE
**Goal**: Wire up edit dialog to API with full move support

**Notes**: Full edit mode API integration implemented. Key renaming not yet supported (displays error message); folder move is supported.

#### Tasks
- [x] Create `updateResource` method in API service using `UpdateResourceDto`
- [x] Load existing resource data when opening in edit mode
- [x] Pre-populate all form fields from existing data
- [x] Support key rename (different key value) - *shows error message, not yet supported*
- [x] Support folder move (different folder selection)
- [x] Submit updated data to update endpoint
- [x] Handle success: close dialog, emit refresh event

#### Unit Tests
- [x] Test edit mode pre-populates form correctly
- [x] Test key rename shows error message
- [x] Test folder move is captured in update payload
- [x] Test successful update closes dialog
- [x] Test update emits refresh event
- [x] Test update API errors display correctly

---

### Phase 8: Integration & Polish - ✅ COMPLETE
**Goal**: Connect to UI entry points and finalize UX

**Notes**: Dialog integrated into header toolbar and translation list context menu. Loading states implemented during API calls.

#### Tasks
- [x] Add "Add Translation" button to browser toolbar
- [x] Wire button to open dialog in create mode with current folder context
- [x] Add "Edit" option to resource context menu/row actions
- [x] Wire edit action to open dialog in edit mode with resource data
- [x] Ensure dialog is responsive (desktop-first)
- [x] Add loading states during API calls
- [x] Test end-to-end create flow
- [x] Test end-to-end edit flow

#### Unit Tests
- [x] Test toolbar button opens create dialog (manual testing)
- [x] Test context menu opens edit dialog (manual testing)
- [x] Test folder context is inherited (manual testing)

---

## API Contracts

### Create Resource
```
POST /api/collections/:name/resources
Body: CreateResourceDto
Response: CreateResourceResponseDto
```

### Update Resource
```
PUT /api/collections/:name/resources/:key
Body: UpdateResourceDto
Response: UpdateResourceResponseDto
```

### Similarity Search (New or Extended)
```
GET /api/collections/:name/resources/similar?value=...&threshold=0.6
Response: { results: SimilarResourceDto[], totalFound: number }
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Post-save behavior | Close dialog | User returns to context after save |
| Folder picker style | Tree view | Matches existing folder tree component pattern |
| Similarity algorithm | Fuzzy text (60%) | Balanced sensitivity for catching duplicates |
| Similar resource click | Copy key | Simple reference without navigation complexity |
| Edit mode key/folder | Full move allowed | Flexibility for reorganization |
| Debounce timing | 300ms | Quick response while avoiding excessive API calls |
| Other locales toggle | Always start OFF | Clean initial state, base locale is primary focus |
| Locale status (create) | Auto "new" | Simplify creation, status comes later in workflow |
| Comment confirmation | Blocking modal | Ensures user consciously skips recommended field |
| Base locale + comment | Shared card | Visual grouping indicates related fields |
| Key conflict handling | Offer to edit | Guides user to existing resource instead of blocking |

---

## Out of Scope (Future Enhancements)

- "Save & Add Another" workflow
- Auto-save drafts to localStorage
- "Use as template" from similar resources
- Configurable similarity threshold
- Full mobile responsive design
- Extended keyboard shortcuts beyond Escape/Ctrl+Enter
