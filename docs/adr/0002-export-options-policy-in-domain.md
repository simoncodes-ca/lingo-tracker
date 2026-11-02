# Export Options Policy in domain

Status: Accepted

Date: 2026-10-20

## Context

ADR-0001 kept export defaults and advisories in the CLI because they had only one consumer.
The API and Tracker gained export entry points.
This change meets the revisit trigger in ADR-0001.
All three entry points repeat export defaults, enum validation, or combination rules.

## Decision

The domain Export Options Policy owns shared defaults, enum validation, and combination advisory data.
This decision supersedes ADR-0001.
The CLI flag record, API mapper, and Tracker export helpers consume the policy.
Domain depends on neither core nor Node.

The policy uses NEEDS_WORK_STATUSES for the default status filter.
It preserves the existing base property name constant for core consumers.
Format resolution has no default.
CLI prompts and Tracker drafts initially select XLIFF, while the API requires a format.

The policy returns advisory reasons.
The CLI renders those reasons with its existing text.
The API and Tracker add no advisories.
Named predicates identify JSON and rich JSON.
The applicability function owns the base-property question rule: JSON with include-base, even without rich JSON.
The advisory function also reports when that property has no effect without rich JSON.
The requirement table stays private.
Public types describe the policy, choices, formats, JSON structures, option names, and advisory data.
The CLI owns prompt presentation and supplied-option detection.
Dry-run and verbose defaults remain in the CLI because no other entry point consumes them.

## Consequences

The three entry points share one policy without behavior changes.
CLI flag records still import only types from core, so CLI help does not load core operations.
CLI and API collapse an omitted or empty base property name to undefined so core applies the default.
Tracker drafts and CLI prompts use the shared base property name directly.
Existing API error text and persisted Tracker drafts retain their behavior.
Core export processing remains unchanged.
