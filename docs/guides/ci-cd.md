---
title: CI/CD
sidebar_position: 4
---

# CI/CD

LingoTracker is built to run unattended. Every command works without a terminal, reports through exit codes, and separates results on stdout from diagnostics on stderr. This guide shows the pieces most teams automate: the release gate, bundle generation, and vendor round trips.

## Rules for scripts

- **Nothing prompts.** When stdin or stdout is not a terminal, the CLI never asks. A missing required value exits 1 with the flag names; confirmations are skipped, so `--yes` is unnecessary in CI.
- **Pass the collection.** A single collection is selected automatically, but pass `--collection` anyway so the script survives a second collection being added. `normalize` always needs `--collection` or `--all`.
- **Check exit codes.** Partial failures in `import`, `delete-resource`, `bundle` and `translate-locale` still exit 1.
- **Run from the project root.** The CLI reads `.lingo-tracker.json` from the current directory, or from `INIT_CWD` when run through a package manager script.
- **Secrets stay in the environment.** The machine-translation key is read from the variable named in `translation.apiKeyEnv`.

## The release gate

Validate before you spend time building. Strict on the production branch, relaxed on staging:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Translations are complete and compile
        run: pnpm exec lingo-tracker validate

      - name: Generate bundles and typed keys
        run: pnpm exec lingo-tracker bundle

      - run: pnpm run build
```

For staging, replace the validate step with:

```yaml
      - run: pnpm exec lingo-tracker validate --allow-translated --skip-locales de
```

`--skip-locales` keeps a locale that is still being translated from blocking everyone else. Remove it when the locale is ready.

GitLab CI equivalent, on a runner image that provides Node.js 24 and pnpm:

```yaml
stages: [validate, build]

default:
  before_script:
    - pnpm install --frozen-lockfile

validate-translations:
  stage: validate
  script:
    - pnpm exec lingo-tracker validate

build:
  stage: build
  script:
    - pnpm exec lingo-tracker bundle
    - pnpm run build
```

## Bundles in the build

Generate bundles as part of the build rather than committing them, so they can never be out of date:

```json
{
  "scripts": {
    "prebuild": "lingo-tracker bundle",
    "build": "ng build"
  }
}
```

Add the output folder and the generated token file to `.gitignore`. In an Nx workspace, give the app a target that runs `lingo-tracker bundle --name <bundle>` and list it in the build target's `dependsOn`; this repository does exactly that for its own UI.

If you prefer committed bundles, add a CI check that regenerates them and fails on a dirty tree:

```bash
pnpm exec lingo-tracker bundle --quiet
git diff --exit-code -- src/assets/i18n src/generated
```

## Pull request checks

Two cheap checks catch most translation mistakes before merge:

```yaml
      - name: Metadata is consistent
        run: pnpm exec lingo-tracker normalize --all --dry-run --json > normalize.json
      - name: Nothing broken for staging
        run: pnpm exec lingo-tracker validate --allow-translated
```

A dry-run normalize that reports files it would update usually means someone hand-edited JSON or resolved a merge conflict without running `normalize`. Fail the check on that if you want strict hygiene:

```bash
node -e 'const t=require("./normalize.json").totals; process.exit(t.filesUpdated+t.filesCreated+t.localesAdded+t.foldersRemoved ? 1 : 0)'
```

## Vendor round trip on a schedule

A nightly job can export what needs translation and a second job can import deliveries that land in a shared location:

```bash
# export job: default file names are <locale>.xliff
pnpm exec lingo-tracker export --format xliff --output handoff/outbound

# import job, one file per locale, named <locale>.xliff
for f in handoff/inbound/*.xliff; do
  locale=$(basename "$f" .xliff)
  pnpm exec lingo-tracker import --source "$f" --locale "$locale" || exit 1
done
```

Import exits 1 when any entry failed, for example because a protected term was altered, so the job stops. The log prints the path of the Markdown summary in the temp directory; upload it as a job artifact if you want to keep it. Commit the resulting changes to a branch and open a pull request; the diff is reviewable JSON.

## Machine translation in CI

With `translation.enabled` and the API key in the variable named by `translation.apiKeyEnv` (`GOOGLE_TRANSLATE_API_KEY` in the example), a job can backfill a locale:

```yaml
      - name: Machine-translate German
        run: pnpm exec lingo-tracker translate-locale --collection main --locale de
        env:
          GOOGLE_TRANSLATE_API_KEY: ${{ secrets.GOOGLE_TRANSLATE_API_KEY }}
```

Keep `batchSize` and `delayMs` conservative on a free tier. The results are `translated`, never `verified`, so the strict gate still requires review.

## Running the Tracker UI on a shared machine

`lingo-tracker-app` has no authentication and is meant for a developer's own machine. If you still run it on a shared host, bind to a specific interface, put it behind something that authenticates, and set `LINGO_TRACKER_ALLOWED_HOSTS` to the name you access it by. See [Running the server](../api.md#running-the-server) for the exact Host and Origin rules.
