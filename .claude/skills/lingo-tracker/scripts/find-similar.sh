#!/bin/bash
set -e
# Finds existing translation keys with similar base-locale values.
# Usage: bash find-similar.sh "<value to search>" [collection]
# Run from the repo root.

if [ -z "$1" ]; then
  echo "Usage: bash find-similar.sh \"<value>\" [collection]"
  exit 1
fi

bash .claude/skills/lingo-tracker/scripts/ensure-cli.sh

COLLECTION="${2:-trackerResources}"
npx lingo-tracker find-similar --collection "$COLLECTION" --value "$1"
