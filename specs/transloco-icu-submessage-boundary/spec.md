# Transloco → ICU conversion at sub-message boundaries

## Overview

LingoTracker stores every translation value in ICU Message Format and converts Transloco
double-brace syntax (`{{ name }}`) to ICU single-brace syntax (`{name}`) on the way in.
Two functions do that conversion, and both use a context-free regex. This spec makes both
of them position-aware so a `{{` that is a sub-message boundary rather than a Transloco
placeholder is left alone, and adds a bundle-time warning for the one ICU shape the
Transloco runtime cannot carry.

When an ICU `plural` / `select` / `selectordinal` branch body is exactly one argument, the
branch's opening brace and the argument's opening brace sit next to each other:

```
This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.
                                              ^^
                                              branch open + argument open
```

The regex reads that `{{` as a Transloco placeholder and rewrites it to `{name}`. The
result is still valid ICU: the branch token changes from `argument:name` to
`content:"name"`. Nothing throws, and the message renders the literal word "name" instead
of the interpolated value. Each `normalize` run re-applies the transform, so the change
reappears on every developer machine and in CI. Reported from two consumer projects.

Only the brace directly after a branch selector is structural. When branch text precedes the
`{{`, as in `=1 {Delete {{riskName}}}`, both braces belong to the placeholder and the value
must be converted. Real consumer data contains both shapes, so the rule has to tell them
apart rather than treat everything below the top level the same way.

## Goals

- `translocoToICU` and `normalizeTranslocoSyntax` leave a `{{` that opens an ICU
  sub-message body untouched, while still converting genuine Transloco placeholders.
- Both functions are idempotent: running `normalize` on an already-normalized tree reports
  zero conversions.
- The existing migration path `=1 {{{riskName}}}` → `=1 {{riskName}}` keeps working.
- A `{{` preceded by branch text, as in `=1 {Delete {{riskName}}}`, is converted — it is a
  Transloco placeholder inside a branch body, not a sub-message boundary.
- The structural correctness of a conversion is asserted against a real ICU parser, not
  against string equality alone.
- A value carrying a placeholder-only branch body is reported at `bundle` time, since the
  Transloco runtime cannot render it in any locale.
- A fixture collection in this repo reproduces every mixed Transloco/ICU value found in the
  reporting project, so both the conversion rule and the idempotency invariant are verifiable
  without access to that project.

## Non-Goals

- **Removing Transloco → ICU conversion from `normalize`.** The conversion arrived in
  commit `3ef6611` as a one-time migration and `architecture-docs/domain-and-data-model.md:269`
  describes inbound conversion as happening at import. Whether `normalize` should still do
  it is a separate behaviour decision; once this spec lands the converter is idempotent, so
  an already-ICU tree reports `valuesConverted: 0` either way.
- **Adding an ICU syntax check to `validate`.** `libs/core/src/lib/validate/` performs no
  ICU parsing today. Adding one means new result types and new exit-code semantics.
- **Failing the `bundle` command.** The warning is reported, the value is bundled as-is,
  and the exit code stays 0 (see Background & Decisions).
- **Replacing the hand-rolled ICU handling in `libs/domain`.** `icu-auto-fixer.ts`,
  `icu-classifier.ts`, `icu-to-transloco.ts` and the two converters all parse ICU by hand.
  This spec changes only the function that rewrites ICU without structural awareness.
- **Documentation changes.** `normalize`, `add-resource` and `edit-resource` all convert on
  write while the architecture docs describe conversion at import only. That gap is left
  as-is.
- **Running the verification against the consumer project itself.** Its values are copied
  into the Phase 3 fixture collection instead, so the checks run inside this repo.

## Background & Decisions

