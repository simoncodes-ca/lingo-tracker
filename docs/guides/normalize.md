---
title: Normalize
sidebar_position: 5
---

# Normalize

`lingo-tracker normalize` brings a collection's files back into a consistent state. It recomputes checksums from the stored values, re-applies the status rules, adds missing locale entries, cleans up tags and removes empty folders. Run it after anything that touched the files without going through LingoTracker.

```bash
lingo-tracker normalize --collection main --dry-run   # see what would change
lingo-tracker normalize --collection main
lingo-tracker normalize --all                         # every writable collection
lingo-tracker normalize --all --json                  # machine-readable report
```

## When to run it

| Situation | Why |
|---|---|
| After resolving a merge conflict in `resource_entries.json` or `tracker_meta.json` | The two files may disagree, or a translation may have been verified on one branch while the source changed on another. |
| After editing JSON by hand | Checksums no longer match values, so staleness cannot be detected. |
| After adding a locale to the global `locales` list | Existing resources have no entry for it until normalize seeds one. `add-locale` does this for one collection; editing the config does not. |
| After an import from rich JSON | Imported tags are stored as given; normalize applies the lowercase hyphenated form. |
| When a resource "cannot be found" by `edit-resource` although it is in the file | The resource has a value but no metadata record. Normalize creates it. |
| When statuses look wrong | Normalize recomputes them from checksums. |
| Periodically, as a pull request check with `--dry-run` | A non-zero change count shows pending normalization changes. |

## What it changes

For every entry in the collection:

1. **Placeholder syntax.** `{{ name }}` becomes `{name}`. Storage is always ICU; bundles convert back for Transloco. A value with a placeholder in literal braces, such as `{{{name}}}`, is left alone and reported as a finding.
2. **Tags.** Lowercased, spaces to hyphens, other characters removed, 50 characters maximum, duplicates dropped. `Common UI` becomes `common-ui`.
3. **Checksums.** The source checksum and every translation checksum are recomputed from the current values.
4. **Statuses.** A translation whose `baseChecksum` differs from the current source checksum becomes `stale`, or `new` when its value is a copy of the source; a `new` entry stays `new`. A translation with no drift keeps its status, even if it happens to equal the source. An entry with no metadata record gets one with status `new`.
5. **Missing locales.** Every target locale in the collection's list that has no value gets a `new` copy of the source.
6. **Stray properties.** A value stored under the base locale's code instead of `source` is removed.
7. **Files.** Both files are written in every folder where something changed or a file was missing. Untouched folders are not rewritten.

Then, bottom-up, **empty folders are removed**. A folder counts as empty when, after its subfolders were handled, it holds nothing except an empty `resource_entries.json`, a `tracker_meta.json`, and the operating-system files `.DS_Store`, `Thumbs.db` and `desktop.ini`. Those files are deleted with the folder. Any other file, a hidden directory, a symlink or an unreadable JSON file keeps the folder and its parents. The translations folder itself is never removed.

## What it never does

- It never changes translated text beyond the placeholder syntax.
- It never removes a value for a locale that is no longer in the collection's list.
- It never deletes a resource.
- It never touches a read-only collection. `--all` skips them with a warning; naming one fails.
- It never re-marks a `verified` translation as anything else unless the source checksum changed underneath it.

## Reading the output

```
🔄 Normalizing collection: main

   ✅ Entries processed: 42
   ✅ Locales added: 7
   ✅ Values converted to ICU: 1
   ✅ Tags normalized: 5
   ✅ Files created: 2
   ✅ Files updated: 15
   ✅ Folders removed: 3
```

`Tags normalized` appears only when a tag changed. Findings that normalize cannot fix, such as a plural branch that collapsed to a bare placeholder, are printed as warnings.

With `--json` the same numbers come as one object with a `collections` array, each holding the counts plus `problems` and `findings`, and a `totals` object. Warnings and errors still go to stderr, so the JSON on stdout is clean.

The first run after upgrading LingoTracker can report more updated files than you expect: folders whose only drift is key order, a stray base-locale property, or a translation recorded against an older source are rewritten once. The next run reports zero.

## Good habits

- Commit first, run normalize, then read `git diff`. Metadata changes are easy to review when nothing else is in the diff.
- Use `--dry-run` before `--all` on a project you did not set up yourself.
- Put `normalize --all --dry-run --json` in a pull request check and fail on a non-zero change count. See the [CI/CD guide](./ci-cd.md#pull-request-checks).
