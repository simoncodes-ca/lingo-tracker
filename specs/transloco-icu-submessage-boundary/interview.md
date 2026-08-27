# Interview — Transloco → ICU conversion at sub-message boundaries

## Refinement — 2026-08-26

Source plan: `~/.claude/plans/let-s-plan-the-fix-streamed-goblet.md`. This spec was produced
by running the refinement flow over that plan: restructure into spec form and drive the open
items to a decision.

### Summary

**Trigger:** convert the existing plan into a spec at
`specs/transloco-icu-submessage-boundary/` and close the four items the plan left open
(module name TBD, nested-shape handling, Phase 2 severity, `normalize` scope).

**Changes applied:**

- Phase structure 2 → 3. The plan's Phase 1 was 8 files and left the classifier ripple
  untested. Split into: (1) scan module standalone, no caller changes; (2) both converters
  adopt it, including a new `icu-classifier.spec.ts`; (3) bundle warning, fixture collection,
  end-to-end verification.
- Module name resolved: `libs/domain/src/lib/transloco-brace-scan.ts`, exporting
  `convertTranslocoPlaceholders`.
- Nested shape handling settled in two steps. The draft treated every `{{` preceded by branch
  text as an authoring error, left untouched and reported at bundle. Round 4 narrowed that to
  the one shape it applies to and made the rest convert.
- Phase 2 message reworded to match the existing warning's `Key '<key>': ...` shape and
  placed beside it in `generate-bundle.ts`.
- Original verification step 5 (run against the reporting consumer project, expecting
  `valuesConverted` to drop from 27 to 0) dropped as an acceptance criterion. Replaced by
  `sample-translations/icu-edge-cases/`, holding all six mixed Transloco/ICU values from that
  project plus the reported corruption case, with wording genericized and ICU structure
  preserved.
- The conversion rule itself was corrected after the first draft. See Round 4.
- Added goals, non-goals, per-phase acceptance criteria and deliverables.
- File list gained `libs/domain/src/lib/icu-classifier.spec.ts` and
  `libs/domain/src/lib/icu-auto-fixer.ts` (export `isQuoteToggle`).

**Carried over unchanged:** the subtract-the-structural-brace framing, the
`@messageformat/parser`-as-oracle decision, the ruled-out "skip if already valid ICU"
approach, and the 20 fixtures the plan verified.

### Assumptions

Confirmed by the user during this refinement:

- The spec belongs in the repo at `specs/<slug>/`, not in `~/Notes/` or the plans folder.
- The technical approach in the plan stands as a framing; its depth test was replaced in
  Round 4 after real consumer data contradicted it.
- `normalize` keeping its Transloco → ICU conversion is out of scope and recorded as a
  non-goal.
- The fixture lands as a new `sample-translations` collection, with the real reported values
  copied over, content genericized, ICU structure preserved.
- No architecture diagram.

Resolved by exploration rather than by the user:

- The repo's handling of a value whose ICU it cannot safely rewrite: never rewrite, report,
  do not fail the run. Evidence in the spec's Background & Decisions table.
- `normalizeTranslocoSyntax` is re-exported from core's public API at
  `libs/core/src/lib/import/index.ts:61`.
- `icu-classifier.ts:64` consumes `normalizeTranslocoSyntax` and has no spec file.
- Only `value` / `source` are converted, never `comment` — no regression for consumers whose
  comment text contains `{{ placeholder }}` as translator guidance.
- `validate` performs no ICU syntax check at all, so "also flag in validate" would have been
  new ground.
- `isQuoteToggle` in `icu-auto-fixer.ts` is module-private and `@internal`; reusing it needs
  an export. `ICU_SYNTAX_CHARS` is already exported. `advanceOverLiteralApostrophe` is named
  in a comment but does not exist as a function — the `''` skip is inline in
  `extractICUPlaceholders`.
- cl-system's `i18n-source` contains `{{ }}` only inside `comment` fields, never in a `value`.
- The reporting project is `five-c55/UI/WebClient/CL.WebUI/ngx`. Its
  `src/assets/i18n/en.json` holds six values that mix Transloco placeholders with ICU
  plural/select groups. It has no `.lingo-tracker.json`, so those files are Transloco runtime
  bundles: exactly what a consumer feeds to `import` when onboarding.

### Open questions

None outstanding. All four items the plan left open are decided in the spec.

---

## Q&A Transcript

### Round 1

**Q:** Where should the refined spec be written?
**A:** `specs/<slug>/` in the repo (recommended option).

**Q:** How far should the refinement go?
**A:** Restructure into spec form and close the open items (recommended option).

**Q:** Verification step 5 runs `normalize --dry-run` against the external reporting project
and expects `valuesConverted` to drop from 27 to 0. Keep it?
**A:** "copy the said fixuture over as new addition to our test fixture; normlaize the actual
string content keep the structure"