> **What we're building:** position-aware Transloco → ICU conversion, plus a bundle-time
> warning for placeholder-only sub-message bodies.
> **For whom:** LingoTracker consumers whose translation trees contain ICU plural/select
> messages — currently rewritten on every `normalize` run.
>
> **Key decisions:**
>
> - **Subtract the structural brace, then apply the Transloco test.** A branch body opens with
>   exactly one `{`. At a run of N consecutive `{` followed by `\s*ident\s*` and two or more
>   `}`, work out whether the first brace of the run is a branch opener, subtract it, and let
>   what remains decide. No grammar knowledge, no AST, no ICU parser at runtime.
>
>   | N | structural braces (S) | remaining after subtracting S | action |
>   |---|---|---|---|
>   | 1 | — | 1 | leave — a plain ICU argument |
>   | 2 | 0 | 2 | convert |
>   | 2 | 1 | 1 | leave — branch opener plus ICU argument |
>   | 3 | 0 | 3 | convert the innermost pair |
>   | 3 | 1 | 2 | convert the innermost pair |
>
>   Collapsed to one sentence: if two or more braces remain, convert the innermost pair; if
>   one remains, leave the value alone.
>
> - **S is a position test, not a depth test.** The first brace of the run is structural only
>   when the run sits where a branch body begins: the enclosing argument is a
>   `plural` / `select` / `selectordinal`, and the text between the run and the preceding `,`
>   or `}` is nothing but a selector token (`=1`, `one`, `other`, `hasName`) and whitespace.
>   Depth alone gets this wrong — `=1 {Delete {{riskName}}}` is below the top level, but
>   "Delete " is branch text, so no brace in that run is structural and the value converts.
>
> - **The rule is derived from real consumer data, not from first principles.** All six mixed
>   Transloco/ICU values in the reporting project's `en.json`, plus the reported corruption
>   case, resolve correctly under it:
>
>   | value (abridged) | S | outcome |
>   |---|---|---|
>   | `…}} {{count}} {count, plural, …` | 0 | convert |
>   | `=1 {Delete {{riskName}}}` | 0 | convert |
>   | `=1 {{{riskName}}}` | 1 | convert innermost |
>   | `=1 {{{riskName}} contains}` | 1 | convert innermost |
>   | `Deleting <b>{{riskDisplayText}}</b> will {deleteCount, plural, …` | 0 | convert |
>   | `{{ count }} visible map {count, plural, …` | 0 | convert |
>   | `hasName {{name}}` | 1 | leave |
>
> - **Two Transloco shapes look alike and behave differently at runtime.** Transloco's
>   `DefaultTranspiler` runs its `{{…}}` interpolation before ICU compilation. So
>   `=1 {Delete {{riskName}}}` becomes `=1 {Delete Foo}`, which is valid ICU and renders
>   correctly — intentional authoring, worth converting on import. But
>   `hasName {{name}}` becomes `hasName Foo other {…}`, a branch with no body, which is an ICU
>   syntax error in every locale. Only the second shape is un-bundlable, and Phase 3 flags it.
>
> - **Converting the innermost pair preserves today's behaviour.** The current regex already
>   turns `=1 {{{riskName}}}` into `=1 {{riskName}}` correctly; it is the two-brace form it
>   rewrites wrongly. `@messageformat/parser` confirms the intent: `x {{{name}}}` yields
>   `content:"{"` plus `argument:name` (a stray literal brace), while `x {{name}}` yields
>   `argument:name` alone.
>
> - **Conversion cannot be replaced by validation.** Rejecting `{{ }}` instead of converting
>   it would break `import`, the documented onboarding path (`docs/guides/migration.md`):
>   an existing Angular app's Transloco JSON has `{{ name }}` in every value.
>
> - **"Skip conversion when the value already parses as valid ICU" was ruled out.** Raw
>   Transloco parses as valid ICU — `Hello {{ name }}` yields
>   `content:"Hello {"`, `argument:name`, `content:"}"` without error. That guard would
>   disable conversion for every Transloco value.
>
> - **The `\w+` (optionally dotted) name restriction stays.** Without it the scan would start
>   converting `{{ some text }}` shapes that pass through untouched today.
>
> - **Bundle warning, exit code 0.** This follows the repo's established handling of a value
>   whose ICU the tool cannot safely rewrite:
>
>   | stage | behaviour today |
>   |---|---|
>   | write (`add-resource`, `edit-resource`, `normalize`) | no ICU check; value stored as-is |
>   | `import` | auto-fix attempted; unfixable → value imported unchanged, per-key entry in `icuAutoFixErrors` (`apply-icu-auto-fix.ts:141`), printed in the summary (`import-summary.ts:101`), exit code unaffected |
>   | `validate` | no ICU syntax check exists |
>   | `bundle` | `validateICUSyntax` fails → `warnings.push(...)`, value bundled as-is, exit 0 (`generate-bundle.ts:254`) |
>
>   The rule throughout is: never rewrite a value the tool cannot understand, report it, do
>   not fail the run. Failing the bundle would redden consumer pipelines with no deprecation
>   window, and the value already breaks at runtime, so a warning makes nothing worse.
>
> - **`@messageformat/parser` is promoted to a `devDependency` only.** It is already present
>   transitively under `@jsverse/transloco-messageformat` → `@messageformat/core`. No runtime
>   dependency is added; `libs/domain` stays dependency-free and browser-safe.
>
> - **Three phases rather than two.** The scan module lands first with nothing behaving
>   differently, which gives a checkpoint before either converter changes.

