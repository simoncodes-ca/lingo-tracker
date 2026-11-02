---

name: LingoTracker
description: Warm watercolor parchment workbench for translation files; coral accent, sky-blue focus, mono for anything that is a code or a path.
colors:
primary: "#d4726a"
primary-hover: "#c25d55"
primary-active: "#b04a42"
primary-subtle: "#fdf2f1"
primary-text: "#a1443d"
secondary: "#4a7fb5"
secondary-hover: "#3a6a9e"
secondary-active: "#2d5888"
secondary-subtle: "#eef5fb"
parchment: "#faf8f5"
parchment-subtle: "#f5f1eb"
parchment-muted: "#ede8e0"
ink: "#2e2923"
ink-secondary: "#5a534a"
ink-tertiary: "#a89f93"
ink-placeholder: "#736b61"
ink-on-primary: "#2e2923"
border: "#e5dfd7"
border-subtle: "#f0ebe4"
border-strong: "#d4cdc3"
focus-ring: "#4a7fb5"
success: "#6da67e"
warning: "#d9a441"
warning-text: "#8a5a00"
error: "#c95e5e"
info: "#5a8db8"
highlight: "#fde8a0"
status-new: "#a87716"
status-stale: "#b85c26"
status-translated: "#3f7aa8"
status-verified: "#4e8a63"
wc-coral: "#e8847c"
wc-amber: "#e8a838"
wc-sky: "#7bafde"
wc-lavender: "#b892cc"
wc-sage: "#8db580"
typography:
brand:
fontFamily: "Grechen Fuemen, cursive"
display:
fontFamily: "Nunito, sans-serif"
fontSize: "clamp(1.75rem, 2.6vw, 2.25rem)"
fontWeight: 700
lineHeight: 1.25
letterSpacing: "-0.02em"
headline:
fontFamily: "Nunito, sans-serif"
fontSize: "1.5rem"
fontWeight: 600
lineHeight: 1.25
letterSpacing: "-0.01em"
title:
fontFamily: "Nunito, sans-serif"
fontSize: "1.125rem"
fontWeight: 700
lineHeight: 1.25
letterSpacing: "-0.01em"
group-title:
fontFamily: "Nunito, sans-serif"
fontSize: "1rem"
fontWeight: 700
lineHeight: 1.375
body:
fontFamily: "Nunito, sans-serif"
fontSize: "1rem"
fontWeight: 400
lineHeight: 1.5
body-small:
fontFamily: "Nunito, sans-serif"
fontSize: "0.875rem"
fontWeight: 400
lineHeight: 1.375
label:
fontFamily: "Nunito, sans-serif"
fontSize: "0.875rem"
fontWeight: 600
lineHeight: 1.5
caption:
fontFamily: "Nunito, sans-serif"
fontSize: "0.75rem"
fontWeight: 400
lineHeight: 1.375
tag:
fontFamily: "Nunito, sans-serif"
fontSize: "0.625rem"
fontWeight: 600
letterSpacing: "0.05em"
mono-code:
fontFamily: "IBM Plex Mono, monospace"
fontSize: "0.875rem"
fontWeight: 600
mono-path:
fontFamily: "IBM Plex Mono, monospace"
fontSize: "0.75rem"
fontWeight: 400
lineHeight: 1.45
rounded:
sm: "0.25rem"
md: "0.375rem"
lg: "0.5rem"
xl: "0.75rem"
full: "9999px"
spacing:
"1": "0.25rem"
"2": "0.5rem"
"3": "0.75rem"
"4": "1rem"
"5": "1.25rem"
"6": "1.5rem"
"8": "2rem"
"10": "2.5rem"
"12": "3rem"
"16": "4rem"
components:
button-primary:
backgroundColor: "{colors.primary}"
textColor: "{colors.ink-on-primary}"
rounded: "{rounded.lg}"
padding: "0 {spacing.5}"
height: "40px"
typography: "{typography.label}"
button-primary-hover:
backgroundColor: "{colors.primary-hover}"
textColor: "{colors.ink-on-primary}"
button-outline:
backgroundColor: "{colors.parchment}"
textColor: "{colors.ink}"
rounded: "{rounded.lg}"
padding: "0 {spacing.5}"
height: "40px"
typography: "{typography.label}"
button-outline-hover:
backgroundColor: "{colors.parchment-subtle}"
textColor: "{colors.ink}"
button-sm:
rounded: "{rounded.md}"
padding: "0 {spacing.3}"
height: "34px"
button-busy:
backgroundColor: "{colors.parchment-subtle}"
textColor: "{colors.ink-secondary}"
button-text:
backgroundColor: "transparent"
textColor: "{colors.ink-secondary}"
typography: "{typography.label}"
button-text-hover:
textColor: "{colors.ink}"
card:
backgroundColor: "{colors.parchment}"
textColor: "{colors.ink}"
rounded: "{rounded.xl}"
padding: "{spacing.5}"
card-compact:
backgroundColor: "{colors.parchment}"
textColor: "{colors.ink}"
rounded: "{rounded.xl}"
padding: "{spacing.4}"
segmented-control:
backgroundColor: "{colors.parchment}"
rounded: "{rounded.md}"
padding: "2px"
segment:
backgroundColor: "transparent"
textColor: "{colors.ink-secondary}"
rounded: "{rounded.sm}"
padding: "5px {spacing.3}"
typography: "{typography.body-small}"
segment-on:
backgroundColor: "{colors.parchment-muted}"
textColor: "{colors.ink}"
rail-item:
backgroundColor: "transparent"
textColor: "{colors.ink}"
rounded: "{rounded.md}"
padding: "{spacing.2} 10px"
typography: "{typography.label}"
rail-item-active:
backgroundColor: "{colors.parchment}"
textColor: "{colors.ink}"
preview-pill:
textColor: "{colors.primary-text}"
rounded: "{rounded.full}"
padding: "0 6px"
dialog-header-tile:
textColor: "{colors.primary}"
rounded: "{rounded.lg}"
size: "38px"
text-input:
backgroundColor: "{colors.parchment}"
textColor: "{colors.ink}"
rounded: "{rounded.md}"
padding: "0 {spacing.3}"
height: "40px"
typography: "{typography.body}"
text-input-mono:
backgroundColor: "{colors.parchment}"
textColor: "{colors.ink}"
rounded: "{rounded.md}"
height: "40px"
typography: "{typography.mono-code}"
chip-editor:
backgroundColor: "{colors.parchment}"
rounded: "{rounded.md}"
padding: "{spacing.2}"
chip-locale:
backgroundColor: "{colors.parchment-muted}"
textColor: "{colors.ink-secondary}"
rounded: "{rounded.full}"
padding: "3px {spacing.2} 3px {spacing.3}"
typography: "{typography.mono-code}"
chip-text:
backgroundColor: "{colors.parchment-subtle}"
textColor: "{colors.ink}"
rounded: "{rounded.full}"
padding: "3px {spacing.2} 3px {spacing.3}"
typography: "{typography.body-small}"
switch-row:
backgroundColor: "{colors.parchment-subtle}"
textColor: "{colors.ink}"
rounded: "{rounded.lg}"
padding: "{spacing.3} {spacing.4}"
switch-tile:
textColor: "{colors.warning-text}"
rounded: "{rounded.md}"
size: "30px"
disclosure:
backgroundColor: "transparent"
textColor: "{colors.ink}"
rounded: "{rounded.lg}"
padding: "{spacing.2} {spacing.3} {spacing.2} {spacing.4}"
---

