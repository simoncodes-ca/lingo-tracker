# Validate Feature

The Validate feature provides a comprehensive translation validation system designed to ensure translation completeness and quality before production deployment. It serves as a quality gate in CI/CD pipelines by checking the status of all translation resources across all configured locales and collections.

## Overview

The validate command is a CLI-only, non-interactive tool that performs exhaustive validation of your entire translation inventory. Unlike other commands that may focus on subsets of data, validate checks **everything** and collects **all** validation results before reporting. This comprehensive approach ensures you have complete visibility into translation status before release.

### Key Characteristics

- **CLI-only**: No API or UI implementation
- **Non-interactive**: Designed for CI/CD environments, never prompts for input
- **Comprehensive**: Validates ALL resources across ALL locales and collections
- **Non-short-circuiting**: Collects ALL validation results before reporting (does not stop at first error)
- **Configurable strictness**: Supports both strict (production) and relaxed (staging) validation modes
- **CI-friendly**: Clear exit codes and structured output for pipeline integration

## Usage

```bash
lingo-tracker validate [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--allow-translated` | Treat 'translated' status as warning instead of failure | `false` |

### Exit Codes

- `0` - All validations passed (all resources verified)
- `1` - Validation failures found (new/stale resources or translated without flag)

## Validation Rules

The validate command categorizes resources based on their translation status:

| Status | Default Behavior | With `--allow-translated` | Description |
|--------|------------------|---------------------------|-------------|
| `new` | ❌ Failure | ❌ Failure | Resource not yet translated |
| `stale` | ❌ Failure | ❌ Failure | Base value changed, translation out of sync |
| `translated` | ❌ Failure | ⚠️ Warning | Has translation but not verified |
| `verified` | ✅ Success | ✅ Success | Reviewed and approved |

### Validation Philosophy

1. **Strict by default**: Production deployments should only include verified translations
2. **Configurable relaxation**: Staging environments may accept translated (but unverified) content
3. **Never allow incomplete**: New and stale translations always fail validation
4. **Comprehensive reporting**: Show all issues, not just the first one encountered

## How It Works

### Validation Process

1. **Load Configuration**: Read `.lingo-tracker.json` from project root
2. **Identify Scope**: Determine all collections and all target locales (excludes base locale)
3. **Load Resources**: Read all translation resources from all collections
4. **Validate Each Locale**: For every target locale, check the status of every resource
5. **Collect Results**: Accumulate all failures and warnings (no early exit)
6. **Generate Summary**: Create comprehensive report grouped by locale
7. **Display Results**: Show complete validation summary to console
8. **Exit**: Return appropriate exit code based on overall validation status

### What Gets Validated

- **Collections**: ALL configured collections (no filtering)
- **Locales**: ALL target locales (base locale excluded)
- **Resources**: EVERY resource in every collection
- **Statuses**: Checked against validation rules for each locale

### What Doesn't Get Validated

- Base locale (source translations are authoritative by definition)
- ICU message format syntax (use separate linting tools)
- File structure or JSON validity (handled during resource loading)
- Missing metadata (resources without metadata are skipped with warnings)

## Examples

### Basic Usage

Strict validation (production):
```bash
lingo-tracker validate
```

Relaxed validation (staging):
```bash
lingo-tracker validate --allow-translated
```

### Output Examples

#### All Verified (Success)

```
✅ Translation Validation PASSED

Validation Summary by Locale:
  es:
    verified: 51

  fr-ca:
    verified: 51

Total: 0 failures, 0 warnings
```

Exit code: `0`

#### Mixed Status (Failure)

```
❌ Translation Validation FAILED

Validation Summary by Locale:
  es:
    new: 3
    stale: 2
    translated: 1
    verified: 45

  fr-ca:
    new: 1
    stale: 0
    translated: 2
    verified: 48

Failures (6 resources):
  es:
    - apps.common.buttons.submit (new)
    - apps.common.errors.network (new)
    - apps.features.dashboard.title (new)
    - apps.common.buttons.save (stale)
    - apps.features.settings.label (stale)
    - apps.common.buttons.cancel (translated)

  fr-ca:
    - apps.common.buttons.submit (new)
    - apps.features.dashboard.subtitle (translated)
    - apps.features.profile.header (translated)

Total: 6 failures, 0 warnings
```

Exit code: `1`

#### With --allow-translated Flag (Warnings)

```
⚠️  Translation Validation PASSED with warnings

Validation Summary by Locale:
  es:
    new: 0
    stale: 0
    translated: 3
    verified: 48

  fr-ca:
    new: 0
    stale: 0
    translated: 1
    verified: 50

Warnings (4 resources):
  es:
    - apps.common.buttons.cancel (translated)
    - apps.features.dashboard.subtitle (translated)
    - apps.features.profile.header (translated)

  fr-ca:
    - apps.common.buttons.apply (translated)

Total: 0 failures, 4 warnings
```

