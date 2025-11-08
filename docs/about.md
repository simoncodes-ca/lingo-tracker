# About LingoTracker

LingoTracker is a comprehensive translation management tool designed as the ultimate companion to the [Transloco](https://github.com/jsverse/transloco) library. It provides developers and teams with an efficient, scalable solution for managing translation resources across multiple languages.

## What LingoTracker Does

LingoTracker streamlines the entire translation workflow by providing intelligent tracking, validation, and management of translation resources. It automatically detects when translations become stale, validates ICU message formats, and ensures consistency across all supported languages.

## Key Capabilities

- **Smart Translation Tracking**: Automatically marks translations as stale when base language values change, preventing meaning drift
- **Git-Friendly Storage**: JSON-based storage makes translation changes easy to review in pull requests
- **Intuitive Resource Browser**: User-friendly interface for efficiently navigating large translation datasets
- **Enterprise Scalability**: Handles massive resource sets through metadata separation and flexible folder organization
- **Built-in Validation**: ICU message format validation catches errors before they reach production
- **Type Safety**: Compile-time translation key validation with full IDE completion support
- **CI/CD Integration**: Powerful CLI for automated validation in build pipelines
- **Format Flexibility**: Import/export support for JSON, XLIFF, and other translation formats
- **Resource Linking**: Symlink support for sharing resources across projects
- **Explicit Status Workflow**: `new`, `translated`, `stale`, `verified` with automatic updates on base changes
- **Entry Tagging**: Tags stored alongside entries for rich filtering and export
- **Deterministic Checksums**: MD5-based checksums for both base and translated values
- **Strict Key Rules**: Dot-delimited keys; per-segment allowed chars `[A-Za-z0-9_-]+`; no de-duplication with target folder

## Who It's For

LingoTracker is ideal for development teams working on internationalized applications who need reliable, scalable translation management. Whether you're managing a small project with a few languages or an enterprise application with hundreds of translation keys, LingoTracker adapts to your needs.

## Technology Integration

Built specifically to complement Transloco, LingoTracker integrates seamlessly into existing Angular workflows while providing extensible APIs for custom tooling and IDE plugins.

---

*LingoTracker: Effortlessly Track, Validate, and Manage Your Translations.*
