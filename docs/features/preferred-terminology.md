---
title: Preferred Terminology
sidebar_position: 7
---

# Preferred Terminology

Preferred terminology is a list of source-language terms your product no longer uses. Each rule maps a **discouraged term** to the **preferred term** that replaced it. A rule can also carry a reason.

LingoTracker checks base-locale values against these rules. When a value uses a discouraged term, LingoTracker warns and suggests the preferred term. It never blocks a save, an import, or a release. An older term can still be correct in a quotation or a historical note, so the author decides.

The warnings appear in five places:

- The **resource editor** in the web UI shows a note under the base value, with a button that applies the preferred term.
- **`add-resource`** and **`edit-resource`** print a warning after they store the value.
- A **base-locale import** adds a warning to the import summary.
- **`validate`** lists every finding in its own section.
- **Settings** in the web UI, and the `preferred-terminology` CLI command, edit the rules themselves.

## How it differs from protected terms and the glossary

LingoTracker has three features that deal with terminology. They solve different problems.

| | Preferred terminology | [Protected terms](./protected-terms.md) | [Translation glossary](./glossary.md) |
|---|---|---|---|
| What it is | Rules that map a discouraged source term to a preferred one | Words that must stay unchanged in every translation, such as `iPhone` | A JSON file of the app's existing translations for the terms found in a block of help text |
| Who maintains it | Your team, in Settings, with the CLI, or in the rule file | Your team, in Settings, with the CLI, or in the terms file | Nobody. The `glossary` command generates it on demand. |
| What it checks | Base-locale values that use a discouraged term | Imported translations that dropped or altered a term from the source | Nothing. Translators use it as a reference. |
| Does it block? | No. Findings are warnings. Only an unreadable rule file fails `validate`. | Yes. Import rejects a translation that altered a protected term. | No |
| Locales it looks at | The base locale only | Target locales | Reads base-locale values, and outputs target-locale translations |
| Scope | One global file | A global file, plus an optional file per collection | One run of the command, optionally limited to one collection |

In short, preferred terminology changes the wording of your source text. Protected terms keep words intact through translation. The glossary helps translators reuse words that the app already translates.

## The file

The rule file holds a bare JSON array. Each rule has a `discouraged` term, a `preferred` term, and an optional `reason`.

```json
[
  {
    "discouraged": "E-mail",
    "preferred": "email"
  },
  {
    "discouraged": "Expenditure",
    "preferred": "Investment",
    "reason": "Current planning term."
  },
  {
    "discouraged": "Log-in",
    "preferred": "sign in",
    "reason": "Match the product UI."
  }
]
```

The file lives at **`.lingo-tracker-preferred-terminology.json`** by default. That file sits beside `.lingo-tracker.json`. You do not need to create it. Adding your first rule creates it.

To keep the rules somewhere else, name the path in your configuration with `preferredTerminologyFile`.

```json
{
  "baseLocale": "en",
  "locales": ["en", "es"],
  "preferredTerminologyFile": "config/preferred-terminology.json",
  "collections": {
    "app": { "translationsFolder": "src/i18n" }
  }
}
```

LingoTracker resolves a relative path against the directory that holds `.lingo-tracker.json`. It uses an absolute path as written.

There is one global rule file. A collection cannot add rules or override them. A collection with its own `baseLocale` is still checked, in that base locale.

### How LingoTracker writes the file

Every write replaces the whole file. The CLI and the web UI write it the same way.

- LingoTracker sorts the rules by discouraged term, ignoring case. Adding a rule therefore produces a small diff.
- It trims spaces from every field.
- It drops a `reason` that is empty.
- It indents with two spaces and ends the file with a newline.

LingoTracker validates the whole list before it writes. If any rule is invalid, it writes nothing and leaves the file as it was.

The API server re-reads the file when the file changes on disk. A hand edit or a `git pull` therefore takes effect without a restart.

## Rule validation

LingoTracker rejects a rule list that contains any of the problems below. It compares terms after trimming, and it ignores case. So `Email → email` counts as a self-mapping.

| Problem | Example | Why LingoTracker rejects it |
|---|---|---|
| Empty term | `"preferred": ""` | Both terms are required. |
| Not text | `"preferred": 42`, or a row that is not an object | Terms and the reason must be strings. |
| Invalid character | `Account {name}` | A term cannot contain `{`, `}`, `<`, or `>`. LingoTracker never matches inside ICU syntax or tags, so such a discouraged term could never match. Such a preferred term would break the message when applied. |
| Duplicate | `Expenditure` and `expenditure` in two rows | Each discouraged term can appear only once. LingoTracker reports the later row. |
| Self-mapping | `Email → email` | The preferred term must differ from the discouraged term. |
| Chain | `Log-in → Login` and `Login → sign in` | The preferred term is itself discouraged. Map `Log-in` straight to `sign in`. |
| Cycle | `Sign-on → Login` and `Login → Sign-on` | Following the rules leads back to the start. |
| Preferred contains a discouraged term | `Email → Email address`, or `Account → E-mail account` when `E-mail` is discouraged | Applying the suggestion would produce text that is flagged again. LingoTracker checks for a whole-word match, and it includes the rule's own discouraged term. |

The reason is free text. LingoTracker only checks that it is a string.

## What counts as a match

LingoTracker matches a discouraged term as a whole word or a whole phrase, ignoring case.

- **Letters, digits, and `_` are word characters.** Any other character ends a word, including `-` and `'`.
- **No plurals or word stems.** A rule for `Expenditure` does not match `Expenditures`. Add a second rule if you need the plural.
- **One rule, one warning per value.** A term that appears three times in one value produces one finding.

With a rule for `Expenditure`:

| Value | Match? |
|---|---|
| `Capital expenditure` | Yes. Case does not matter. |
| `expenditure-report` | Yes. `-` separates words. |
| `the expenditure's total` | Yes. `'` separates words. |
| `Expenditures` | No. It is a longer word. |
| `ExpenditureType` | No. It is a longer word. |
| `expenditure_id` | No. `_` joins words. |

LingoTracker checks only the text a reader sees. It skips these parts of a value:

- ICU argument names, formats, and styles, such as `{expenditure}` or `{amount, number, currency}`
- `select` and `plural` selectors, and the `#` symbol. The text inside each branch is still checked.
- Transloco placeholders, such as `{{ expenditure }}`
- HTML and XML tags, including their attributes. The text between tags is still checked.

So `Expenditure for {expenditure}` gets one finding, for the first word only.

When a value is not valid ICU, LingoTracker skips every `{…}` span and every tag, and checks the rest.

LingoTracker checks the raw text, so it does not undo ICU quoting. A term that contains an apostrophe does not match a doubled `''` in the stored value.

## Resource editor

The editor checks the base-locale value while you type. After a short pause, it shows one amber note per rule the value breaks. The note reads `Preferred terminology: consider "Investment" instead of "Expenditure".` The rule's reason appears below it.

The editor checks an existing value as soon as the dialog opens. Translations in other locales are not checked.

Each note has a **Use "…"** button. It replaces every visible occurrence of the discouraged term with the preferred term.

- The editor inserts the preferred term exactly as the rule spells it. For `Expenditure → Investment`, `capital expenditure` becomes `capital Investment`. Check the capitals before you save.
- ICU arguments, placeholders, and tags stay unchanged.
- The button changes the field only. You still save with **Save changes**, and you can still cancel.

The editor hides the button when the resource is read-only.

## Settings

The **Preferred Terminology** section of **Settings** lists the rules as a table. Each row has a discouraged term, a preferred term, and an optional reason.

- **Add rule** adds an empty row. The remove button deletes a row.
- Settings validates the rules as you edit. It shows the error under the field that caused it.
- **Save** stays disabled while a row has an error. One **Save** stores both the protected terms and the preferred terminology.
- The server validates the rules again before it writes the file.

The section names the rule file it reads and writes.

If the rule file exists but cannot be read, Settings shows an error with the details. No rules are in force until you fix the file. Saving from Settings replaces the file with the rules on screen.

If `preferredTerminologyFile` names a file that does not exist, Settings says so. Saving creates the file.

## CLI

```bash
# List the rules and the file that holds them
lingo-tracker preferred-terminology --list

# Add a rule. The file is created if it is absent.
lingo-tracker preferred-terminology --add "Expenditure" --preferred "Investment" --reason "Current planning term."

# Replace an existing rule. Leaving out --reason clears the old reason.
lingo-tracker preferred-terminology --add "expenditure" --preferred "Spending"

# Remove a rule
lingo-tracker preferred-terminology --remove "Expenditure"
```

`--add` and `--remove` find an existing rule by its discouraged term, ignoring case. `--add` on an existing term replaces the whole rule.

If the new list breaks a validation rule, the command prints each problem, exits with code `1`, and leaves the file unchanged. If the file cannot be read, `--add` and `--remove` refuse to run, so they never overwrite it.

The [CLI reference](../cli.md#preferred-terminology) holds the full option list.

## Adding and editing resources

`add-resource` stores the value first, and then prints one warning per rule the base value breaks.

```
✅ Resource added: budget.title
⚠️  Preferred terminology: consider "Investment" instead of "Expenditure"
  Current planning term.
```

`edit-resource` does the same, but only when the command changes the base value. Changing a comment, tags, or a translation prints no terminology warnings.

The warnings never change the exit code.

## Import

A base-locale import checks every value it creates or updates. Only the `migration` strategy can import into the base locale. Each finding adds a warning to the import summary.

```
Preferred terminology: key "budget.title" — consider "Investment" instead of "Expenditure". Current planning term.
```

The import still writes the value. Nothing is skipped or failed, and the exit code does not change. A dry run reports the same warnings.

Imports into a target locale are not checked. The [Import](./import.md#preferred-terminology-warnings) page has the details.

## Validate

`validate` scans every base-locale value in every collection. It lists the findings in a **Preferred terminology warnings** section.

```
⚠️  Preferred terminology warnings (2):
──────────────────────────────────────────────────
  [main] budget.summary: consider "Investment" instead of "Expenditure"
    Current planning term.
  [main] contact.help: consider "email" instead of "E-mail"
```

- Findings are warnings. They count towards the warning total, and they never change the exit code.
- `validate` reports each key and rule once. It does not repeat a finding per target locale or per occurrence.
- `validate` has no flag to turn the check off. Remove the rules to stop it.
- An unreadable rule file is a **failure**, and `validate` exits with code `1`. Without this, a typo in the file would switch the check off in CI without anyone noticing.

The [Validate](./validate.md#preferred-terminology) page has the details.

## Missing or broken files

| Situation | Editor, `add-resource`, `edit-resource`, import | `validate` |
|---|---|---|
| No file at the default path | No rules, no message. This is the normal state before the first rule. | No rules, no message |
| No file at the path in `preferredTerminologyFile` | No rules. The CLI prints a warning, and Settings shows a note. A path to nothing is usually a typo. | A warning, then no rules |
| The file is not valid JSON, is not an array, or has an invalid rule | The check is skipped. The CLI prints a warning. The editor stays silent, and Settings shows the error. | A failure, with exit code `1` |

LingoTracker treats an unreadable file differently in `validate` on purpose. Authoring tools should keep working while someone fixes the file. The CI check should not pass while no rules are in force.