_Full interview transcript: [interview.md](interview.md)_

---

## Phase 1: Brace-scan module

### Goal

Add the position-and-quote-state scanner as a standalone, fully tested domain module,
and establish `@messageformat/parser` as the structural test oracle. No caller changes and
no behaviour change anywhere — this phase is the foundation the next one adopts.

### Acceptance Criteria

- [x] `convertTranslocoPlaceholders('Hello {{ name }}')` returns `'Hello {name}'`.
- [x] `convertTranslocoPlaceholders('Hello {{ a.b }}')` returns `'Hello {a.b}'`, so dotted
      names are supported.
- [x] `convertTranslocoPlaceholders('This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.')`
      returns the input unchanged.
- [x] `convertTranslocoPlaceholders('{itemCount, plural, =1 {{{itemName}}} other {# items}}')`
      returns `'{itemCount, plural, =1 {{itemName}} other {# items}}'`.
- [x] `convertTranslocoPlaceholders('{deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}?')`
      returns `'{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?'` — branch
      text before the run means neither brace is structural.
- [x] `convertTranslocoPlaceholders('{itemCount, plural, =1 {{{itemName}} contains} other {Selected items contain}}')`
      returns `'{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}}'`.
- [x] All seven values in the Phase 3 fixture collection convert to their expected form, and
      the `hasName` value is the only one left unchanged.
- [x] `convertTranslocoPlaceholders("'{'literal'}' and {{ name }}")` returns
      `"'{'literal'}' and {name}"`. An ICU-quoted brace does not open a sub-message argument.
- [x] `convertTranslocoPlaceholders('{{ some text }}')` returns the input unchanged, so the
      identifier restriction holds.
- [x] For every fixture, applying the function twice gives the same result as applying it
      once (idempotency).
- [x] For every fixture that is valid ICU before conversion, the `@messageformat/parser` AST
      is structurally unchanged by conversion. This is the assertion that catches
      `argument:name` becoming `content:"name"`.
- [x] For every Transloco fixture, the converted value parses and the placeholder survives
      as an `argument` token.
- [x] `@messageformat/parser` appears in `devDependencies`, not `dependencies`, and no
      import of it exists outside `.spec.ts` files.

### Files to Create/Modify

- `libs/domain/src/lib/transloco-brace-scan.ts` — the scanner and its exported conversion
  function, roughly 35 lines *(create)*
- `libs/domain/src/lib/transloco-brace-scan.spec.ts` — the full fixture matrix, the
  idempotency invariant, and the parser oracle *(create)*
- `libs/domain/src/lib/icu-auto-fixer.ts` — export `isQuoteToggle` so the scanner can reuse
  it instead of duplicating the quote rules *(modify)*
- `libs/domain/src/index.ts` — add `export * from './lib/transloco-brace-scan';` *(modify)*
- `package.json` — add `@messageformat/parser` to `devDependencies` at the version already
  resolved transitively (5.1.1) *(modify)*

### Implementation Details

- **Exported contract:** `convertTranslocoPlaceholders(value: string): string`. Accept dotted
  identifiers, the superset of the two current regexes, so it can serve both callers in
  Phase 2 without either losing capability.
