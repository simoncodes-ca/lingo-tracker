# Interview — Emit the branch-body brace pair for a Transloco consumer

## Summary

Refinement of an existing implementation plan (`~/.claude/plans/curried-booping-quasar.md`) into a
phased spec. The plan's technical content was already worked out; the refinement restructured it to
the spec format, folded in a findings block that referenced an earlier document, re-verified its
claims against the codebase and the actual Transloco runtime, and resequenced its phases.

### Assumptions

| Assumption | State |
|---|---|
| The spec belongs in `specs/<slug>/` in this repo rather than in the plans or notes directory | Confirmed |
| Storage format stays ICU; only bundled output changes | Confirmed |
| `c82e2d1`'s inbound behaviour is out of scope | Confirmed |
| The 27 affected consumer values are not restructured | Confirmed |
| The format-carrying residual stays a warning, exit code 0, emitter does not touch it | Confirmed |
| `icuEdgeCases` gains `ja` as a fixture locale, requiring a `.lingo-tracker.json` edit | Confirmed |
| A flowchart architecture diagram is included | Confirmed |
| `selectordinal` classification ships as a separate PR, after this one | Confirmed |
| The consumer's 27-value blast radius cannot be verified from this repository | Carried as reported, stated as such in the spec |

### Open questions

| Question | Disposition |
|---|---|
| Should the emitter also rewrite the format-carrying residual, turning a compile throw into an empty branch? | Deferred — out of scope. The residual keeps its current behaviour and its warning. Only the warning's wording is corrected. |
| Do locale plural-category mismatches belong in this spec? | Deferred — a separate concern, removed from scope entirely. |
| Does the `selectordinal` classification fix belong in this spec? | Deferred — split into [#69](https://github.com/simoncodes-ca/lingo-tracker/issues/69). This spec must ship first; see Round 4. |

---

## Refinement — 2026-08-28

### Round 1

**Q: Where should the refined spec land?**
A: `specs/<slug>/` in the repo. Write `specs/icu-to-transloco-branch-body/spec.md` and
`interview.md`; leave the original plan file untouched.

**Q: What does "refine further" mean here — what should change?**
A: All four — restructure to the template, fold in the findings block, re-verify claims against
code, and re-examine phase sizing.

**Q: The plan has no Non-Goals section. What's explicitly out of scope?**
A: All four — storage format stays ICU; `c82e2d1`'s inbound behaviour is untouched; no restructuring
of the 27 affected real values; no fix for the format-carrying residual shape.

**Q: Include a mermaid architecture diagram in the spec?**
A: Yes, flowchart.

### Round 2

**Q: The format-carrying residual `{c, plural, =1 {{n, number}} other {# items}}` throws today,
killing the whole message. The triple would make it render an empty branch instead. Which
behaviour?**
A: Pushed back — the question mixed in a separate concern that does not belong in this spec.
Resolved as: keep the plan's behaviour exactly. The emitter's gate excludes the residual, the
warning fires, the exit code stays 0. The only change is one sentence of wording, because the
warning should say the value fails to render rather than that the argument substitutes empty.

**Q: The `icuEdgeCases` collection is `["en", "fr-ca"]`. Adding the `ja` round-trip fixture needs a
config change.**
A: Add `ja` to the collection.

### Round 3

**Q: Confirm whether the locale plural-category problem is a separate tracked issue.**
A: Confirmed separate and already tracked. Removed from this spec entirely — no content, no
cross-reference — so it does not create confusion downstream.

### Round 4

**Q: Reviewing the three bugs described from a consumer's point of view, which stay in this spec?**
A: The brace fix stays. The misfiring bundle warning stays. The `selectordinal` classification is a
separate bug and gets its own issue and PR. Raised as [#69](https://github.com/simoncodes-ca/lingo-tracker/issues/69).

**Finding that shaped the split — merge order matters.** Measured through both runtime passes:

| Scenario | Renders |
|---|---|
| Today, `selectordinal` collapsed to `{{ rank }}` | `1`, wrong but visible |
| Classification fix alone, plain branches `one {#st}` | `1st`, correct |
| Classification fix alone, branch body is a placeholder | throws, nothing renders |
| Both changes | correct |

The classification fix on its own regresses one shape from a wrong-but-visible value to a blank one.
This spec must land first: it changes nothing for `selectordinal`, and the classification change then
picks up the triple emission with no extra work.

The `selectordinal` phase was removed and the remaining phases renumbered 1 to 4.

---

## Verification performed during refinement

Claims from the plan checked against the tree and against the runtime.

### Confirmed

| Claim | Evidence |
|---|---|
| The triple survives both runtime passes with nothing padded | Ran `@messageformat/core` 3.4.0 plus a replica of `DefaultTranspiler.transpile`. `=1 {{{itemName}}}` renders `Cannot delete Flood Risk` |
| The current double is a hard failure | Throws `invalid syntax at line 1 col 35` |
| A nested position behaves the same way | Triple renders `Flood`; double throws at col 46 |
| `selectordinal` is unclassified | No branch in `parsePlaceholder` (`icu-auto-fixer.ts:283-296`); union at `:27`; `plural \|\| select` check at `:815` |
| `@messageformat/core` does not resolve | `require.resolve` throws; `3.4.0` present in the pnpm store, absent from `package.json` |
| The transpile loop is a stateful `exec` plus `replace`, not `replaceAll` | `jsverse-transloco.mjs:99-115` |
| The interpolation matcher is `/{{([^{}]*?)}}/g` | `resolveMatcher`, `jsverse-transloco.mjs:187-190` |
| No export edit needed | `libs/domain/src/index.ts:9` |
| Seven fixture values across four namespaces; `errors.cannotDelete` is `=1 {{itemName}}` | `sample-translations/icu-edge-cases/` |

### Corrected

| Plan said | Actual |
|---|---|
| The residual's pass 1 "substitutes empty" | It does, and the resulting branch-less message is then rejected by the ICU compiler. The observed failure is a throw, and the whole message is lost |
| `FIXTURES` at `:76-193`, `DETECTOR_FIXTURES` at `:196-289`, helpers at `:298-365` | `FIXTURES:77-207`, `DETECTOR_FIXTURES:208-299`, helpers `:300-368` |
| `FIXTURES` is the table to mirror | `CONSUMER_FIXTURES` (`:24-75`) holds the seven real consumer shapes and is spread into `FIXTURES` at `:169`. The plan did not mention it |
| Adding a `ja` fixture is a fixture-file change | `icuEdgeCases.locales` is `["en", "fr-ca"]` in `.lingo-tracker.json`; the config needs the edit too |
| 27 values across 3 keys in 13 locales | Not verifiable from this repository. Carried as reported |

### Resequencing

The plan's four phases became four different ones. The round-trip harness was extracted from the
middle of the plan's Phase 1 and moved ahead of the fix, so the fix has an observable gate. The two
in-spec fixture-table edits moved out of the plan's Phase 3 into the phases that cause them. The
`selectordinal` phase was then split out entirely (Round 4).

| Final | Was in the plan | Change |
|---|---|---|
| — | Phase 0, classify `selectordinal` | Split into a separate issue and PR |
| 1. Round-trip harness | inside Phase 1 | Extracted and moved ahead of the fix |
| 2. Emit the triple | Phase 1 | Loses the harness, gains the new walker's fixture table |
| 3. Narrow the warning | Phase 2 | Gains the `DETECTOR_FIXTURES` re-labelling |
| 4. Fixtures, config, end to end | Phase 3 | Loses both table edits, gains `.lingo-tracker.json` |
