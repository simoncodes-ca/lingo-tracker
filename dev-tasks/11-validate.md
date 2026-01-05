# Feature: Translation Validation Command

## Overview

The validate command is a CLI-only feature designed to verify the readiness of translations for production release. It serves as a quality gate in CI/CD pipelines by checking translation status across all configured locales and collections. The command performs a comprehensive validation of all resources, collecting all validation failures and warnings, then reports the complete results at the end. This ensures teams have full visibility into translation status before release.

This feature addresses a critical gap in the release process: preventing incomplete or stale translations from being deployed. By enforcing translation completeness as part of the build pipeline, it maintains translation quality standards and provides clear feedback to teams about which translations need attention before release.

**Business Value:**
- Prevents accidental deployment of incomplete translations
- Enforces translation quality standards in automated pipelines
- Provides clear, actionable feedback on translation status
- Reduces post-release translation issues and customer complaints
- Enables different quality thresholds for different release stages (e.g., staging vs production)

## Implementation Status

**Status**: ✅ COMPLETED

**Implementation Date**: 2026-01-04

**Delivered Components**:
- Core validation logic in `libs/core/src/lib/validate/` with comprehensive status checking and summary generation
- CLI command `validate` with `--allow-translated` flag for configurable validation strictness
- Full unit test coverage (>90%) with 45+ test cases across core logic and CLI command
- Complete documentation including usage examples, CI integration snippets, and validation rules reference

**Documentation**:
- CLI Usage: `docs/cli.md` (validate command section)
- Feature Guide: `docs/features/validate.md` (comprehensive usage examples and CI integration patterns)

## Technical Context

### Architecture Integration

- **CLI Application** (`apps/cli/src/commands/validate.ts`): Command definition, option parsing, user output
- **Core Library** (`libs/core/src/lib/validate/`): Business logic for resource loading, validation, and summary generation
- **Existing Infrastructure**: Leverages existing `loadResourcesFromCollections` and resource loading patterns from export/import features

### Dependencies

- `libs/core`: Core business logic and domain models
    - Translation status types (`TranslationStatus`)
    - Resource loading utilities (`loadResourcesFromCollections`)
    - Configuration management (`LingoTrackerConfig`, `CONFIG_FILENAME`)
- `prompts`: Not used (this is a non-interactive CI command)
- File system operations via Node.js `fs` and `path` modules

### Key Design Decisions

1. **Non-Interactive Only**: Unlike export/import commands, validate should NEVER prompt. It must work in CI environments with no TTY.
2. **Comprehensive Validation**: The command validates ALL resources across ALL locales and collections, collecting all failures and warnings before reporting. It does NOT stop at the first error.
3. **Error vs Warning Philosophy**:
    - `new` and `stale` statuses = hard failures (exit code 1)
    - `translated` status = configurable (default: error, flag: warning)
    - `verified` status = success
4. **Scope**: Validates ALL target locales and ALL collections by default (no filtering)
5. **Exit Codes**:
    - `0` = All validations passed
    - `1` = Validation failures found (new/stale resources or translated without flag)
6. **Output Format**: Clear, concise, CI-friendly output with counts and complete summary of all issues

### Translation Status Lifecycle (Reference)

- `new` - Not yet translated (validation failure)
- `translated` - Has translation but not verified (configurable: failure by default, warning with `--allow-translated`)
- `stale` - Base value changed, translation out of sync (validation failure)
- `verified` - Reviewed and approved (validation success)