- Return `value` unchanged when it contains no `{{`, matching the guard
  already in `translocoToICU`.
- **Reuse the quote handling in `icu-auto-fixer.ts`, do not reimplement it.**
  `ICU_SYNTAX_CHARS` (line 70) is already exported. `isQuoteToggle` (line 87) is
  module-private and marked `@internal`. Export it and drop the `@internal` tag rather than
  copying its ten lines. The `''` literal-apostrophe skip is inline in
  `extractICUPlaceholders` (around line 148); replicate that two-line check in the scanner.
- The scan tracks three things: a stack of open braces, `inEscapedSection`, and for each open
  brace whether it opened a `plural` / `select` / `selectordinal` argument. A `{` or `}` inside
  a quoted section must not change any of them, which is why quote state is tracked at all.
- **Marking a sub-message argument:** when a `{` opens an argument, read ahead for
  `\s*\w+\s*,\s*(plural|select|selectordinal)\s*,`. If it matches, mark that stack entry as a
  sub-message argument. Nothing else in the scan needs the argument name.
- **Deciding S (0 or 1):** the first brace of a run is structural only when the innermost open
  brace is a sub-message argument *and* the text between the run and the preceding `,` or `}`
  consists of nothing but a selector token and whitespace. Match the selector as
  `\s*(=\d+|\w+)\s*`. Any other preceding content — including a single space after a `}` that
  closed a previous branch's body — means the text is branch content and S is 0.
- **Then apply the count:** with S subtracted, two or more remaining braces means convert the
  innermost pair; exactly one means leave the run alone. This single test covers every row of
  the table in Background & Decisions.
- The identifier pattern is `\w+(?:\.\w+)*`, with `\s*` permitted inside the braces on both
  sides and trimmed on output.
- **Failure behaviour:** the function never throws and never returns a shorter-than-input
  value for a shape it does not recognise. Any run of braces that does not match the table in
  Background & Decisions is copied through byte-for-byte. Unbalanced input (`Hello {name`) is
  copied through unchanged rather than rejected — validation is not this function's job.
- **Do not import `@messageformat/parser` from the module.** `libs/domain` has zero runtime
  dependencies and is imported by the browser-based Tracker UI; the parser is a test oracle
  only.

### Tests

- `libs/domain/src/lib/transloco-brace-scan.spec.ts` — the fixture matrix below, each fixture
  asserted three ways: expected output, idempotency, and parser-AST structure. Fixtures:
  plain text; `{{ name }}`; `{{a}}{{b}}`; `{{ a.b }}`; whitespace and tab variants;
  `{{ some text }}`; `'{'literal'}' and {{ name }}`; `don't {{ name }}`;
  `{c, plural, one {# item} other {# items}}`; nested plural
  `{a, plural, one {{b, plural, one {x} other {y}}} other {z}}`;
  `Hello {{ name }}, {c, plural, one {# item} other {# items}}`; all seven values from Phase 3's
  fixture collection; `=1 {{{itemName}}}`; `=1 {{{itemName}} contains}`;
  `=1 {Delete {{itemName}}}`; `Hello {name` (unbalanced, unchanged).

### Deliverables

- [x] `transloco-brace-scan.ts` exports `convertTranslocoPlaceholders` and is reachable from
      `@simoncodes-ca/domain`.
- [x] `pnpm nx test domain --testFile=src/lib/transloco-brace-scan.spec.ts` passes.
- [x] `isQuoteToggle` is exported from `icu-auto-fixer.ts` with its existing tests still green.
- [x] `@messageformat/parser` is a devDependency and the lockfile is updated.

---

## Phase 2: Both converters adopt the scan

### Goal

Route `translocoToICU` and `normalizeTranslocoSyntax` through the Phase 1 scanner so the
`normalize`, `add-resource`, `edit-resource`, `import` and classification paths all stop
rewriting sub-message boundaries. This is the phase that fixes the reported bug.

### Acceptance Criteria

- [x] `translocoToICU` and `normalizeTranslocoSyntax` keep their current signatures and stay
      exported from `libs/domain/src/index.ts`.
