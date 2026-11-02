---
title: Validate
sidebar_position: 4
---

# Validate

`lingo-tracker validate` is the release gate. It reads every collection and every target locale, collects every problem, prints a report and exits with code 1 when anything would ship broken or unreviewed. It never prompts and never writes.

```bash
lingo-tracker validate [--allow-translated] [--skip-locales <a,b>] [--skip-icu] [--skip-placeholders] [--skip-protected-terms] [--require-portable-plurals]
```

## What it checks

Each resource and target locale is asked four independent questions. Any "no" is a failure.

| Question | Check | Disable with |
|---|---|---|
| Has a person approved this translation? | Status must be `verified`. `translated` is a failure unless `--allow-translated` turns it into a warning. `new`, `stale` and a missing metadata record always fail. | |
| Does the value compile? | Every stored value, including the source, is compiled as an ICU message under the locale it is stored under. | `--skip-icu` |
| Are the arguments intact? | The translation must use the same ICU argument names as the source. `{name}` becoming `{Name}` is a failure, because ICU renders a missing argument as empty text. | `--skip-placeholders` |
| Are protected terms intact? | The translation must contain every [protected term](./protected-terms.md) found in the source, spelled exactly as stored. A missing or broken terms file only warns and supplies no terms. | `--skip-protected-terms` |

Two further checks only warn:

- **Preferred terminology.** Source values are scanned for discouraged terms from the [preferred-terminology](./preferred-terminology.md) file. One warning per key and rule. There is no flag to turn this off; remove the rules instead. A rule file that exists but cannot be loaded is a failure, so a typo in the file cannot silently switch the check off in CI.
- **Portable plurals**, with `--require-portable-plurals`. Warns when a source plural selects a branch by category (`one`, `few`) rather than an exact `=N` match. See below.

Folders whose `resource_entries.json` or `tracker_meta.json` is not valid JSON are listed as unreadable and fail the run.

## Why the ICU check matters even for verified strings

Status says a human approved the wording. It says nothing about whether the message parses. Plural categories belong to the language:

| Locale | Counts that select `one` |
|---|---|
| `en` `de` `es` `nl` `sv` | 1 |
| `fr` `pt` | 0 and 1 |
| `is` | 1, 21, 31, 41, … |
| `ja` `ko` `zh` | none; the category does not exist |

ICU rejects the whole message, not just the offending branch:

```
ja  {count, plural, one {1 warning} other {# warnings}}     fails to compile, renders nothing
ja  {count, plural, other {# warnings}}                     renders
```

A source string copied into a `ja` slot as a `new` placeholder carries the `one` branch with it, and a translator who treats a selector as prose (`ein`, `andere`) or drops the `=` from `=1` produces the same failure. Compiling under one locale for the whole project would miss all of it, which is why each value is compiled under its own locale.

Transloco's `{{ }}` interpolation is normalized to ICU before compiling, so `=1 {{{name}}}` is not reported.

A locale code that is not well-formed BCP 47, typically `fr_CA` for `fr-CA`, cannot be compiled against. It is reported once as a configuration problem rather than per value.

### Portable plurals

`--require-portable-plurals` flags source values that select by category:

```
=1 {1 warning} other {# warnings}     portable
one {1 warning} other {# warnings}    breaks when copied to ja or ko
```

Because the source value is what gets copied into every new locale slot, fixing it at the source stops the failure from recurring on every import. The check applies to the base locale only, is a warning, and parses rather than compiles, so it still runs with `--skip-icu`. `selectordinal` is exempt: English ordinal `one` legitimately selects 1, 21, 31, and so on.

## Options

| Flag | Effect |
|---|---|
| `--allow-translated` | `translated` is a warning. Use for staging. |
| `--skip-locales <a,b>` | Exclude target locales still in progress. Unknown codes warn and are ignored; the base locale is ignored silently. Skipping every target locale exits 1 rather than passing vacuously. |
| `--skip-icu` | Do not compile values. The braced-placeholder check still runs. |
| `--skip-placeholders` | Do not compare argument names. |
| `--skip-protected-terms` | Do not check protected terms. |
| `--require-portable-plurals` | Add the portable-plural warning. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Every check passed, possibly with warnings |
| `1` | Any failure above, or a configuration problem: no config file, no collections, no target locales, all target locales skipped, or an unreadable preferred-terminology file |

## Output

```
❌ Validation FAILED

📊 Validation Statistics:
──────────────────────────────────────────────────
  Total Resources Validated: 102
  Unique Resource Keys: 51
  Locales Validated: 2
  Collections Validated: 1

📈 Status Breakdown:
──────────────────────────────────────────────────
  ✅ Verified: 93
  ✏️  Translated: 3
  ⚠️  Stale: 2
  ❌ New: 4

❌ Failures (9):
──────────────────────────────────────────────────
  Locale: es (6 failures)
    ❌ [main] apps.common.buttons.submit (new)
    ⚠️ [main] apps.common.buttons.save (stale)
    ✏️ [main] apps.common.buttons.cancel (translated)
  ...

⚠️  Preferred terminology warnings (1):
──────────────────────────────────────────────────
  [main] budget.summary: consider "Investment" instead of "Expenditure"

──────────────────────────────────────────────────
📋 Summary:
  Total Failures: 9
  Total Warnings: 1
  Total Successes: 93

❌ Validation failed. Please review the failures above.
```

The report goes to stdout; warnings also go to stderr. Verified resources are not listed individually. Within each locale at most 100 failures and 100 warnings are printed, followed by `... and N more`; preferred-terminology warnings are capped at 100 in total. There is no JSON output and no summary file; capture stdout if you need a record.

## Using it

Strict gate for production and pull requests:

```bash
lingo-tracker validate
```

Staging gate that accepts machine or vendor translations that nobody has reviewed yet:

```bash
lingo-tracker validate --allow-translated
```

A locale that was just added and is still being translated:

```bash
lingo-tracker validate --skip-locales de
```

Typical pipeline order is validate, then bundle, then build, so a failed gate costs no build time. Complete examples are in the [CI/CD guide](../guides/ci-cd.md).

## Limits

- Always checks all collections. There is no collection or tag filter. Partial validation would defeat the purpose of a release gate.
- Checks syntax and bookkeeping, not translation quality. A verified translation with the wrong meaning passes.
- Reads statuses from metadata; it does not recompute checksums. Run `normalize` first if files were edited by hand or merged.

## After a failed run

| Failure | Next step |
|---|---|
| Many `new` or `stale` | `lingo-tracker export --format xliff` sends exactly those to a translator; import the result, then validate again. |
| `translated` | A reviewer sets **Verified** in the editor, or imports the approved file with `--strategy verification`. |
| ICU compile error | Fix the plural or select for that locale in the editor. For a copied source string, translate it properly or remove the categories the locale lacks. |
| Argument mismatch | Restore the original placeholder name. Import repairs these automatically when it can; validate reports what remains. |
| Protected term altered | Restore the term as spelled in the terms file. |
| Unreadable folder | Fix the JSON by hand, usually a merge-conflict leftover, then run `normalize`. |
