---
title: Translation Workflow
sidebar_position: 3
---

# Translation Workflow

This guide follows a string from the moment a developer adds it to the moment it ships verified in every locale. It shows which command or UI action moves a translation from one status to the next, and how to hand work to translators and reviewers.

## The lifecycle in one picture

```
developer adds string            ──►  new        (every target locale)
machine translation or vendor    ──►  translated
reviewer approves                ──►  verified
developer changes source text    ──►  stale      (every locale, including verified)
                                       │
                                       └──► translated ──► verified again
```

`validate` lets only `verified` through by default. Default exports and the UI's **Needs work** filter select `new` and `stale`; export `translated` separately when you send strings for review.

## 1. Authoring

A developer adds a string from the CLI, the UI or through an AI assistant:

```bash
lingo-tracker add-resource --key checkout.summary.total --value "Total" --comment "Label above the order total"
```

Every target locale starts as `new`. If [auto-translation](../auto-translation.md) is enabled, strings without plural, select or formatted arguments are translated immediately and marked `translated`; the rest, and any translation that lost a placeholder or a protected term, stay `new` and are listed as skipped.

Before adding, check for an existing string with the same meaning. Duplicates cost translation money twice and drift apart later:

```bash
lingo-tracker find-similar --value "Total"
```

The editor in the UI shows the same suggestions as you type.

Add a comment that says where and how the string appears. It travels into XLIFF as a `<note>`.

## 2. Changing source text

When the English changes, run `edit-resource --base-value` or edit in the UI. Every translation of that resource becomes `stale`, including ones a reviewer verified. This is deliberate: a verified translation of the old sentence is not a verified translation of the new one. Translations that were still untranslated copies of the old source are replaced with the new source and stay `new`. With auto-translation on, both groups are machine-translated right away and become `translated`.

A cosmetic change such as fixing a typo still marks everything stale. If the translations are genuinely still correct, a reviewer confirms them again with the status menu in the editor, or you import the unchanged translations with `--strategy verification`.

## 3. Handing work to translators

Export what needs work. The default status filter is exactly `new,stale`:

```bash
lingo-tracker export --format xliff --locale fr-ca,es
```

This writes `dist/lingo-export/fr-ca.xliff` and `es.xliff`, one `<trans-unit>` per resource with the source, the current target, and the comment. Each unit also lists the [protected terms](../features/protected-terms.md) found in the source as a "Do not translate" note. A Markdown summary of the export is written to the temp directory and its path printed.

Options worth knowing:

- `--collection` when a vendor only works on part of the project.
- `--tags` to send a feature's strings early. Tags set on the collection count too.
- `--format json --rich --include-base --include-comment` for tools or scripts that prefer JSON.
- `--dry-run` to see the file list and counts without writing.
- `--filename "{source}-{target}-{date}"` to keep deliveries apart.

The same export is available from the Tracker's Collections page, with a live preview of files and counts.

## 4. Importing the delivery

Put the returned files in `dist/lingo-import` and import each one into its locale:

```bash
lingo-tracker import --source dist/lingo-import/fr-ca.xliff --locale fr-ca
```

The default strategy, `translation-service`, writes each changed value with status `translated` and leaves resources the file does not mention alone. During the import LingoTracker:

- repairs placeholder names the translator changed, `{nombre}` back to `{name}`, and lists every repair in the summary
- rejects a translation that dropped or altered a protected term, counts it as failed and continues with the rest
- warns when the file's source text differs from what is stored now, which means the string changed again while the vendor had it
- re-confirms unchanged values, so a `stale` translation the vendor looked at and kept becomes `translated` again

Run with `--dry-run` first on a large delivery. The preview reports the same counts and issues using "Would" wording. The Tracker's Import dialog does this automatically every time you change a setting, and lets you upload the files from your machine.

A failed entry sets the exit code to 1, so a CI job that imports deliveries fails loudly when a protected term was broken.

## 5. Review and verification

Verification is a human step. There are three ways to record it:

- **In the editor.** Open the resource, expand **Other locales**, and set the status to **Verified**. Best for spot checks and small languages.
- **Verification import.** Export `translated` strings for the reviewer, have them correct anything wrong, and import the file with `--strategy verification`. Unchanged values become `verified`; corrected values are written and also become `verified`.

  ```bash
  lingo-tracker export --format xliff --locale fr-ca --status translated --filename "review-{target}"
  lingo-tracker import --source dist/lingo-import/review-fr-ca.xliff --locale fr-ca --strategy verification
  ```

- **Scripted through the API**, one `PATCH` per resource with the locale's status set to `verified`, for teams that integrate a review tool.

If no one reviews translations in your process, gate on `--allow-translated` instead and treat `translated` as shippable. Decide this explicitly; the default gate assumes review happens.

## 6. Gating the release

```bash
lingo-tracker validate            # production: verified only
lingo-tracker validate --allow-translated   # staging: unreviewed is acceptable
```

Besides statuses, `validate` compiles every value as an ICU message under its own locale and compares placeholder names and protected terms with the source. A verified French plural that is syntactically wrong fails here, not in the browser. See [Validate](../features/validate.md).

Then generate bundles for the build:

```bash
lingo-tracker bundle
```

Bundles include stored values whatever their status, and a locale seeded as `new` holds the source text. In development that is a convenient fallback; in production it is an untranslated string, which is why validate runs first.

## 7. Bulk corrections and terminology

- A typo fixed across many translations without touching their status: edit the exported JSON and import it with `--strategy update`.
- A brand name that must survive translation: add it to the protected terms. Export marks it, import enforces it, validate checks it.
- A word your product stopped using: add a [preferred terminology](../features/preferred-terminology.md) rule. The editor, `add-resource`, base-locale imports and `validate` warn whenever the old word appears in source text.
- Help content that must match the UI: run `glossary` over the help text to hand the help translators the terms and translations the app already uses.

## Merge conflicts and hand edits

Translation files merge like any JSON, and `tracker_meta.json` conflicts are common when two branches touch the same folder. Resolve the conflict in either file by hand, then run:

```bash
lingo-tracker normalize --all --dry-run
lingo-tracker normalize --all
```

Normalize recomputes checksums from the values, re-applies the staleness rule, and seeds anything missing. See the [Normalize guide](./normalize.md).

## Checklist

| Moment | Command |
|---|---|
| New string | `add-resource`, after `find-similar` |
| Source changed | `edit-resource --base-value`; translations go `stale` |
| Send to vendor | `export --format xliff` (defaults to `new,stale`) |
| Receive from vendor | `import --source … --locale …` |
| Reviewer approves | editor status menu, or `import --strategy verification` |
| Before release | `validate`, then `bundle` |
| After a merge or hand edit | `normalize --all` |