- [x] Every existing case in `transloco-to-icu.spec.ts` passes unchanged.
- [x] `normalizeTranslocoSyntax('Hello {{ a.b }}')` returns `'Hello {a.b}'`, so dotted-name
      support survives.
- [x] `normalizeTranslocoSyntax` leaves `hasName {{name}}` inside a `select` untouched.
- [x] `translocoToICU` leaves `hasName {{name}}` inside a `select` untouched.
- [x] Both functions convert `=1 {Delete {{itemName}}}` to `=1 {Delete {itemName}}`.
- [x] `classifyICUContent` returns the same classification for a value with a
      placeholder-only branch body before and after this change is applied twice. That is,
      classification is stable under repeated normalization.
- [x] `pnpm run test:domain` and `pnpm run test:core` are green, including
      `normalize-entry.spec.ts` and `normalize.spec.ts`.
- [x] No file under `libs/core/src/lib/normalize/`, `libs/core/src/resource/` or
      `libs/core/src/lib/import/` is modified.

### Files to Create/Modify

- `libs/domain/src/lib/transloco-to-icu.ts` — delegate to `convertTranslocoPlaceholders`;
  update the doc comment to describe the sub-message rule *(modify)*
- `libs/domain/src/lib/normalize-transloco-syntax.ts` — delegate to the same function; the
  `TRANSLOCO_DOUBLE_BRACE_SOURCE` regex is retired *(modify)*
- `libs/domain/src/lib/transloco-to-icu.spec.ts` — add the sub-message fixtures, the
  idempotency invariant, and the parser oracle *(modify)*
- `libs/domain/src/lib/normalize-transloco-syntax.spec.ts` — the same fixtures against the
  import path, which has no spec file today *(create)*
- `libs/domain/src/lib/icu-classifier.spec.ts` — cover `classifyICUContent` for
  placeholder-only branch bodies; this consumer of `normalizeTranslocoSyntax`
  (`icu-classifier.ts:64`) has no test coverage today *(create)*

### Implementation Details

- Both functions become thin wrappers. `translocoToICU` currently restricts names to
  `\w+`; `normalizeTranslocoSyntax` allows dots. The scanner's dotted pattern is a superset,
  so both can call it directly. Widening `translocoToICU` to accept dotted names is an
  intentional, additive change; note it in the function's doc comment.
- **`normalizeTranslocoSyntax` is part of core's published surface.** It is re-exported at
  `libs/core/src/lib/import/index.ts:61` through the wrapper
  `libs/core/src/lib/import/normalize-transloco-syntax.ts`. No signature changes, so no
  edit is needed there. The behaviour of a published export does change, which belongs in
  the commit message.
- **Classification ripple.** `classifyICUContent` normalizes before classifying. Where a
  placeholder-only branch body previously collapsed to `content`, it now stays an `argument`,
  so the classifier sees a different token shape. Assert the classification, not the internals.
- No caller changes: `normalize-entry.ts`, `add-resource.ts`, `edit-resource.ts` and
  `import-from-json.ts` all inherit the fix through the two functions.
- **Failure behaviour is inherited:** neither function throws, and an unrecognized shape is
  returned byte-for-byte, exactly as the scanner behaves.
- **Only `value` and `source` are converted, never `comment`.** Confirm this stays true:
  consumer projects have `{{ placeholder }}` inside comment text as translator guidance.

### Tests

- `libs/domain/src/lib/transloco-to-icu.spec.ts` — the ~20 existing cases stay as-is; add the
  sub-message fixtures, dotted names, the idempotency invariant over every fixture, and the
  parser-AST assertion.
- `libs/domain/src/lib/normalize-transloco-syntax.spec.ts` — the same matrix, plus the dotted
  and rejected-name cases already documented in the function's examples
  (`.name`, `name.`, `a..b` stay unchanged).
- `libs/domain/src/lib/icu-classifier.spec.ts` — classification of a plain value, a simple
  placeholder value, a plural value, and a value with a placeholder-only branch body.

### Deliverables