# Design System: LingoTracker

## Overview

**Creative North Star: "The Watercolor Ledger"**

LingoTracker is a workbench for translation files that live in a developer's own repository, and its surfaces look like warm paper with careful ink on it. The page is parchment with a faint fractal-noise grain fixed over everything; panels and cards sit one tonal step off the page rather than floating on heavy shadows. Two pigments carry all the meaning: a coral/vermillion primary for the brand mark, the primary action, and the single top rule on every dialog, and a deep sky blue that is reserved for the keyboard focus ring, the input focus glow, and the "base locale" tint. Everything else is a warm neutral.

Density is operational, not editorial. Labels sit above their fields, groups are introduced by a short bold heading and a one-line hint, hints are 12px secondary ink, and anything that is a code or a path (locale codes, folder paths, file names) is set in IBM Plex Mono so it reads as data. The world is built over Angular Material (M2 theme, density -1), but the visible surfaces override Material chrome: dialogs drop their container padding, inputs are hand-drawn wells rather than Material outline fields, chips are the project's own pills.

Confirmed rejections from the shipped code: no hard offset shadows, no decorative gradients except the four-pigment header rule, no all-caps section headings, no Material outline fields inside the dialog family.

**Key Characteristics:**
- Parchment ground with a fixed paper-grain overlay in both themes.
- One accent (coral) for identity and the primary action; one accent (sky) for focus and "base".
- 3px coral top rule on every dialog panel; hairline (`1px --color-border`) separations everywhere else.
- Labels above fields; group heading + one-line hint introduces each section.
- Codes and paths in IBM Plex Mono at the surrounding size; prose in Nunito.
- Soft, warm-tinted shadows used only for lifted panels and hover; tonal steps convey depth at rest.
- Light and dark themes share one token set; the dark scale is the light neutral scale inverted.

## Colors

A warm parchment neutral scale carrying two pigments, coral and sky, with a quiet four-colour watercolor accent set used only for decoration.

### Primary

