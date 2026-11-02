# Export options stay in the CLI

Status: Superseded by ADR-0002

Date: 2026-10-15

## Context

Import uses a domain Import Strategy Policy because core and the CLI both consume its rules.
A round-26 attempt to mirror this policy for export produced a domain module with one consumer: the CLI flag record.
The export policy failed the deletion test. Removing it returned a small set of rules to their only consumer.

## Decision

Export option defaults and combination advisories stay in the CLI flag record.
Only values with a non-CLI consumer belong in a shared module.
The base property name default lives in domain because core and lazy CLI metadata both consume it.
Flag records import only types from core, so CLI help does not load core operations.

## Consequences

If the API or Tracker gains an export entry point, revisit this decision.