- [x] Both converters delegate to the scanner; the two old regexes are gone.
- [x] `pnpm run test:domain` and `pnpm run test:core` green.
- [x] `icu-classifier.ts` has test coverage.

---

## Phase 3: Bundle-time warning and fixture collection

### Goal

Report the one ICU shape the Transloco runtime cannot render, and add a fixture collection to
this repo that reproduces every mixed Transloco/ICU value from the reporting project, so the
conversion rule and the idempotency invariant are both verifiable end to end.

### Acceptance Criteria

- [x] `bundle` emits one warning per affected key/locale, naming the key, and exits 0.
- [x] The bundled value is byte-identical to the stored value. The warning changes nothing.
- [x] The warning message does not describe the value as invalid ICU. It is valid ICU that
      cannot survive the Transloco pipeline, and the message suggests the rewrite.
- [x] `x {{name} extra}`, `x {pre {name}}`, `x {{b, plural, one {p} other {q}}}` and
      `{a, plural, one {{b, plural, one {p} other {q}}} other {z}}` produce no warning.
- [x] `sample-translations/icu-edge-cases/` exists and is registered as a collection in
      `.lingo-tracker.json`, containing all seven values below with generic wording and the ICU
      structure preserved.
- [x] Exactly two of the seven values raise the bundle warning: `dialogs.deleteConfirm` (the
      `hasName` case) and `errors.cannotDelete`. **Amended during implementation** — this line
      originally read "exactly one". `Cannot delete {itemCount, plural, =1 {{{itemName}}} other
      {items}}` stores, under the S table row `N=3 | S=1 | convert innermost`, as
      `=1 {{itemName}}` — a placeholder-only branch body structurally identical to the
      `hasName` case, and un-bundlable by the same mechanism. Verified end to end: the bundle
      carries it verbatim, and Transloco's pre-pass reduces it to `=1 Foo other {items}`.
- [x] `normalize` run three times against that collection reports `valuesConverted: 0` and
      `filesUpdated: 0` on runs 2 and 3.
- [x] Round-trip on that collection (`normalize` → `bundle` → `import`) leaves the stored
      value byte-identical to the post-`normalize` value, and `bundle` emits the warning
      while exiting 0.

### Files to Create/Modify

- `libs/domain/src/lib/transloco-brace-scan.ts` — add and export the detector *(modify)*
- `libs/core/src/lib/bundle/generate-bundle.ts` — one `warnings.push` beside the existing ICU
  check at line 254 *(modify)*
- `libs/core/src/lib/bundle/generate-bundle.spec.ts` — cover the new warning and the
  no-false-positive cases *(modify)*
- `sample-translations/icu-edge-cases/resource_entries.json` and `tracker_meta.json` — the
  seven-value fixture collection *(create)*
- `.lingo-tracker.json` — register the `icuEdgeCases` collection pointing at that folder
  *(modify)*

### Implementation Details

- **Detector:** run Transloco's own interpolation matcher `/\{\{[^{}]*?\}\}/` over the stored
  value *after* Phase 1/2 conversion, gated on two position tests added during implementation:
  the match must sit outside an ICU-quoted section, and the brace must open a
  `plural`/`select`/`selectordinal` branch body. Without the quote gate,
  `Deleting '{{ name }}' cannot be undone.` is flagged, where the braces are ICU-literal text.
  Without the position gate, `Hello {{ some text }}` is flagged, which the scanner deliberately
  leaves alone and which bundles fine. Both gates reuse the scanner's own state tracking. In a normalized ICU value any match is a value the
  runtime will consume before ICU compilation ever sees it. Running it post-conversion is what
  keeps the false-positive rate at zero: `=1 {Delete {{itemName}}}` has already become
  `=1 {Delete {itemName}}` by this point, so only the placeholder-only branch body still
  matches.
- **Why this is un-bundlable, for the doc comment:** `bundle` defaults
  `transformICUToTransloco` to `true`; `icuToTransloco` converts simple placeholders to
  `{{ name }}` and passes `plural` / `select` groups through verbatim, so a stored
  `hasName {{name}}` reaches the bundle unchanged. At runtime Transloco's
  `DefaultTranspiler` runs its `{{([^{}]*?)}}` interpolation *before* ICU compilation,
  consumes `{{name}}`, and leaves `hasName <value> other {this item}`, a syntax error in
  every locale. There is no safe encoding: padding to `hasName { {name}}` survives both
  layers but adds a space to the rendered text.