- **Coral / Vermillion** (`{colors.primary}`): the brand pigment. Used for the dialog top rule, filled primary buttons, the folder tile tint on cards and dialog headers (12% fill, 25% border), selected/hover card borders, and the base-locale left rule in the translation editor. Hover and active steps darken (`primary-hover`, `primary-active`).
- **Coral Text** (`{colors.primary-text}`): the text-weight coral. The fill tone only reaches 2.68:1 on a card, so any copy that must read as "primary" uses this instead (5.05:1). In dark theme the brightened primary already clears 4.5:1 and `primary-text` aliases it.
- **Coral Subtle** (`{colors.primary-subtle}`): a near-white blush for selected rows and soft highlights.

### Secondary

- **Deep Sky Blue** (`{colors.secondary}`): the attention pigment. It is the focus-ring colour (`{colors.focus-ring}` is the same value), the focused-input border and 22% glow, and the "base locale" chip tint (16% fill, 35% border, 45% mixed into the text). It is never a fill for a primary action.
- **Sky Subtle** (`{colors.secondary-subtle}`): info wells and soft secondary backgrounds.

### Tertiary

- **Amber Warning** (`{colors.warning}` / `{colors.warning-text}`): the "locked" hue. Read-only tiles use a 14% amber fill with `warning-text` ink; the switched-on read-only row mixes 6% amber into its ground and 35% into its border. `warning` itself is fill/border only (about 2.1:1 on parchment) and must never set type.
- **Error** (`{colors.error}`): invalid borders, error hints, the remove-chip hover.
- **Success / Info** (`{colors.success}`, `{colors.info}`): status glyphs and banners.

### Neutral

- **Parchment** (`{colors.parchment}`): the page and the card surface, the dialog panel in light theme, and the field well.
- **Parchment Subtle** (`{colors.parchment-subtle}`): the switch-row ground, text-chip fill, disclosure hover, and the dialog panel in dark theme (where it lifts one step above the page black).
- **Parchment Muted** (`{colors.parchment-muted}`): locale-chip fill and inline-code background.
- **Ink** (`{colors.ink}`): titles, labels, field values, inline `<code>` in prose.
- **Ink Secondary** (`{colors.ink-secondary}`): subtitles, hints, resting chip text, close/menu icons.
- **Ink Tertiary** (`{colors.ink-tertiary}`): decorative glyphs only (leading icons in inputs, chevrons, remove buttons at rest); at 2.5:1 it is not for text.
- **Ink Placeholder** (`{colors.ink-placeholder}`): placeholder copy, darker than tertiary so it clears 4.5:1.
- **Border / Border Subtle / Border Strong** (`{colors.border}`, `{colors.border-subtle}`, `{colors.border-strong}`): hairlines. Panels and rows use `border`; inner dividers use `border-subtle`; input wells and dashed empty states use `border-strong`.

### Status spine

- **New** (`{colors.status-new}`), **Stale** (`{colors.status-stale}`), **Translated** (`{colors.status-translated}`), **Verified** (`{colors.status-verified}`): every surface that reports a status reads these tokens, with `-on-dark` variants for the always-dark tooltip. `new` and `stale` keep saturated chip fills; `translated` and `verified` go near-neutral with the hue carried by ink and border only.

### Watercolor accents

- **Coral, Amber, Sky, Lavender, Sage** (`{colors.wc-coral}` and siblings): decorative pigments for the header rule gradient, empty-state rings, and splashes. Never used for controls or text.

### Named Rules

**The Two-Pigment Rule.** Coral means identity and the primary action; sky means focus and "base". A surface that uses coral for focus, or sky for a button, is off-world.

**The Text-Weight Rule.** Fill tones (`primary`, `warning`, `ink-tertiary`) never set type. Copy uses `primary-text`, `warning-text`, or `ink-secondary` and clears 4.5:1 on its own surface.

**The Status-Spine Rule.** A status colour comes from the `status-*` tokens and never from a local hex; `new` and `stale` are never conflated.

## Typography

**Brand Font:** Grechen Fuemen (with cursive fallback); the LingoTracker wordmark in the app header only.
**Body Font:** Nunito (with sans-serif fallback); every heading, label, control, and paragraph.
**Label/Mono Font:** IBM Plex Mono (with monospace fallback); locale codes, folder paths, file names, resource keys.

**Character:** Nunito's rounded terminals keep a data-heavy tool friendly; Plex Mono's stiffness makes codes and paths read as facts. The pairing is a handwritten ledger with typed entries. Grechen Fuemen never appears outside the wordmark.

### Hierarchy

