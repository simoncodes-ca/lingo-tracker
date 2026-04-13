# LingoTracker
**"Effortlessly Track, Validate, and Manage Your Translations."**

Welcome to LingoTracker, the ultimate companion to the excellent [Transloco](https://github.com/jsverse/transloco) library! LingoTracker is designed for anyone looking to efficiently manage translation resources.

> **Note:** LingoTracker is fully functional with a stable API and is currently being validated in an enterprise application. The 1.0 milestone is focused on completing documentation — see the [roadmap](ROADMAP.md) for details.

## Why Is LingoTracker Awesome?
### AI Ready
LingoTracker ships with an installable skill for AI-powered coding assistants. Run `lingo-tracker install-skill` to generate a skill file for Claude Code, Cursor, or other agent frameworks. The skill teaches your AI assistant the full i18n workflow: detect untranslated hardcoded strings, find similar existing translations, add translation resources, generate bundles, and update your code to use type-safe key tokens — all without leaving your editor.

### Auto-Translation
Bootstrap translations for new locales in seconds with built-in Google Translate integration. LingoTracker protects ICU placeholders and Transloco variables during translation so `{name}` and `{{ count }}` come back intact. Auto-translation triggers automatically when adding or editing resources, or on demand from the CLI and web UI. [Learn more](docs/auto-translation.md).

### Metadata Aware
Every translation moves through a clear status lifecycle: `new` → `translated` → `verified`, with automatic `stale` detection when the base language value changes. MD5 checksums track both source and translated values, so LingoTracker knows exactly which translations need attention without manual bookkeeping. Use the `normalize` command to recompute checksums, add missing locale stubs, and clean up empty folders across your entire project.

### Git Friendly
LingoTracker stores all translations and metadata as JSON files, making it a breeze to review changes in pull requests. Collaborate seamlessly with your team and keep your translation resources organized!

### Browse Resources
LingoTracker includes a full web application for managing translations visually. Navigate a folder tree sidebar, search across keys and values, and filter by locale or status. Switch between compact and expanded density modes, get similar-translation suggestions as you type in the editor, and trigger auto-translation with a single click. View preferences are persisted per collection so you pick up right where you left off.

```bash
# Launch the Tracker web UI
npx lingo-tracker-app
```

### Enterprise Ready & Scalable
LingoTracker is designed with scalability in mind. By storing metadata in separate files and allowing flexible splitting of resources into nested folders, you can manage even the largest resource sets with ease. Whether you're maintaining a handful of translations or managing thousands of keys across dozens of locales, LingoTracker scales with your application.

Built for enterprise workflows, LingoTracker supports multiple collections to organize resources by team, feature, or domain. Its CLI-first approach integrates naturally into CI/CD pipelines, enabling automated validation and resource bundling as part of your release process. Combined with Git-friendly storage, teams of any size can collaborate on translations with full traceability and review through their existing pull request workflows.

### ICU Format Validation
LingoTracker validates ICU message syntax — balanced braces, placeholder formats, plural/select/number/date expressions, and quote-escape sections — catching errors before they reach production.

When importing translations from external tools or translators, variable and placeholder names within ICU messages are often accidentally translated along with the surrounding text. LingoTracker detects these cases during import and automatically restores the original names, so your translations remain functional without manual cleanup.

### Type Safety
Experience compile-time guarantees with generated translation key tokens. This feature ensures that your application uses the correct and valid translation keys, along with type completion, adding an extra layer of confidence to your translations. [Learn more](docs/features/bundle-type-generation.md).

### CLI Support
LingoTracker provides a comprehensive CLI with commands to add, edit, delete, and move resources, find similar translations, normalize metadata, generate bundles, import/export in JSON and XLIFF, and validate resources. All commands support both interactive (TTY) and non-interactive (CI) modes.

### CI/CD Validation
The `validate` command acts as a quality gate for your release pipeline — it exits with a non-zero code if any resource is `new`, `stale`, or untranslated. Add it to GitHub Actions, GitLab CI, or any build system to catch translation gaps before they ship. See the [validation docs](docs/features/validate.md) for CI configuration examples.

### Flexibility
Import and export your resource data in JSON and XLIFF 1.2 formats. Use tags to segment resources, filter exports by status or locale, and configure multiple bundles with pattern matching and collection merging strategies. LingoTracker gives you complete control over how you manage and bundle resources for your application.

## Get Started

### Installation

Install as a dev dependency in your project:

```bash
pnpm add -D @simoncodes-ca/lingo-tracker
npm install --save-dev @simoncodes-ca/lingo-tracker
yarn add -D @simoncodes-ca/lingo-tracker
```

### Quick Start

```bash
# Initialize LingoTracker in your project
npx lingo-tracker init

# Add a translation resource (interactive prompts guide you)
npx lingo-tracker add-resource

# Generate locale bundles and TypeScript key tokens
npx lingo-tracker bundle

# Validate all translations are complete (CI-ready)
npx lingo-tracker validate

# Launch the Tracker web UI
npx lingo-tracker-app
```

Check the [documentation site](https://simoncodes-ca.github.io/lingo-tracker/), the [getting started guide](docs/getting-started.md) for detailed setup instructions, or the full [CLI reference](docs/cli.md) for all available commands.

## Roadmap

### Version 1.0
- Technical documentation covering architecture, APIs, and extension points
- Documentation update for accuracy and completeness
- Detailed documentation site published via GitHub Pages

See the full [roadmap](ROADMAP.md) for future release plans and ideas.

## Contributing
We welcome contributions! Please read our [contributing guidelines](CONTRIBUTING.md) for more information.

## License
LingoTracker is licensed under the [MIT License](LICENSE).

---
Join us today and redefine the way you manage translations with LingoTracker!