- **Export:** `libs/domain/src/index.ts` re-exports the module with `export *`, so adding the
  detector to `transloco-brace-scan.ts` makes it available with no barrel change.
- **Placement:** inside the existing `if (transformICUToTransloco)` block in
  `processCollection`, as a second `warnings.push` beside the `validateICUSyntax` check. No
  new types, no DTO change, no CLI change. `GenerateBundleResult.warnings` is already
  printed by `apps/cli/src/commands/bundle.ts:147-152`, which counts warnings without exiting
  non-zero.
- The message matches the existing warning's `Key '<key>': ...` prefix, then the
  suggestion:

  ```
  Key '<key>': a plural/select branch body that is only a placeholder cannot be bundled for
  a Transloco runtime. Move the shared text into the branches:
    {nameExists, select, hasName {This will delete {name}} other {This will delete this item}}
  ```

- **Fixture values** — the six mixed Transloco/ICU values found in the reporting project's
  `src/assets/i18n/en.json`, plus the reported corruption case. Product wording is genericized
  and the ICU structure is kept byte-for-byte:

  ```
  This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.
  {count, plural, =0 {There are} =1 {There is} other {There are}} {{count}} {count, plural, =0 {active items} =1 {active item} other {active items}} in the system.
  {deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}?
  Cannot delete {itemCount, plural, =1 {{{itemName}}} other {items}}
  {itemCount, plural, =1 {{{itemName}} contains} other {Selected items contain}} children of a restricted type:
  Deleting <b>{{itemDisplayText}}</b> will {deleteCount, plural, =1 {also} other {permanently delete # child items, and}} remove any associations.
  {{ count }} visible map {count, plural, one {feature} other {features}} do not match any asset on {layerCount, plural, one {layer} other {layers}}:
  ```

  The first is the corruption case and the only one that should raise the Phase 3 warning. The
  rest must all convert, which is what makes this collection the regression test for the
  position rule rather than only an idempotency fixture.
- **Generate the fixture with the CLI, not by hand.** `tracker_meta.json` carries real MD5
  checksums (`sample-translations/playground/common/buttons/tracker_meta.json` shows the
  shape). Create the collection with `lingo-tracker add-collection` and `add-resource` so the
  checksums are computed rather than invented. Include at least one non-base locale so the
  round-trip exercises translation values, not just `source`.
- **Failure behaviour:** the detector is a pure predicate over a string. It never throws and
  never modifies the value; a value that matches is still written to the bundle. If the
  fixture collection is missing or unreadable, `bundle` behaves as it does for any missing
  collection today, and no new error path is introduced.

### Tests

- `libs/core/src/lib/bundle/generate-bundle.spec.ts` — a resource carrying a
  placeholder-only branch body produces exactly one warning, the bundled value is unchanged,
  and the four safe shapes above produce none.
- `libs/domain/src/lib/transloco-brace-scan.spec.ts` — extend with the detector's own
  fixture table (flagged vs. safe).
- Manual end-to-end, recorded in the PR description: `normalize` ×3 for the idempotency
  counts, then `normalize` → `bundle` → `import` for the round-trip and the warning.

### Deliverables

- [x] `bundle` warns on the un-bundlable shape and still exits 0.
- [x] `sample-translations/icu-edge-cases/` exists, is registered, and holds both values.
- [ ] The idempotency and round-trip runs are recorded in the PR description.
- [x] `pnpm run test:core` green.

---

## Commit and branch

Branch `fix/transloco-to-icu-submessage-boundary`. Commit with `pnpm run commit`
(conventional commits, per `CONTRIBUTING.md`). Phase 2 changes the behaviour of a published
`@simoncodes-ca/core` export (`normalizeTranslocoSyntax`, re-exported at
`libs/core/src/lib/import/index.ts:61`). Say so in the commit body.