- **Display** (700, `clamp(1.75rem, 2.6vw, 2.25rem)`, 1.25, -0.02em): page titles ("Collections").
- **Headline** (600, 1.5rem, 1.25, -0.01em): dialog titles, shared by the translation editor and the collection form.
- **Title** (700, 1.125rem, 1.25, -0.01em): card names.
- **Group title** (700, 1rem, 1.375): the `h3` that opens a labelled group inside a form (Source, Locales, Options), always followed by a 12px hint.
- **Body** (400, 1rem, 1.5): field values, standard paragraphs.
- **Body small** (400, 0.875rem, 1.375): dialog subtitles, card path-adjacent copy.
- **Label** (600, 0.875rem, 1.5): field labels above inputs, disclosure titles, button text; switch labels step up to 700.
- **Caption** (400, 0.75rem, 1.375–1.5): group hints, field hints, errors, disclosure summaries, switch descriptions.
- **Tag** (600, 0.625rem, +0.05em, uppercase): the BASE tag inside a locale chip; the only uppercase text in the system, and it never leaves the chip.
- **Mono code** (600, 0.875rem): locale codes in chips and mono inputs.
- **Mono path** (400, 0.75rem, 1.45): folder paths on cards; two lines reserved so cards stay flush.

### Named Rules

**The Mono-Is-Data Rule.** Anything the file system or the config would spell out verbatim (locale code, folder path, file name, key) is set in IBM Plex Mono. Inside prose it is an inline `<code>` at 0.95em in `ink`, with no background, so the line height does not jump.

**The Label-Above Rule.** Form labels sit above their controls as 14px semibold Nunito. No floating labels, no placeholder-as-label.

**The Separator-Break Rule.** A long mono identifier the user has to read back (an output pattern, a generated token path, a file tree entry) is split in the component after each `.`, `_`, `-`, or `/` and rejoined in the template with `<wbr />`, so it wraps between segments under `overflow-wrap: break-word`. `overflow-wrap: anywhere` stays the fallback for strings a template only ever receives whole (card paths, warning prose).

## Layout

Pages are centred columns capped at 1400px with `--spacing-8` vertical and `--spacing-6` horizontal padding, dropping to `--spacing-6`/`--spacing-4` under 600px. The Collections page is an auto-fill grid of cards at `minmax(min(100%, 340px), 1fr)` over equal `minmax(180px, 1fr)` rows, with a `--spacing-5` gap.

Dialogs are fixed-width panels centred by the CDK overlay: the collection form is 540px (`max-width: min(540px, 100vw - 2 * --spacing-6)`, `max-height: min(90vh, 100dvh - 2 * --spacing-8)`); the translation editor is 700px and goes full-screen below 640px. Inside a dialog the column is header / scrolling body / footer, with the body owning the only scroll. Header padding is `--spacing-5 --spacing-6 --spacing-4`; body the same; footer `--spacing-4 --spacing-6 --spacing-5`.

The Collections page is a two-column split: a fluid `minmax(0, 1fr)` column of collection cards beside a fixed 420px bundles column, `--spacing-10` apart, aligned to the top. The bundles column is sticky `--spacing-6` from the top, capped at `calc(100vh - 2 * --spacing-6)`, and scrolls inside that cap with contained overscroll and a thin `border-strong` scrollbar, so an expanded result strip can never push a card's Generate button below the fold. Under 1100px the split becomes one column at `--spacing-12`, the bundles column goes static and unclipped, and the bundle stack becomes an auto-fill grid at `minmax(min(100%, 380px), 1fr)`.

**Section heads are two rows in both columns**: the `h2` and its count on the first, the controls right-aligned on the second (`flex-basis: 100%`), collapsing to a single stacked column under 600px. The 420px bundles column cannot hold its heading and two buttons on one line in any locale; letting only that head wrap would put the two `h2`s on different lines and start the two card stacks at different heights. Giving both heads the same shape makes the columns start flush by construction instead of by a reserved height that a longer translation would break.

The bundle form dialog is the wide member of the dialog family: a 1160px panel (`max-width: calc(100vw - 3rem)`, same 90vh/100dvh ceiling and the same zero-padding, 3px-coral-rule container recipe as the 540px collection dialog) holding a master-detail grid of 240px rail / fluid pane / 320px preview over a 520px minimum body height, so switching sections never resizes the panel. Rail, pane, and preview each own their own scroll; the panel itself never does. Under 1200px the preview column is removed and its blocks reappear unchanged inside a disclosure pinned to the bottom of the pane; under 800px the rail becomes a wrapping horizontal strip above the pane, two-up field rows (`1fr 1fr`, `3fr 2fr`) collapse to one column, and the rules table drops its header row.

Rhythm inside a form: groups stack at `--spacing-5`; within a group, heading-to-controls at `--spacing-3`; a field's label, control, and hint at `--spacing-1`; chips and inline controls at `--spacing-2`. Breakpoints follow the mixins in `styles/breakpoints.scss`: 640, 768, 1024, 1280, 1536px, mobile-first.

## Elevation & Depth

