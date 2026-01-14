# Collection Card Menu Design

**Date:** 2026-01-14
**Status:** Approved

## Overview

Move edit and delete actions from separate icon buttons into a popup menu triggered by a 3-dot icon in the top-right corner of collection cards.

## Goals

- Cleaner card header UI with less visual clutter
- Consistent menu pattern that can accommodate future actions
- Maintain accessibility and usability

## Design Decisions

### Menu Trigger
- Single icon button with `more_vert` icon (3 vertical dots)
- Positioned in top-right corner of card header
- Uses Angular Material's `MatMenuModule`

### Menu Items
- **Edit:** Icon + text label (using existing edit icon and translation)
- **Delete:** Icon + text label (using existing delete icon and translation)
- Icons positioned left, text on right

### Visual Design
- Menu button subtle (gray) until hovered
- Hover state darkens button to indicate interactivity
- Material's default menu styling (white background, shadow, animation)
- Delete option uses default styling (can add red text color for destructive indication)

## Component Changes

### collections-manager.ts
- Add `MatMenuModule` to imports
- Keep existing `openEditDialog()` and `openDeleteDialog()` methods unchanged

### collections-manager.html
- Replace two icon buttons with single menu trigger button
- Add `<mat-menu>` component with two menu items
- Menu trigger has `stopPropagation()` to prevent card navigation
- Menu items call existing dialog methods

### collections-manager.scss
- Update `.card-actions` styling for single button
- No changes to card layout, dimensions, or other elements
- Menu uses Material's default styling

## Implementation Notes

- Event propagation handled at trigger button level
- Menu automatically closes after item selection
- Maintains keyboard accessibility through Material's built-in support
- No changes to existing dialog or store logic

## Future Extensibility

This pattern makes it easy to add more actions (duplicate, export, view details) to the menu without cluttering the UI.
