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

### Phase 1: Core Dialog Infrastructure
**Goal**: Basic create/edit dialog with form fields and validation

#### Tasks
- [ ] Create `TranslationEditorDialog` component in `apps/tracker/src/app/browser/dialogs/translation-editor/`
- [ ] Create `TranslationEditorDialogData` interface with mode, resource (for edit), collectionName, folderPath
- [ ] Implement reactive form with key, baseValue, comment fields
- [ ] Add key validation (alphanumeric, underscore, hyphen only)
- [ ] Implement base value required validation
- [ ] Add character count display for all textarea fields
- [ ] Style base locale section as grouped card/panel
- [ ] Wire up Cancel and Save buttons with appropriate labels per mode
- [ ] Add Escape key handler to close dialog
- [ ] Add Ctrl+Enter keyboard shortcut for save

#### Unit Tests
- [ ] Test key validation rejects dots, slashes, special characters
- [ ] Test key validation accepts alphanumeric, underscore, hyphen
- [ ] Test base value required validation
- [ ] Test form submission blocked when invalid
- [ ] Test dialog closes on Escape
- [ ] Test Ctrl+Enter triggers save

---

### Phase 2: Folder Selection & Visualization
**Goal**: Folder display, expansion, tree selection, and new folder creation

#### Tasks
- [ ] Add folder display section below key input showing current folder path
- [ ] Implement expandable/collapsible folder section
- [ ] Create folder tree picker component (can reuse/adapt `FolderTree` component)
- [ ] Pre-select folder based on context when dialog opens
- [ ] Implement inline "New folder" creation in tree view
- [ ] Add "new folder" badge indicator when selected folder doesn't exist
- [ ] Display computed full key (folder + key) in real-time

#### Unit Tests
- [ ] Test folder pre-selection from context
- [ ] Test folder tree expansion/collapse
- [ ] Test folder selection updates displayed path
- [ ] Test new folder indicator appears for non-existent paths
- [ ] Test full key computation (folder + "." + key)

---

### Phase 3: Comment Confirmation Flow
**Goal**: Implement recommended comment prompt with confirmation

#### Tasks
- [ ] Add comment field to form within base locale card
- [ ] Implement save interception when comment is empty
- [ ] Create/use `ConfirmationDialog` for missing comment warning
- [ ] Configure confirmation dialog with appropriate messaging
- [ ] Allow save to proceed after user confirmation
- [ ] Track if confirmation was shown to avoid double-prompting

#### Unit Tests
- [ ] Test save proceeds normally when comment present
- [ ] Test confirmation dialog appears when comment empty
- [ ] Test "Add Comment" returns to form without saving
- [ ] Test "Save Anyway" completes the save operation

---

### Phase 4: Other Locales Toggle
**Goal**: Toggle to show/hide and enter other locale values

#### Tasks
- [ ] Add toggle switch above translations section
- [ ] Implement locale list rendering when toggle ON
- [ ] Show empty textareas for each non-base locale
- [ ] In create mode: auto-set status to "new" (no dropdown)
- [ ] In edit mode: show status dropdown for each locale
- [ ] Wire up locale values to form model
- [ ] Ensure toggle always starts OFF (no persistence)

#### Unit Tests
- [ ] Test toggle default state is OFF
- [ ] Test toggle ON shows all non-base locales
- [ ] Test toggle OFF hides other locales
- [ ] Test create mode shows no status dropdown
- [ ] Test edit mode shows status dropdown
- [ ] Test locale values are captured in form

---

### Phase 5: Similar Resources Detection
**Goal**: Async duplicate detection with expandable warning UI

#### Backend Tasks
- [ ] Evaluate existing search endpoint for similarity use case
- [ ] Implement fuzzy matching algorithm (60% threshold)
- [ ] Create similarity search endpoint if existing search inadequate
- [ ] Return top N similar resources with relevance score

#### Frontend Tasks
- [ ] Add debounced (300ms) base value change listener
- [ ] Call similarity API when base value changes
- [ ] Create collapsible similar resources warning component
- [ ] Display collapsed state: "Found X similar translations"
- [ ] Display expanded state: list of similar resources with details
- [ ] Show top 3 initially, "Show more" loads rest in place
- [ ] Implement copy-key-to-clipboard on result click
- [ ] Show toast feedback after copy
- [ ] Skip similarity check in edit mode unless base value changed from original

#### Unit Tests
- [ ] Test debounce prevents rapid API calls
- [ ] Test similarity results render correctly
- [ ] Test collapsed/expanded state toggle
- [ ] Test "Show more" loads additional results
- [ ] Test copy to clipboard functionality
- [ ] Test edit mode skips check when base value unchanged

---

### Phase 6: Create Mode API Integration
**Goal**: Wire up create dialog to API and refresh UI

#### Tasks
- [ ] Create `createResource` method in API service using `CreateResourceDto`
- [ ] Submit form data to create endpoint on save
- [ ] Handle success: close dialog, emit event to refresh translation list
- [ ] Handle key conflict: show "Edit Existing" dialog option
- [ ] Handle other errors: display error message in dialog

#### Unit Tests
- [ ] Test successful create closes dialog
- [ ] Test create emits refresh event
- [ ] Test key conflict shows appropriate dialog
- [ ] Test API errors display in dialog

---

### Phase 7: Edit Mode API Integration
**Goal**: Wire up edit dialog to API with full move support

#### Tasks
- [ ] Create `updateResource` method in API service using `UpdateResourceDto`
- [ ] Load existing resource data when opening in edit mode
- [ ] Pre-populate all form fields from existing data
- [ ] Support key rename (different key value)
- [ ] Support folder move (different folder selection)
- [ ] Submit updated data to update endpoint
- [ ] Handle success: close dialog, emit refresh event

#### Unit Tests
- [ ] Test edit mode pre-populates form correctly
- [ ] Test key rename is captured in update payload
- [ ] Test folder move is captured in update payload
- [ ] Test successful update closes dialog
- [ ] Test update emits refresh event

---

### Phase 8: Integration & Polish
**Goal**: Connect to UI entry points and finalize UX

#### Tasks
- [ ] Add "Add Translation" button to browser toolbar
- [ ] Wire button to open dialog in create mode with current folder context
- [ ] Add "Edit" option to resource context menu/row actions
- [ ] Wire edit action to open dialog in edit mode with resource data
- [ ] Ensure dialog is responsive (desktop-first)
- [ ] Add loading states during API calls
- [ ] Test end-to-end create flow
- [ ] Test end-to-end edit flow

#### Unit Tests
- [ ] Test toolbar button opens create dialog
- [ ] Test context menu opens edit dialog
- [ ] Test folder context is inherited

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
