#!/bin/bash
# Ensures the lingo-tracker CLI is built before use.
# Skips the build if dist/apps/cli/main.js already exists.
# Run from the repo root.

CLI_ENTRY="dist/apps/cli/main.js"

if [ -f "$CLI_ENTRY" ]; then
  echo "CLI already built ($CLI_ENTRY exists). Skipping build."
  exit 0
fi

echo "CLI not found. Building..."
pnpm run build:cli