Exit code: `0`

## CI/CD Integration

### GitHub Actions

Production pipeline (strict):
```yaml
name: Production Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: pnpm install

      - name: Validate translations
        run: lingo-tracker validate

      - name: Build
        run: pnpm run build

      - name: Deploy
        run: pnpm run deploy:prod
```

Staging pipeline (relaxed):
```yaml
name: Staging Deploy

on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: pnpm install

      - name: Validate translations (allow translated)
        run: lingo-tracker validate --allow-translated

      - name: Build
        run: pnpm run build

      - name: Deploy
        run: pnpm run deploy:staging
```

### GitLab CI

```yaml
stages:
  - validate
  - build
  - deploy

validate-translations:
  stage: validate
  script:
    - lingo-tracker validate
  only:
    - main

validate-translations-staging:
  stage: validate
  script:
    - lingo-tracker validate --allow-translated
  only:
    - develop
```

### Jenkins

```groovy
pipeline {
    agent any

    stages {
        stage('Validate Translations') {
            steps {
                sh 'lingo-tracker validate'
            }
        }

        stage('Build') {
            steps {
                sh 'pnpm run build'
            }
        }

        stage('Deploy') {
            steps {
                sh 'pnpm run deploy'
            }
        }
    }
}
```

### CircleCI

```yaml
version: 2.1

jobs:
  validate-and-deploy:
    docker:
      - image: cimg/node:22.16
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: pnpm install
      - run:
          name: Validate translations
          command: lingo-tracker validate
      - run:
          name: Build
          command: pnpm run build
      - run:
          name: Deploy
          command: pnpm run deploy

workflows:
  version: 2
  build-and-deploy:
    jobs:
      - validate-and-deploy:
          filters:
            branches:
              only: main
```

### Custom Script Integration

```bash
#!/bin/bash

echo "Running pre-deployment validation..."

# Validate translations
lingo-tracker validate

# Check exit code
if [ $? -ne 0 ]; then
    echo "❌ Translation validation failed. Deployment aborted."
    exit 1
fi

echo "✅ Translation validation passed. Proceeding with deployment..."

# Continue with build and deployment
pnpm run build
pnpm run deploy
```

## Use Cases

### 1. Production Quality Gate

**Scenario**: Ensure only complete, verified translations reach production

**Configuration**: Default strict validation

```bash
lingo-tracker validate
```

**Outcome**: Deployment blocked if any translations are new, stale, or unverified

### 2. Staging Preview

**Scenario**: Deploy to staging with translated but unverified content for review

**Configuration**: Relaxed validation with `--allow-translated`

```bash
lingo-tracker validate --allow-translated
```

**Outcome**: Deployment allowed with warnings for unverified translations

### 3. Pull Request Checks

**Scenario**: Validate translation status in pull requests before merge

**Configuration**: Run as PR check with strict validation

```yaml
name: PR Checks

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate translations
        run: lingo-tracker validate
```

**Outcome**: PR blocked if translations are incomplete

### 4. Translation Readiness Report

**Scenario**: Check translation completeness before sending to translators

**Configuration**: Run validate to identify gaps

```bash
lingo-tracker validate > translation-status.txt
```

**Outcome**: Comprehensive report of all translation gaps

### 5. Multi-Locale Deployment

**Scenario**: Deploy to production with different locale rollout strategies

**Configuration**: Use validation to verify each locale is ready

```bash
# Check if Spanish translations are production-ready
lingo-tracker validate

# If validation passes, deploy all locales
pnpm run deploy
```

**Outcome**: All locales validated before deployment

## Best Practices

### 1. Use in CI/CD Pipelines

Always integrate validate into your CI/CD pipeline as a quality gate:

```yaml
- name: Validate translations
  run: lingo-tracker validate
```

This prevents incomplete translations from reaching production.

### 2. Different Rules for Different Environments

Use strict validation for production and relaxed for staging:

**Production** (main branch):
```bash
lingo-tracker validate
```

**Staging** (develop branch):
```bash
lingo-tracker validate --allow-translated
```

### 3. Run Before Building

Validate translations before building your application:

```bash
lingo-tracker validate && pnpm run build
```

This prevents wasted build time if translations are incomplete.

### 4. Document Validation Requirements

In your project's README or CONTRIBUTING guide, document validation requirements:

```markdown
## Translation Requirements

Before deploying to production:
- All translations must be in 'verified' status
- Run `lingo-tracker validate` to check status
- Translation validation is enforced in CI/CD pipeline
```

### 5. Review Validation Output

Don't just check exit codes—review the output to understand what needs attention:

```bash
lingo-tracker validate | tee validation-report.txt
```

