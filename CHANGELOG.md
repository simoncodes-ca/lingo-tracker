# [0.8.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.7.0...v0.8.0) (2026-03-12)


### Bug Fixes

* **cli:** fix build issues ([4364d9e](https://github.com/simoncodes-ca/lingo-tracker/commit/4364d9ecea2786d798ce5f908f1b00bda68e3856))
* remove malformed transloco devDependency entry ([2111d61](https://github.com/simoncodes-ca/lingo-tracker/commit/2111d615b133e3198f355c02319ca902dfa6a3dc))
* **tracker:** correct CSS variable names for border radius ([01425a1](https://github.com/simoncodes-ca/lingo-tracker/commit/01425a145c6e5c4f5d8e0c09bb9359c961a96ebd))


### Features

* **all:** finish move resource feature ([61bd780](https://github.com/simoncodes-ca/lingo-tracker/commit/61bd780216c925c83b14c4a67bd28a776a35a2af))
* **api:** add ability to add resources ([faddb33](https://github.com/simoncodes-ca/lingo-tracker/commit/faddb33a2c380b81898dafc9db8670765aef48da))
* **app:** add ability to add collections from tracker app ([d6d12df](https://github.com/simoncodes-ca/lingo-tracker/commit/d6d12dfcbe3e1b663cd23e51d5116bd091b20099))
* **app:** add ability to delete collections ([ee654ef](https://github.com/simoncodes-ca/lingo-tracker/commit/ee654ef48493ca3e97a20112a1920bcc0442ce89))
* **app:** add ability to edit resource ([1844517](https://github.com/simoncodes-ca/lingo-tracker/commit/18445170d22ec3a250854210f178380ba6496be2))
* **cli:** add abilitty to delete resources ([a6be916](https://github.com/simoncodes-ca/lingo-tracker/commit/a6be916057dba93c410780c5ee16148bca54def7))
* **cli:** add addResource command ([c3dfcd6](https://github.com/simoncodes-ca/lingo-tracker/commit/c3dfcd69d7d50334e581c0fcd1eee8b693e24a9a))
* **cli:** add bundle type generation ([d0478a5](https://github.com/simoncodes-ca/lingo-tracker/commit/d0478a58dea6b189eea6a0c88aaedbfdb80898b0))
* **cli:** add bundling support ([e990994](https://github.com/simoncodes-ca/lingo-tracker/commit/e99099486904295b4d941bd29fb179068b579aca))
* **cli:** add export command ([58ae0a1](https://github.com/simoncodes-ca/lingo-tracker/commit/58ae0a1604e3b983d2af0b077773d123350d7f8e))
* **cli:** add normalize command ([f3814c3](https://github.com/simoncodes-ca/lingo-tracker/commit/f3814c3836b450ee04ac32335ef6c9dd05d5f4d5))
* **cli:** add support for importing resources ([3661843](https://github.com/simoncodes-ca/lingo-tracker/commit/366184366cbb1a8c830a467d58ea21c9eb293fb5))
* **cli:** add validation command ([9a69caa](https://github.com/simoncodes-ca/lingo-tracker/commit/9a69caa5e1e9dd919dd20eca18d25cc55ba1b0ec))
* **cli:** made normailze tollerant of invalid JSON files ([ae7ef1c](https://github.com/simoncodes-ca/lingo-tracker/commit/ae7ef1c7bd85aeb516eb064fc898166e52f56635))
* **cli:** update init command to generate default bundle ([4f4c327](https://github.com/simoncodes-ca/lingo-tracker/commit/4f4c327797bf3c37664a587e18fa976c3862309e))
* **core:** add ability to add resource entries ([50e6095](https://github.com/simoncodes-ca/lingo-tracker/commit/50e6095874d26ebfc77f5707f1bb76d5114c0ea6))
* **core:** add normalize functionality ([fde1733](https://github.com/simoncodes-ca/lingo-tracker/commit/fde1733ba7658e78bce7a3f44bdd023f0c0287d0))
* **core:** add support for bundling of resources for application use ([f4ae4d4](https://github.com/simoncodes-ca/lingo-tracker/commit/f4ae4d4d86cbc22c0401dfb787434bbbd7956a13))
* **project:** create monorepo with api, frontend, cli and shared lib ([3a33086](https://github.com/simoncodes-ca/lingo-tracker/commit/3a330860f2719587ef743e23c038475444dd3240))
* **tracker:** Add basic UI functionality ([d59d15a](https://github.com/simoncodes-ca/lingo-tracker/commit/d59d15a1da3fce57efc63de47cf6e5b911bf2880))
* **tracker:** Add initial browse resource capabilities ([36768d0](https://github.com/simoncodes-ca/lingo-tracker/commit/36768d0ea006d0d3024f25ad02eb1c4003dc479d))
* **tracker:** Redo the Angular app ([f00e88b](https://github.com/simoncodes-ca/lingo-tracker/commit/f00e88b58f9617691afcbcf5424507d4f252cd98))
* **tracker:** update collection cards with folder icons and locale badges ([9279e45](https://github.com/simoncodes-ca/lingo-tracker/commit/9279e4586b09abace53552ad86ae30dbb04833b6))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Features

*   **Bundle Type Generation:** Added support for generating TypeScript type definitions for translation bundles. This provides compile-time type safety and autocomplete for translation keys. Configure via `typeDistFile` (formerly `typeDist`) in `.lingo-tracker.json`.