Depth is tonal first, shadowed second. Panels, wells, and rows are placed one neutral step off their parent (page → card → well in light theme; page black → subtle panel → page-black well in dark theme) and separated by hairlines. Shadows are warm-tinted (`rgb(44 36 28 / …)` in light, black in dark), diffuse, and appear only on lifted panels and hover.

### Shadow Vocabulary

- **sm** (`0 1px 3px 0 rgb(44 36 28 / 0.06)`): card at rest; also the lift that marks the active item in the bundle dialog's rail.
- **md** (`0 4px 8px -1px rgb(44 36 28 / 0.08), 0 2px 4px -2px rgb(44 36 28 / 0.06)`): card hover with a 2px lift.
- **lg** (`0 10px 20px -3px rgb(44 36 28 / 0.1), 0 4px 8px -4px rgb(44 36 28 / 0.08)`): dialog panels.
- **xl**: defined, currently unused.
- **Focus glow** (`0 0 0 3px color-mix(in srgb, --color-secondary 22%, transparent)`): input and chip-editor focus; the error variant uses 18% of `error`.
- **Accent glow** (`0 6px 16px -4px color-mix(in srgb, --color-primary 45%, transparent)`): hover on the page's primary "Add" button only.

### Named Rules

**The Tonal-First Rule.** A surface at rest shows its depth by tone and hairline, not shadow. Shadows answer to state (hover, lifted overlay, focus).

**The Top-Rule Rule.** Every dialog panel carries exactly one `3px solid --color-primary` top border and zero container padding; the rule is the dialog's only decoration.

## Shapes

Soft, small radii scaled to the object: 4px for inline code, 6px for input wells, chip editors, and small tiles, 8px for cards' icon tiles, switch rows, disclosures, and dialog panels, 12px for collection cards, and full pills for every chip and the chip-add button. Borders are 1px hairlines; empty states (chip editor with no chips, the "+N" overflow chip, a locked value) switch to a dashed `border-strong` stroke rather than changing colour. Icon tiles are squares (38px header/card, 30px switch) with a translucent tint fill and a slightly stronger tint border in the same hue.

## Components

### Buttons

- **Shape:** the hand-rolled `.btn` is 40px tall with an 8px radius, `0 --spacing-5` padding, 14px/700 Nunito at +0.01em, an 18px leading glyph, and a 1px transparent border so filled and outlined variants share a box. The `--sm` step is 34px with a 6px radius, `0 --spacing-3`, 12px type, and a 16px glyph. Material button shape (4px, density -1) remains only where a Material control is still the host: icon-only buttons, menu triggers, dialog Cancel.
- **Primary:** `.btn--primary` — coral fill and coral border, `ink-on-primary` label, the accent glow at rest, hover to `primary-hover` with a 1px lift. _Amendment (this round):_ the weight is 700 and the glow is `0 4px 12px -5px` at 34% coral, down from `0 6px 16px -4px` at 45%. A 14px label on a saturated coral fill loses too much of its stroke to a wide halo; the light surface survives, the type stops dissolving into it. Primary is now reserved for the one action on a page that has nothing else on it — the empty state and the error retry.
- **Outline:** `.btn--outline` — card surface, `border-strong` hairline, `ink` label; hover fills `parchment-subtle` and mixes 45% coral into the border. This is the card-level and repeat action (Generate, Generate all, Retry).
- **Quiet:** `.btn--quiet` — no ground at rest, a plain `border` hairline, `ink-secondary` label and a coral leading glyph; hover fills `parchment-subtle`, mixes 45% coral into the border and steps the label to `ink`. The third rung of the ladder, for the actions a visitor takes rarely (Add collection, Add bundle). **Frequency sets prominence, not position in the hierarchy of nouns:** a section's create action is not automatically its loudest, and on the Collections page the repeated Generate outranks both Adds.
- **Busy:** `parchment-subtle` ground, `border` hairline, `ink-secondary` label, no glow and no lift, with a 16px coral spinner ring (2px, 25% coral track) replacing the leading glyph and the label switching to the progressive form.
- **Disabled:** 0.55 opacity, no shadow, no transform.
- **Text:** `mat-button` in `ink-secondary`, hover to `ink`; used for Cancel and the close icon.
- **Hover / Focus:** colour steps via `--transition-fast` (150ms), lift and shadow via `--transition-normal`; focus is the global 2px sky outline at 2px offset. The lift is dropped under `prefers-reduced-motion`.
- **Footer convention:** right-aligned, Cancel then Primary, `--spacing-2` apart, above a `border` hairline.

### Chips

