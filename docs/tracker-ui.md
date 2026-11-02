---
title: Tracker UI
sidebar_position: 5
---

# Tracker UI

The Tracker is a local web application for browsing and editing translations. It runs on your machine, reads the same files as the CLI, and writes changes back to the repository so they show up in `git diff` like any other edit.

## Start it

```bash
npx lingo-tracker-app
```

Run it from the directory that holds `.lingo-tracker.json`, then open `http://localhost:3030`. The server also exposes the [REST API](./api.md) the UI uses.

| Setting | Flag | Environment variable | Default |
|---|---|---|---|
| Port | `--port 4000` | `LINGO_TRACKER_PORT` | `3030` |
| Bind address | `--host 0.0.0.0` | `LINGO_TRACKER_HOST` | `127.0.0.1` |
| Extra allowed host names | | `LINGO_TRACKER_ALLOWED_HOSTS` | none |

The server has no authentication. By default it accepts connections from your machine only. Binding to another address lets anyone who can reach the port edit translation files, list folders on the server and upload files into the import folder. Named access over a LAN also needs the name in `LINGO_TRACKER_ALLOWED_HOSTS`; see [Running the server](./api.md#running-the-server).

Changes made outside the app, by the CLI, a `git checkout` or a hand edit, appear on the next page load. The server compares the translations folder with its in-memory index at most once every two seconds and re-indexes when something changed.

## Collections page

The home page lists collections on the left and output bundles on the right.

**Collection cards** show the folder, the locales with the base locale marked, and a lock for read-only collections. Click a card to open it in the browser. The card menu offers **Edit**, **Export…**, **Import…** and **Delete**. A filter box appears once there are more than six collections.

**Add collection** and **Edit** open the collection dialog:

- Name (fixed after creation) and translations folder, relative to the project root.
- Locales: add codes one at a time. When creating, click a chip to choose the base locale. When editing, removing a locale asks for confirmation because it deletes that locale's values from every resource file.
- **Read-only collection** toggle, on by default for folders under `node_modules`.
- Collection tags, inherited by every resource.
- Protected terms for this collection. Editing them requires the collection to have a `protectedTermsFile`; the dialog says so when it does not. Set the file with the CLI first.

**Delete** removes the collection from the config and from bundle definitions. Files on disk are kept.

The header's **Export…** action preselects all collections. Its **Import…** action leaves the collection unselected. The same actions in a card menu preselect that collection. Import is disabled for read-only collections.

### Bundles

The right column shows each bundle with its output path, the collections it draws from, the types file and the locale count. **Generate** runs one bundle; **Generate all** runs them in sequence. Progress and the result, including files written and warnings, appear on the card. Hovering a bundle card highlights the collections it uses.

**Add bundle** and **Edit** open a form with four sections and a live preview:

| Section | Fields |
|---|---|
| Output | Name (fixed after creation), output folder, file name pattern containing `{locale}` |
| Collections | Include every collection, or add collections one by one with a key prefix, a conflict strategy (first wins or this overrides) and selection rules by key pattern and tags |
| Types | Generate TypeScript keys, type file path, key casing, constant name |
| Options | Convert ICU to Transloco syntax |

The preview is a dry run: it lists the files to write, keys per locale, an example key, and any conflicts. Nothing is written until you save and generate.

### Export and import dialogs

Both dialogs show a live preview that re-runs on every change. Previewing does not change any translation resource. One exception: selecting or dropping files in the Import dialog uploads them into the import folder immediately. The dialogs remember most settings per project in the browser. Details, including every option and its CLI equivalent, are in [Export from the Tracker UI](./features/export.md#export-from-the-tracker-ui) and [Import from the Tracker UI](./features/import.md#import-from-the-tracker-ui).

After a run, a result strip at the top of the page shows counts, a **Details** view with per-file results, warnings and errors, and for imports a **Download summary** button for the Markdown report. If a job was still running when you reloaded the page, the strip picks it up again.

## Translation browser

Open a collection to reach the browser. The header shows the collection name, folder, key count and locale count.

### Folder tree

The left sidebar shows the folders derived from your keys.

- **Filter folders** narrows the tree; parents of matches stay visible.
- **Show all nested resources** (the default) lists every resource under the selected folder. Turn it off to see only the folder's own entries.
- **Add folder** creates a folder on disk under the current one. Shortcut: Ctrl+Shift+N, or Cmd+Shift+N on macOS. An empty folder is removed again by `normalize` or when its last entry is deleted, so add a resource to it soon.
- The trash icon deletes a folder and every resource in it, after confirmation.
- Drag a folder onto another folder or onto the root to move it, with confirmation. Drag a resource row by its handle onto a folder to move it; this needs no confirmation.
- Keyboard: arrow keys expand and collapse, Enter selects, Delete deletes the focused folder.

In read-only collections the tree is browse-only and the drag handles become lock icons.

### Toolbar

- **Search** runs server-side across the whole collection once you type three characters. It matches keys, source values and every stored translation, case-insensitive, and highlights the matches. Exact key matches rank first. Comments are not searched. While a search is active the folder tree and **Add Translation** are disabled; **Clear Search** returns to browsing.
- **Locale filter** chooses which locales appear. In the compact view it picks one locale; in the full view it is a multi-select.
- **Status rail** filters by status. **Needs work** is `new` plus `stale`. The other four toggle independently and show counts.
- **Sort** switches between ascending and descending key order.
- **Density** switches between **Compact**, two lines per row with one locale, and **Full**, which shows every selected locale, tags and comments.
- **Add Translation** opens the editor for a new resource.

Density, selected locales, nested-resources setting, sort order and status filters are remembered per collection in the browser's local storage.

### Rows

Each row shows the key, the source, and the selected locale values with status chips. Click the key to copy it. Double-click a row, press E on a focused row, or use the pencil to open the editor. The row menu has **Translate**, shown only when the collection has auto-translation enabled, and **Delete**, which asks for confirmation. Delete on a focused row does the same.

**Translate** machine-translates every locale of that one resource that is `new` or `stale`, and reports locales it skipped, for example because the value uses a plural or lost a placeholder. There is no whole-locale translation in the UI; use `lingo-tracker translate-locale` for that.

## Translation editor

The editor dialog creates or edits one resource.

- **Location** shows the folder. **Change** opens a folder picker, where you can also create a folder. Changing the location of an existing resource moves it.
- **Key** is one segment, letters, digits, hyphens and underscores. Paste a full dotted key and the folder part moves into Location. The key is fixed when editing; move or recreate to rename. A key that already exists in the folder shows an inline error with an **Open existing** link.
- **Base value** is required. Under it, preferred-terminology notes appear while you type, each with a **Use "…"** button that rewrites the text. The notes are advice; saving is still allowed. A placeholder wrapped in literal braces is rejected with a hint on how to quote it.
- **Comment** is for translators. Saving without one asks you to confirm.
- **Tags** is a chip input with autocomplete from existing tags. Inherited collection tags are shown but cannot be removed here.
- **Other locales** opens a drawer with one field per target locale and, when editing, a status menu with **New**, **Stale**, **Translated** and **Verified**. This is where a reviewer marks a translation verified. When creating, locales left empty are auto-translated after save if the collection has auto-translation enabled; otherwise they start as `new`.

The context column on the right shows where the resource will land in the tree and, once the base value has three characters, **Similar values**: existing resources whose source text is close to what you typed, with a similarity percentage. Click one to copy its key. An exact match warns you that the text already exists so you can reuse the key instead of adding a duplicate.

Ctrl+Enter, or Cmd+Enter on macOS, saves. Escape with unsaved changes asks whether to discard. Editing the base value marks every real translation `stale` on save, as it does in the CLI; untranslated copies are replaced with the new source, or machine-translated when auto-translation is on.

In read-only collections the row action reads **View**; the dialog opens with a lock notice, disabled fields and no save button.

## Settings

The gear in the header opens the Settings page.

- **Global protected terms**: add, rename, filter and remove terms. Changes are staged and written to the protected-terms file when you save. See [Protected Terms](./features/protected-terms.md).
- **Preferred terminology**: a table of discouraged term, preferred term and optional reason. Rows are validated as you type, including duplicate, self-mapping, chain and cycle checks. See [Preferred Terminology](./features/preferred-terminology.md).

One **Save** button saves both sections, but only a list you changed is written. If the preferred-terminology file on disk is unreadable, the page says so, and saving that list replaces the file.

The global base locale, the global locale list, bundles' project defaults and the translation provider cannot be edited in the UI. Change them in `.lingo-tracker.json`.

## Appearance and language

The header has a theme menu with **Light**, **Dark** and **System**, and a language picker for the UI itself. The Tracker's own strings are managed with LingoTracker and are available in English, Spanish, Canadian French, German, Japanese and Russian. Some strings in the non-English locales are still untranslated and fall back to English. Both choices are remembered in the browser.

## What the UI cannot do

These remain CLI-only: `init`, `normalize`, `validate`, `translate-locale` for a whole locale, `find-similar`, `glossary` and `install-skill`. Renaming a collection is possible only through the [API](./api.md#collections).
