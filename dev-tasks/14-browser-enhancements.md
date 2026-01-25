# Localization Resources List — Enhancements (Compact/Medium/Full)
Scope: Improve the existing resources list UI with density modes, roll-ups, progressive disclosure, and persistent preferences. No inline editing; edits occur in a separate dialog. 

## Changes at a Glance
Three density modes: Compact, Medium, Full (toggle persists).

- The view mode switch (button group) and  selected locale controls which value is shown in list views in the translation main header
- Value is the primary visual element; key is subdued but copy-to-clipboard.
- Roll-up indicator summarizes all locales’ statuses per resource.
- Comment and Tag info via icons with popovers (view-only).
- Per-row action menu: Edit, Move, Delete; double-click row opens Edit.
- Fully keyboard-accessible; touch-capable; no hover-only content.

## Compact View (dense, scan-friendly)
- Shows value for the selected locale (1 line, prominent).
- Key is small/muted and copyable on click (shows “copied” feedback). Does not navigate.

Right-side controls (fixed order/width):
- Selected-locale status chip (New/Stale/Translated/Verified) which is a Roll-up indicator (single compact element; click/focus opens breakdown popover).
- Comment icon (tooltip/snippet on focus/hover; click opens full comment popover).
- Tag icon with count (click opens tags popover).
- Density target: ~40–44 px row height on desktop (44–48 px on touch).

## Medium View (adds context)
- Value up to 2 lines (primary).
- Key small/muted and copyable, shown beneath value.
- Selected other locales shown with chips (locale code + status text + color); overflow as “+N”.
- Same right-side controls as Compact.


## Full View (all details, read-only)
- Value fully visible (no clamp unless extremely long).
- Key small/muted, copyable near the value.
- Comment always visible as a note-style callout on its own line (preserves line breaks; view-only).
- Tags visible inline as chips (wrapping as needed).
- Locales list with value, status chip
- Comfortable padding around content (10–20 px).
- Roll-up Indicator. Single compact visual summarizing New/Stale/Translated/Verified. Inline label (e.g., “68% verified” or “45/66”). Popover on click/focus: counts by status and locales grouped by status (view-nly).

## Comments
Compact/Medium: comment icon only; tooltip/snippet on focus/hover; popover on click with full comment (view-only, selectable, copy button).
Full View: always visible in a subtle callout; not editable.

## Tags
Compact/Medium view: tag icon with count; popover lists tags (chips, view-only). Optional: clicking a tag applies a filter (if supported).
Full View: inline list of tag chips.

## Interactions
- Per-row action menu: Edit, Move, Delete.
- Double-click row background opens Edit dialog; keyboard equivalent: Enter on focused row.
- Move opens a Move dialog; Delete confirms in a modal.
- Clicking the key copies; does not navigate.
- Popovers (roll-up, comment, tags) open on click/Enter; close on Esc/click-away. All reachable via keyboard.

- Persistence (local, cross-restart)
Store and restore: view mode, selected locales, group collapse state, and any visible-locale chip preferences.

Accessibility (desktop-first, touch-capable)
- Fully keyboard navigable: Tab/Shift+Tab to all controls; Enter/Space activate; Esc closes menus/popovers/dialogs.
- no color-only signals: status chips include text; roll-up has an accessible name announcing counts.
- Clear, visible focus styles on all interactive elements.
- Hover behaviors mirrored on focus (tooltips/popovers).
- Copy action shows non-blocking confirmation and is screen-reader friendly.

- Visual & Density Guidelines
- Visual hierarchy: Value (primary, highest contrast) > status/roll-up > key (muted) > icons.
- Compact: ~40–44 px rows; tight padding (6–8 px horizontal).
- Medium: ~80-88 px rows; moderate padding (10–12 px horizontal).
- Full: generous content padding (10–20 px); clear separation between sections.
 -Right-side controls use a fixed width/order to avoid layout shift.

## Acceptance Checklist
- View toggle switches between Compact/Medium/Full and persists.
- Global locale picker controls the displayed value and persists.
- Compact: value 1 line, key copyable, status chip + roll-up + comment/tag icons present.
- Medium: value up to 2 lines, key copyable, other-locale chips shown with overflow handling.
- Full: comment always visible as a callout; tags inline; locales table present.
- Roll-up popover shows correct counts and locale breakdown.
- Comment/tag popovers open via click/Enter; read-only content.
- Action menu (Edit/Move/Delete) works; double-click opens Edit; Delete confirms.
- All interactions keyboard-accessible with clear focus; no hover-only requirements.