- **Locale chip:** full pill, `parchment-muted` fill, transparent 1px border, `ink-secondary` text; code in mono 14px/600 with `3px --spacing-2 3px --spacing-3` padding. Card variant is smaller (12px mono, `1px --spacing-2`).
- **Base variant:** sky tint (16% fill, 35% border, text mixed 45% toward sky) with an uppercase BASE tag at 10px; in edit mode a 14px lock glyph leads the code and the remove control is absent.
- **Text chip (tags, protected terms):** same pill, `parchment-subtle` fill, `border` hairline, Nunito 14px/500 in `ink`.
- **Remove control:** 24px round ghost button in `ink-tertiary`, hover to `error` on a 12% error tint.
- **Interactive chip:** in create mode a locale chip is a button; hover tints non-base chips 10% sky; `aria-pressed` marks the base.

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** `parchment` (light) or 3% ink mixed into `parchment-subtle` (dark); hover mixes 3% coral into the light ground and 8% into the dark one. _Amendment (this round):_ the dark card step is 3%, not 5% — at 5% the card and the page read as the same plane once the grain overlay sits on top.
- **Shadow Strategy:** `sm` at rest, `md` with a 2px lift on hover.
- **Border:** 1px `border`; hover mixes 40% coral into it. Read-only cards swap the icon tile to the amber tint.
- **Internal Padding:** `--spacing-5` (`--spacing-4` under 600px); footer separated by a `border-subtle` hairline holding the locale chips and a trailing arrow. The footer is pushed to the card's floor with `margin-top: auto` and the card carries a `--spacing-4` `row-gap`, so the hairlines and chip rows of a row of cards line up whatever sits above them.
- **Grid:** `repeat(auto-fill, minmax(min(100%, 340px), 1fr))` over `grid-auto-rows: minmax(180px, 1fr)`. A collection card is an identity, not a measurement; a longer name or a read-only note is no reason for one card to be a different object than the one beside it, so every row is the same height and the floor keeps a last row holding a single card in the same proportion as the full rows above it.

### Inputs / Fields

- **Style:** label above (Label role), then a 40px well: 1px `border-strong`, 6px radius, `parchment` ground (`--dialog-well`), optional 18px leading glyph in `ink-tertiary`, `--spacing-2` gap, `0 --spacing-3` padding. Mono variant sets the value in Plex Mono 14px for paths.
- **Focus:** border to `secondary` plus the 22% sky glow, 150ms.
- **Error:** border to `error` with an 18% error glow; a 12px `error` hint with `role="alert"` replaces the normal hint.
- **Locked:** dashed border, transparent ground, `ink-secondary` value, leading lock glyph, and a hint explaining the lock.
- **Hint:** 12px `ink-secondary`; optional 14px leading glyph; file names inside it are inline `<code>`.
- **Page filter field:** the Collections filter is a 260px well with a `border` hairline and an 8px radius, and it still focuses with a coral mix (55% border, 14% glow) instead of sky. Known drift, carried unrepaired; new wells use sky.

### Chip editor

A wrapping well with the same stroke, radius, ground, and focus glow as a text input, `--spacing-2` padding and gap. Chips come first; the inline add row (18px plus glyph, borderless 30px input, optional 28px pill "Add" button that appears once text is typed) flexes to fill the remaining space at a 180px minimum. Empty editors show a dashed stroke. Tags and protected terms reuse it with text chips.

### Labelled group

A `section` with an `h3` in Group-title role and an optional 12px `ink-secondary` hint stacked at 2px, then controls at `--spacing-3`. Groups stack at `--spacing-5`. This is how a form reads top to bottom without dividers.

### Switch row

A `parchment-subtle` panel, 1px `border`, 8px radius, `--spacing-3 --spacing-4` padding: 30px amber lock tile, then a 14px/700 label over a 12px description, then a Material slide toggle. When on, the row mixes 6% amber into its ground and 35% into its border over 200ms. The tile is the lock's colour in every locked context (cards, dialogs).

### Disclosure row

A 1px `border`, 8px-radius container with a full-width toggle: 18px leading glyph, 14px/600 title, a right-aligned 12px count summary ("2 tags · 0 terms" or "None yet"), and a chevron that rotates 180° over 200ms. The open panel is separated by a `border-subtle` hairline, padded `--spacing-2 --spacing-4 --spacing-4`, and fades in 4px over 200ms (disabled under reduced motion).

### Bundle card

The compact member of the card family: same 12px radius, `sm`/`md` shadows, hairline border, 38px coral tile (`inventory_2`), Title-role name, and hairline footer as the collection card, at `--spacing-4` padding instead of `--spacing-5`. Under the name sits the output pattern in Mono-path, with the `{locale}` placeholder promoted to `ink` at 600 so the variable is the one thing that stands out. Below it, labelled meta rows: a 16px `ink-tertiary` glyph, a fixed 66px 12px `ink-secondary` label, then the value — collections as soft text chips (`parchment-subtle` ground, `border` hairline, Nunito 12px/500), the types path in mono `ink`. The footer pairs a glyphed locale count with the outline `--sm` Generate button.