This creates a record of validation results for review.

### 6. Combine with Export

Use validate to identify gaps, then export for translation:

```bash
# Check status
lingo-tracker validate

# Export gaps for translation
lingo-tracker export --format xliff --status new,stale
```

## Technical Details

### Implementation

The validate feature is implemented across two layers:

#### Core Library (`libs/core/src/lib/validate/`)

- `types.ts`: Type definitions for validation options, results, and resource details
- `validate-resources.ts`: Core validation logic and resource status checking
- `generate-validation-summary.ts`: Summary generation and formatting

#### CLI Application (`apps/cli/src/commands/validate.ts`)

- Command definition and option parsing
- Configuration loading
- Core library integration
- Console output and exit code handling

### Resource Loading

The validate command reuses the existing `loadResourcesFromCollections` utility from the core library, ensuring consistency with export/import operations.

### Status Determination

Translation status is determined by examining metadata checksums:

- **new**: No translation or translation checksum matches base checksum
- **stale**: Base checksum changed since translation was created
- **translated**: Translation exists with non-matching checksums, not verified
- **verified**: Translation exists and marked as verified

### Performance

- **Fast**: Validation only reads metadata, no heavy computation
- **Scalable**: Handles projects with 10,000+ resources efficiently
- **Memory-efficient**: Streams through resources, no large in-memory accumulation

## Limitations

### No Filtering

Validate always checks ALL collections and ALL target locales. There is no option to:
- Validate specific collections only
- Validate specific locales only
- Filter by tags or patterns

**Rationale**: Validation is a pre-release gate and should be comprehensive. Partial validation creates risk of missing incomplete translations.

### No Verbose Mode

Unlike export/import commands, validate does not have a `--verbose` flag. Output is always concise, showing only:
- Summary counts by locale
- List of failures
- List of warnings

**Rationale**: CI logs should be concise. Showing all verified resources adds noise.

### No JSON Output

Validate only outputs human-readable text. There is no `--json` flag for structured output.

**Rationale**: CI systems capture console output effectively. JSON output can be added in future if needed.

### No Summary File

Unlike export/import, validate does not write a summary file to disk.

**Rationale**: CI systems capture stdout/stderr. No clear storage location for files.

## Future Enhancements

Features explicitly not included but could be added:

1. **Verbose Mode**: Show detailed per-resource status with `--verbose` flag
2. **Collection/Locale Filtering**: Validate specific subsets with `--collection` and `--locale` flags
3. **JSON Output**: Structured output for programmatic consumption with `--format=json`
4. **Summary File**: Write markdown summary to disk with `--output` flag
5. **Custom Exit Codes**: Different codes for different failure types
6. **Threshold Configuration**: Allow X% translated with `--threshold=95`
7. **Webhook Notifications**: Send results to Slack/Teams

These enhancements can be added based on user feedback without breaking existing functionality.

## Troubleshooting

### Validation Fails with Many New Resources

**Problem**: Validation shows many resources with 'new' status

**Solution**:
1. Export new resources: `lingo-tracker export --status new`
2. Send to translators
3. Import translated content: `lingo-tracker import`
4. Validate again: `lingo-tracker validate`

### Validation Fails with Stale Resources

**Problem**: Resources marked as 'stale' after base value changes

**Solution**:
1. Export stale resources: `lingo-tracker export --status stale`
2. Update translations
3. Import updated content: `lingo-tracker import`
4. Validate again: `lingo-tracker validate`

### Validation Passes but Translations Seem Wrong

**Problem**: All resources verified but translations contain errors

**Solution**: Validation only checks status, not content quality. Review translations manually or use additional QA processes.

### Validation Fails in CI but Passes Locally

**Problem**: Inconsistent validation results between environments

**Solution**:
1. Ensure `.lingo-tracker.json` is committed to version control
2. Verify translation files are committed
3. Check that all required files are included in CI checkout
4. Confirm same version of lingo-tracker is used

### Exit Code Always 0 Even with Failures

**Problem**: CI pipeline not detecting validation failures

**Solution**: Ensure you're checking the exit code correctly:
```bash
lingo-tracker validate
if [ $? -ne 0 ]; then
    echo "Validation failed"
    exit 1
fi
```

## Related Commands

- **export**: Export untranslated resources identified by validate
- **import**: Import translations to resolve validation failures
- **normalize**: Fix metadata issues that may affect validation
- **bundle**: Generate deployment bundles after validation passes

## Summary

The validate command is an essential tool for maintaining translation quality in production deployments. By enforcing comprehensive validation as part of your CI/CD pipeline, you ensure that:

- No incomplete translations reach production
- Translation status is transparent and actionable
- Quality standards are consistently enforced
- Deployment confidence is high

Use strict validation for production and relaxed validation for staging to balance quality requirements with development velocity.