### Round 2

**Q:** Phase 1 deliberately leaves `{a, select, x {text {{name}}} other {y}}` unconverted (a
`{{` in branch *text*, not at the branch opener). Keep that as the shipped behaviour?
**A:** "Just learned `{a, select, x {text {{name}}} other {y}}` is wrong syntax, correct is
`{ text {name}}` so that it should act like other invalid cases"

**Q:** Phase 2 surfaces the un-bundlable shape as a `bundle` warning with exit code 0.
Confirm the surface and severity?
**A:** "I don't understand how it's deal with and how heck this means at all. how does
similar case get processed? follow that"

→ Answered from the code rather than by the user. The repo's existing handling, per stage:

| stage | behaviour today | exit code |
|---|---|---|
| write (`add-resource`, `edit-resource`, `normalize`) | no ICU check — value stored as-is | 0 |
| `import` | auto-fix attempted; unfixable → value imported unchanged, per-key entry in `icuAutoFixErrors` (`apply-icu-auto-fix.ts:141`), printed in the summary (`import-summary.ts:101`) | 0 — exit 1 comes only from `resourcesFailed` / `result.errors` |
| `validate` | no ICU syntax check exists | — |
| `bundle` | `validateICUSyntax` fails → `warnings.push("Key 'x': value has malformed ICU syntax and was included as-is")`, value bundled as-is (`generate-bundle.ts:254`) | 0 |

Both answers converge on the same handling: leave the value untouched, report it at bundle,
exit 0.

**Q:** `normalize` still does Transloco → ICU conversion, though the architecture docs say
inbound conversion happens at import only. The plan declines to act on that. Confirm?
**A:** Out of scope; record as a non-goal (recommended option).

**Q:** Where should the copied fixture live?
**A:** New `sample-translations` collection (recommended option).

### Round 3 (before the Round 4 correction)

**Q:** Approve the change summary so the spec can be written?
**A:** Approve as summarized — 3-phase split.

**Q:** Embed a mermaid architecture diagram in the spec?
**A:** No diagram.

### Round 4

Raised by exploration after the first draft was written, not by the user.

**Finding.** A repo-wide search located the reporting project at
`five-c55/UI/WebClient/CL.WebUI/ngx`. Its `src/assets/i18n/en.json` contains six values that
mix Transloco placeholders with ICU plural/select groups. Under the draft's depth-only rule,
five resolve correctly and one does not:

| # | value (abridged) | draft rule | correct? |
|---|---|---|---|
| 1 | `…{count, plural, …}} {{count}} {count, plural, …}` | convert | yes |
| 2 | `{deleteCount, plural, =1 {Delete {{riskName}}} …}` | leave | no, must convert |
| 3 | `Cannot delete {riskCount, plural, =1 {{{riskName}}} …}` | convert innermost | yes |
| 4 | `{riskCount, plural, =1 {{{riskName}} contains} …}` | convert innermost | yes |
| 5 | `Deleting <b>{{riskDisplayText}}</b> will {deleteCount, plural, …}` | convert | yes |
| 6 | `{{ count }} visible map {count, plural, …}` | convert | yes |

Row 2 is the shape the draft called an authoring error and listed as a non-goal, on the basis
of the user's Round 2 answer. It is not an authoring error. Transloco's `DefaultTranspiler`
runs `{{…}}` interpolation before ICU compilation, so `=1 {Delete {{riskName}}}` becomes
`=1 {Delete Foo}` — valid ICU that renders correctly. Correct stored ICU for it is
`=1 {Delete {riskName}}`, so `import` has to convert it. The genuinely broken shape is
`hasName {{name}}`, which becomes `hasName Foo other {…}`: a branch with no body, and an ICU
syntax error in every locale.

**Q:** Apply the corrected structural-brace rule to the spec — replace the depth test with a
position test, drop the branch-text non-goal, and add all six consumer values to the fixtures?
**A:** Yes, rewrite the rule (recommended option).

**Resolution.** The framing "subtract the structural brace, then apply the Transloco test"
survives; the test for *whether* a structural brace is present changed. The first brace of a
run is structural only when the run sits where a branch body begins: the innermost open brace
is a `plural` / `select` / `selectordinal` argument, and only a selector token and whitespace
separate the run from the preceding `,` or `}`. All six consumer values and the corruption case
resolve correctly under it.

The user's Round 2 reading — that the shape "should act like other invalid cases" — was
correct for `{a, select, x {text {{name}}} other {y}}` considered as stored ICU. The draft
over-generalized it to every `{{` preceded by branch text, which swept in a valid and common
Transloco bundle shape.