**The Connector Rule.** Hovering or focusing a bundle card _draws_ the relationship rather than tinting around it. An absolutely positioned SVG spans the whole split at `z-index: 0`; cards sit at `1` and carry an opaque ground, so a line crossing the inner column of collection cards runs behind it and re-emerges in the gutter instead of scribbling over another card's content. From each consumed collection's right edge a 1.5px coral cubic bezier runs to a single port on the bundle card's left edge, so several inputs visibly converge on one output. Control handles are horizontal and capped at half the span — the inner column is barely 40px from the port, and an unbounded handle there sends the two control points past each other and kinks the curve back on itself. A solid coral dot marks the collection end and a hollow ring the bundle end, both standing 5px off the card edge that would otherwise slice them in half; the direction of the relationship stays legible even where the line itself runs behind a card. The line draws in over 340ms with `pathLength="1"` normalising every curve to one dash length regardless of distance, and under `prefers-reduced-motion` it fades instead.

The bundle takes the card hover treatment (lift, `md`, 40% coral border, hover ground, tile to 20%/45% coral) and its own collection chips flip to the coral voice (8% coral ground, 45% coral border, `primary-text`). Each consumed collection takes a _quieter_ `.linked` state than before — hover ground and a 55% coral border, **and no lift**: a card that moves drags the end of its own connector line with it, and the line is now what states the relation. Unrelated collections are left alone; the 0.5 dim is gone, because a drawn line does not need everything it excludes to be switched off to be read. Geometry is re-measured on the next frame after any change to the hover, the cards, or a bundle's run state, and on captured scroll and resize — the bundles column is sticky and scrolls independently of the page.

Lines are only drawn while the columns sit side by side. Once the layout stacks under 1100px the bundle is below its collections with no gutter to route through, and the `.linked` tint carries the relation on its own.

### Result strip

One 6px-radius strip pinned under the card body at `--spacing-4`, 12px/1.45, always the same shape — glyph, sentence with `·` separators, trailing controls — and only its tint changes. The sentence is a wrapping flex row of clauses, not an inline run: Angular strips the whitespace between clause elements, so inline layout gives the row no break opportunity and it overflows its controls instead of wrapping. Glyph and controls align to the first line (`flex-start` plus a 1px optical nudge); only the copy grows downward.
- **Running:** `parchment-subtle` ground, `border` hairline, `ink-secondary` copy with mono file names in `ink`, and a 2px determinate bar flush to the bottom edge (18% coral track, solid coral fill, width animated over `--transition-slow`).
- **Success:** 10% success fill, 30% success border, copy at 55% success mixed into `ink` (70% in dark). The clean run reads `Generated · n files · n keys per locale` and stops there — the tint and the check glyph already say there were no warnings, and a clause announcing the absence was the widest thing in the strip.
- **Warning:** the success strip re-tinted — 9% amber fill, 26% amber border, copy in `warning-text`, and a trailing `· n warnings` clause. A warning is still a completed run, so it keeps the success anatomy. Because the modifier rides on the success class, any themed override of the success ink must exclude it (`.result--ok:not(.result--warn)`) or a warning renders in success green.
- **Failure:** 10% error fill, 30% error border, copy at 55% error mixed into `ink`, and an outline `--sm` **Retry** trailing the message.

**The Travelling-Separator Rule.** A `·` belongs to the clause that follows it, emitted as that clause's `::before`, with the clause itself unbreakable. A separator can then only ever lead a wrapped line, never dangle at the end of the one above it. Prose inside a strip (a failure message) opts out and breaks normally.

A completed strip carries a **Details** disclosure — a bare `currentColor` toggle with a rotating chevron — and a dismiss `✕`, together in one trailing cluster pinned to the strip's first line. Details is the last labelled affordance; the dismiss sits outermost at 0.65 opacity, because it is the strip's own chrome and belongs against the edge it removes. Keeping them in one cluster is what stops them drifting apart when the copy wraps. The disclosure opens a panel separated by a 20% `currentColor` hairline and revealed with the standard 4px fade. Files written are a mono path against a tabular count; warnings are `warning-text` list items clamped to three lines at 62ch with the full text on `title`, because a generator warning is a paragraph and the card is a summary surface.

### Segmented control

The house form for 2–4 exclusive options, and the approved alternative to Material's button toggles. A hairline `border-strong` well on the dialog's field ground with 2px padding and a 2px gap, holding borderless 4px-radius pills at `5px --spacing-3`, 14px/500 in `ink-secondary` with an optional 16px glyph. The selected pill fills `parchment-muted` and steps to `ink` at 600. The well takes the same sky focus treatment as a text input (`secondary` border plus the 22% glow) on `:focus-within`; individual segments show the 2px sky outline _inset_ so it never overlaps the well's stroke. A `--mono` flavour sets the labels in Plex Mono 12px/600 for format and code choices, and the disabled well drops to 0.6 opacity.

### Master-detail dialog

The wide member of the dialog family (see Layout for the grid and its fallbacks). It shares the collection dialog's panel recipe, header, wells, hints, and footer exactly; what is new is the three columns.
- **Rail:** `parchment-subtle` with a right hairline, 2px between items. An item is a 6px-radius row at `--spacing-2 10px`, 14px/600 `ink` with an 18px `ink-tertiary` glyph, an ellipsised label, and an optional Mono-path 11px sub-line (`ink-tertiary` when it has no value yet, so the row height never changes). Right-aligned trailing slot carries either a 12px count or a 6px error dot. Hover fills 60% of the active ground; the active item lifts to the panel surface with `sm` shadow and its glyph turns coral. Child items indent to `--spacing-6` and step to 700 when active; groups are separated by a 1px `border` rule.
- **Pane:** the form column. Section head is an 18px/700 title over a 12px hint, with an optional right-aligned text action. Fields use the existing label-above wells, in `1fr 1fr` and `3fr 2fr` rows; sub-fields that depend on a switch hang off it indented 14px behind a left `border` hairline. Switch rows here use the coral tile (12% coral fill, coral glyph) rather than the amber lock, because they gate output rather than mark a lock, and the on state tints the row 5% coral with a 35% coral border.
- **Preview:** `parchment-subtle` with a left hairline and `--spacing-5` blocks, each a 14px/700 heading with a 16px `ink-tertiary` glyph over its content: a mono file tree (`ink-secondary` directories, `ink` files, 14px glyphs) whose new entries carry a 10px coral pill in `primary-text` on a 12% coral tint; a dry-run definition list with `ink-secondary` terms against 600-weight `ink` values (`ink-tertiary` while the numbers are still a skeleton); and one example key in a bordered mono well on the field ground. The whole preview drops to 0.6 opacity while stale.
- **Footer:** the standard hairline, Cancel, Primary — plus a leading validity line whose 14px glyph is `success` only when the form is genuinely valid and `ink-tertiary` while it is not. The affirmative glyph is earned, never decorative.

### Dialog anatomy

Panel (see Layout for widths) with zero Material padding, a 3px coral top rule, and `lg` shadow. Header: 38px coral tile with a 19px glyph, Headline title, one-line Body-small subtitle in `ink-secondary`, absolutely positioned close button at `--spacing-3`, hairline below. Body: the scrolling column of labelled groups. Footer: hairline above, right-aligned Cancel + Primary. The translation editor shares the top rule, title, subtitle, close, and hairlines; the collection form adds the header tile.

## Do's and Don'ts

### Do:

- **Do** open every dialog with the 3px coral top rule, zero container padding, `lg` shadow, and the header / hairline / body / hairline / footer column.
- **Do** put labels above controls at 14px/600 and hints below at 12px `ink-secondary`.
- **Do** set locale codes, paths, and file names in IBM Plex Mono; inline them in prose as `<code>` at 0.95em in `ink` with no background.
- **Do** use sky blue for focus (2px outline, or border plus 22% glow on wells) and for the base-locale tint; use coral for the primary action and identity.
- **Do** mark locked and read-only states with the amber lock tile (14% amber fill, `warning-text` ink) so they are unmistakable.
- **Do** reuse the locale pill for any locale, the text chip for any word-like tag, and the chip editor for any editable list.
- **Do** place surfaces one neutral step off their parent and separate them with 1px hairlines before reaching for a shadow.
- **Do** build page- and section-level actions from the hand-rolled `.btn` recipes (`--primary` filled coral, `--outline` hairline, `--sm` for card-level repeats); Material's palette does not resolve to `--color-primary`.
- **Do** split long mono identifiers after `.`, `_`, `-`, and `/` and emit `<wbr />` between the parts when the component owns the string.
- **Do** keep an affirmative footer glyph tied to real form validity: `success` when valid, `ink-tertiary` while not.
- **Do** state a relationship by drawing it — a coral connector from each input's edge into one port on the output — and leave everything it excludes alone.
- **Do** honour `prefers-reduced-motion` by disabling reveal animations and hover lifts.

### Don't:

- **Don't** set type in `primary`, `warning`, or `ink-tertiary`; use the text-weight tokens.
- **Don't** use Material outline form fields inside the dialog family; the label-above well is the field.
- **Don't** use uppercase or letterspaced text outside the BASE tag inside a chip.
- **Don't** use Grechen Fuemen anywhere but the wordmark.
- **Don't** add hard offset shadows, gradients on controls, or a second accent rule on a dialog.
- **Don't** use Material button toggles for an exclusive choice inside a dialog; the segmented control is the form.
- **Don't** let an in-card result strip grow without a ceiling: clamp prose warnings and put the full text behind `title`, not on the page.
- **Don't** hard-code a status hue; read the `status-*` tokens.
