# [1.0.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.19.1...v1.0.0) (2026-11-02)


* build!: drop Node 22 support ([9438256](https://github.com/simoncodes-ca/lingo-tracker/commit/9438256c195438c3f017fd429c240e7dd57fff84))
* build!: require Node 22.22.3+, 24.15+ or 26+ ([2d98c54](https://github.com/simoncodes-ca/lingo-tracker/commit/2d98c541976d9bc7691df9d01f40f29393fffd80))
* feat(api)!: answer malformed request bodies with 400 ([ff19265](https://github.com/simoncodes-ca/lingo-tracker/commit/ff19265ca07835a2c5e1935c229e2055191d35eb))
* feat(api)!: bind the API to 127.0.0.1 and guard Origin and Host ([c54ca34](https://github.com/simoncodes-ca/lingo-tracker/commit/c54ca341c78a4145f4e010ace4a16ca3455bbd1b))
* feat(core)!: add-resource refuses an existing key unless told to replace ([77a133e](https://github.com/simoncodes-ca/lingo-tracker/commit/77a133efd22697ae78b4df34d45adf4cf8446f30))
* feat(core)!: one Key Tree nests flat keys; a bundle run generates exactly what it plans ([e324f7f](https://github.com/simoncodes-ca/lingo-tracker/commit/e324f7fc82f764320d881df0c5c9efce97d428ea))
* feat(core)!: one rename rule for collection and bundle updates ([0213814](https://github.com/simoncodes-ca/lingo-tracker/commit/0213814aefec0f96a3250471c19d50536c5da044))
* feat(core)!: one Value Check decides whether a translated value keeps its source's contract ([cc3e765](https://github.com/simoncodes-ca/lingo-tracker/commit/cc3e7653001bd81e6a398f28e0629280ff27afa5))
* fix(cli)!: import and export options get their defaults once, after prompting ([ed577ca](https://github.com/simoncodes-ca/lingo-tracker/commit/ed577ca83c330911c546cce5e1499129243fa88b))
* fix(cli)!: one Entry Change rule; edit-resource can clear comment and tags ([0cbd534](https://github.com/simoncodes-ca/lingo-tracker/commit/0cbd53431c58c9ad1451c4542307fe584b96aed1))
* fix(cli)!: run results state their own outcome, and bundle exits 1 when type generation fails ([b34b225](https://github.com/simoncodes-ca/lingo-tracker/commit/b34b2253af7eeeda5fb44e6f308312d57b35608c))
* fix(core)!: one Folder Pruning rule removes empty folders and keeps stray files ([31410cc](https://github.com/simoncodes-ca/lingo-tracker/commit/31410cc0ba717f1316708860388f0bf2d9eb031a))
* fix(core)!: one wording for collection folder problems, and symlinked folders are refused ([1fab52c](https://github.com/simoncodes-ca/lingo-tracker/commit/1fab52c7ba4722d64223ef49cfcaa59008b7eecf))
* fix(core)!: one write rule decides a translation's stored status ([ae2beb3](https://github.com/simoncodes-ca/lingo-tracker/commit/ae2beb3a1d38d5ba818f3a7a54116e2b125e8658))
* refactor(api)!: export and import job modules own prepare, dry-run and start ([a3c6cff](https://github.com/simoncodes-ca/lingo-tracker/commit/a3c6cff457c953ff23fb7ce29c1a1a893245ef04))
* refactor(core,api)!: moves use the opened project; each collection gets its own sink ([85ecd9d](https://github.com/simoncodes-ca/lingo-tracker/commit/85ecd9d4ea47639728fe550f0e1b8a9d32cc918d))
* refactor(core)!: core writes deliver Resource Mutations through one sink as the disk changes ([68e55b8](https://github.com/simoncodes-ca/lingo-tracker/commit/68e55b8a986b86ad37260fed3b82f7310a38579f))
* refactor(core)!: one Move executor runs key, pattern and folder moves ([8f34900](https://github.com/simoncodes-ca/lingo-tracker/commit/8f349007574ca9e1c6c1098fcc2c9921dd486d05))
* refactor(core)!: one Move Report for every move; malformed move input is refused up front ([739cf60](https://github.com/simoncodes-ca/lingo-tracker/commit/739cf60c0280788f0d0a4b88dcad2e553c6c06a9))
* refactor(core)!: one translation run handle replaces the prepare, select and execute exports ([11ed4a6](https://github.com/simoncodes-ca/lingo-tracker/commit/11ed4a6464224181b28703daafa7a8c08d953ac0))
* refactor(core)!: project terms answer by intent, not raw problems ([16c835f](https://github.com/simoncodes-ca/lingo-tracker/commit/16c835f549e87ff4d7bba3e1f19e7516e46ab511))
* refactor(core)!: tag edits go through Collection Change; break the resource tree import cycle ([4675b2e](https://github.com/simoncodes-ca/lingo-tracker/commit/4675b2e6961827718d571534f1daac8f903c311b))
* refactor(core)!: the opened project owns its guarded Config Write ([5e24045](https://github.com/simoncodes-ca/lingo-tracker/commit/5e24045e183c3909296195482f593c9e70e568ee))
* refactor(core)!: the Resource Folder stores ICU and needs its base locale ([a6194cf](https://github.com/simoncodes-ca/lingo-tracker/commit/a6194cf5627d01c72f72ea372dfd7d4670fa5192))
* refactor(core)!: typed error codes, an exhaustive HTTP table and a narrow error surface ([018147e](https://github.com/simoncodes-ca/lingo-tracker/commit/018147e47e1666d0d7edeadcd76670e602cfba63))
* refactor(domain)!: one Collection Settings rule for core and the Tracker ([5c3ed13](https://github.com/simoncodes-ca/lingo-tracker/commit/5c3ed13f70571815f96f3a6568c2786099590541))


### Bug Fixes

* align bundle, export, import and allowed-host behaviour with docs ([59c62c1](https://github.com/simoncodes-ca/lingo-tracker/commit/59c62c16fd3d5e4de15698a4d4c83753bc6ff239)), closes [#141](https://github.com/simoncodes-ca/lingo-tracker/issues/141)
* **api:** allow PATCH in CORS and test the app bootstrap ([2caddcf](https://github.com/simoncodes-ca/lingo-tracker/commit/2caddcf2c449bdddd660e1b64d53afc5b4ae1bf9))
* **api:** count created entries in import totals ([c4ac1b1](https://github.com/simoncodes-ca/lingo-tracker/commit/c4ac1b1d955302081ca470528543538a938a5852))
* **api:** keep NestJS 11's JSON 404 outside /api ([ad2cd14](https://github.com/simoncodes-ca/lingo-tracker/commit/ad2cd14cf269f01d0e79d8f34be93d293246dbc2))
* **api:** one Route Collection seam resolves and guards the route collection ([2a2844e](https://github.com/simoncodes-ca/lingo-tracker/commit/2a2844ef461c35d1529453f18162bca7750a669b))
* **build:** drop the docs-site project reference from the root tsconfig ([2858333](https://github.com/simoncodes-ca/lingo-tracker/commit/2858333920a925f960e8319caa2a36312f3d0a4b))
* **build:** stop inferring Nx targets from root package scripts ([19974f6](https://github.com/simoncodes-ca/lingo-tracker/commit/19974f6a5a9d74f50c74e6d5bc30019f425607d2))
* **build:** typecheck with tsc --build again under Nx 24 ([c5b99ba](https://github.com/simoncodes-ca/lingo-tracker/commit/c5b99ba094590cecb4b2699155bf58207d0b046a))
* **ci:** scope test-results outputs to api and cli projects ([7269afa](https://github.com/simoncodes-ca/lingo-tracker/commit/7269afadf13aae626575f3c5475b8a71f21ceed2))
* **cli:** add-collection stores only what the user chose; init builds config in core ([f1819fe](https://github.com/simoncodes-ca/lingo-tracker/commit/f1819fe50926ae1678682b18870be87b9941854a))
* **cli:** flag values arrive under their record keys, so --no-transform-icu-to-transloco works ([02d82ba](https://github.com/simoncodes-ca/lingo-tracker/commit/02d82ba3b4631adca6cea9a0e15b080bd995d159))
* **cli:** list every braced finding and report normalize findings once ([71c736f](https://github.com/simoncodes-ca/lingo-tracker/commit/71c736f0c251624d9fecc86bfc0e88b3c454ea25))
* **cli:** never overwrite import/export summaries from runs in the same second ([92c99c8](https://github.com/simoncodes-ca/lingo-tracker/commit/92c99c81197ac9a238829b92b6ed7a400bcfdc73)), closes [#152](https://github.com/simoncodes-ca/lingo-tracker/issues/152)
* **cli:** print the cause of a reported error ([cca0fd5](https://github.com/simoncodes-ca/lingo-tracker/commit/cca0fd54930b6e427bf6a3c0511e3ee31a55b0bd))
* **cli:** the Run Summary Writer owns the summary write and its announcement ([be2106a](https://github.com/simoncodes-ca/lingo-tracker/commit/be2106a1c293c72faad424ffc0dccacc04b90fb6))
* **cli:** word the bundle hierarchical conflict error ([5aafd01](https://github.com/simoncodes-ca/lingo-tracker/commit/5aafd01e319d2813d02f931d11848ec00edab387))
* **core,cli,api:** the import run owns its counts and outcome ([2f64ec1](https://github.com/simoncodes-ca/lingo-tracker/commit/2f64ec171b7746be0a0828ecb09eabd96f747685))
* **core:** a cwd through a file still reports a missing config ([7a3942a](https://github.com/simoncodes-ca/lingo-tracker/commit/7a3942ab337f1bdc76804f7528ce082519e196f3))
* **core:** a folder move to the root always nests ([a0c4bbc](https://github.com/simoncodes-ca/lingo-tracker/commit/a0c4bbc0c9c3ba4c1da0cdb97dd4943fd02b5e67))
* **core:** a Translation Batch keeps a failed folder write from miscounting a run ([cc0e6b6](https://github.com/simoncodes-ca/lingo-tracker/commit/cc0e6b6cb27c77b78fd08a3044064251ce4ade04))
* **core:** compare collection records without node:util so core still builds ([4f61f85](https://github.com/simoncodes-ca/lingo-tracker/commit/4f61f85b3e3548be1bc9a3390d47f4462215e4dd))
* **core:** folder pruning recognises a missing file from any VM realm ([cfc8613](https://github.com/simoncodes-ca/lingo-tracker/commit/cfc86131472d6bc11ec27dde633f3a493e9bf32a))
* **core:** keep bundle collection references in step with collections ([d4440a1](https://github.com/simoncodes-ca/lingo-tracker/commit/d4440a12f33ce6e8b2513960f59c3b9cfc973daa))
* **core:** keep omitted collection fields on PUT; harden Collection Entry ([0380b81](https://github.com/simoncodes-ca/lingo-tracker/commit/0380b81151805e5eaa0c7fb7d537ef436370f8d4))
* **core:** locale changes read every folder before writing ([d93189e](https://github.com/simoncodes-ca/lingo-tracker/commit/d93189e2b8c54a2a3706f82132f02f0ddc0769df))
* **core:** make Project Terms updates atomic via one updateProjectTerms ([a440636](https://github.com/simoncodes-ca/lingo-tracker/commit/a4406368f0d51181179f97e4579af3aebd1cb13e))
* **core:** moveFolder keeps source content outside the collection ([c353bed](https://github.com/simoncodes-ca/lingo-tracker/commit/c353bed8e6fee7dc7dd919e013751d267d9361d5))
* **core:** normalize marks drifted translations stale ([89aa9fc](https://github.com/simoncodes-ca/lingo-tracker/commit/89aa9fcc7140ac8b17e04395a6dbfe551bd24c93))
* **core:** omit status transitions for base-locale import changes ([8529743](https://github.com/simoncodes-ca/lingo-tracker/commit/8529743b281783c8e389ac469804eae421324c69)), closes [#154](https://github.com/simoncodes-ca/lingo-tracker/issues/154)
* **core:** one Translation Write-back keeps writes made during a provider call ([6a67a64](https://github.com/simoncodes-ca/lingo-tracker/commit/6a67a64a1e842dc3916a32e7dc6ad054bb279245))
* **core:** project term updates target what they say; config and term files roll back together ([e966347](https://github.com/simoncodes-ca/lingo-tracker/commit/e96634743a7aa00bb961cb9eff7d64fce30c846d))
* **core:** refresh stale metadata on unchanged import ([37b196b](https://github.com/simoncodes-ca/lingo-tracker/commit/37b196b29ea907924e65a66e313de087d02ee697))
* **core:** reject empty base values on add and edit ([60211f5](https://github.com/simoncodes-ca/lingo-tracker/commit/60211f5d70853a9d8c46cb8486413a7c1e9881b5))
* **core:** reject placeholders inside literal braces and report collapsed case bodies ([21cd292](https://github.com/simoncodes-ca/lingo-tracker/commit/21cd292a4aaad7670c8ece506ca29e83a4a8aaab))
* **core:** relocation saves a folder after the folders it sends to ([83496f7](https://github.com/simoncodes-ca/lingo-tracker/commit/83496f7bb78c0ca4fce1d2692950381a84737697))
* **core:** skip machine translations with braced placeholders, check base-locale statuses ([120b136](https://github.com/simoncodes-ca/lingo-tracker/commit/120b1360259d91a37d01f9113b5c9b71124742d2))
* **core:** surface protected-terms problems and tighten collection patch rules ([c502576](https://github.com/simoncodes-ca/lingo-tracker/commit/c502576d6cda0ca2929962a430c979c8b7dc53b0))
* **core:** wildcard move with an empty destination moves to the root ([75215e0](https://github.com/simoncodes-ca/lingo-tracker/commit/75215e0ab51370ac15ac3521e08cf81e207c0dc0))
* **deps:** relax pinned runtime dependency ranges and update Angular to 21.2.25 ([b461bd2](https://github.com/simoncodes-ca/lingo-tracker/commit/b461bd2ce097230d86e69507309d1657c1190896))
* **domain:** drop unused flattenKeyTree export ([4ca851d](https://github.com/simoncodes-ca/lingo-tracker/commit/4ca851dd50f2ceaaa2600beb365d96da9cb9dafb)), closes [#155](https://github.com/simoncodes-ca/lingo-tracker/issues/155)
* **domain:** keep glued and non-ASCII case bodies, read lexical facts from the parser ([94e3825](https://github.com/simoncodes-ca/lingo-tracker/commit/94e3825743b2fe9ca8e3a4196a62694cc26214b4))
* **domain:** keep ICU quoting in bundles and close open quotes in auto-fix ([bcaa6da](https://github.com/simoncodes-ca/lingo-tracker/commit/bcaa6da05b4ccc0f3126e414b16ad1acd4af31e9))
* **domain:** match MessageFormat quoting and warn on quoted interpolation ([bdc2a33](https://github.com/simoncodes-ca/lingo-tracker/commit/bdc2a33c82fb78c0675514ed4f01051d295f3fdd))
* **domain:** reject unquoted literal braces in ICU branch bodies ([bc7d38c](https://github.com/simoncodes-ca/lingo-tracker/commit/bc7d38c6c263538ec2ddf69e95720399905d041b))
* **domain:** validate ICU sub-message structure and formatter quoting ([5012ff6](https://github.com/simoncodes-ca/lingo-tracker/commit/5012ff6b7e6190403dd9a1c792b4f5f8f92d11d3))
* fixed messages for config file failures ([213c375](https://github.com/simoncodes-ca/lingo-tracker/commit/213c3753ef595129a61d2635918ce4f87b72572d))
* **import:** keep JSON keys named "value" and report unsupported values ([ec15b28](https://github.com/simoncodes-ca/lingo-tracker/commit/ec15b283b85244272e70907d7953310d5a068f52)), closes [#149](https://github.com/simoncodes-ca/lingo-tracker/issues/149)
* **import:** report skipped JSON values in one warning ([9b47ad6](https://github.com/simoncodes-ca/lingo-tracker/commit/9b47ad6bc319ac2a7a2f0d48833de2af12799457)), closes [#149](https://github.com/simoncodes-ca/lingo-tracker/issues/149)
* keep the message of an invalid-config 500 ([2a42fc3](https://github.com/simoncodes-ca/lingo-tracker/commit/2a42fc32a525bad44bf93273306f776a9298987c))
* **runtime:** address cross-review findings ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([9e29d34](https://github.com/simoncodes-ca/lingo-tracker/commit/9e29d34abcf7e44a242ea9c02eb491e3a9b2f0e4))
* stderr diagnostics, status sort, delete confirm, job error, similarity ([6bc971c](https://github.com/simoncodes-ca/lingo-tracker/commit/6bc971c0e015387b8f8a319ae4c497277de522e1))
* **tracker:** always send clearable collection fields ([f8cee15](https://github.com/simoncodes-ca/lingo-tracker/commit/f8cee1566b9850f155cfdaf1377b5728b69de36a)), closes [#buildResult](https://github.com/simoncodes-ca/lingo-tracker/issues/buildResult)
* **tracker:** an accepted config write whose reload fails is a load error ([e386e54](https://github.com/simoncodes-ca/lingo-tracker/commit/e386e54e1d2b71d7ea807f867355899ca30bebf3))
* **tracker:** avoid returning from tree callback ([debdb09](https://github.com/simoncodes-ca/lingo-tracker/commit/debdb09a811448a7ebac8519c1352cf9db5e8694))
* **tracker:** bundle runs own the generate-all batch ([b61d748](https://github.com/simoncodes-ca/lingo-tracker/commit/b61d74899934049e342bdc035e55e040895cae31))
* **tracker:** cover API Error paths and keep localized 500 fallback ([0ad0c70](https://github.com/simoncodes-ca/lingo-tracker/commit/0ad0c7054d42a2a2c0fb6fd81b022221b8691ede)), closes [#handleCreateError](https://github.com/simoncodes-ca/lingo-tracker/issues/handleCreateError)
* **tracker:** drop unused [@let](https://github.com/let) in the import run strip ([c16ecaf](https://github.com/simoncodes-ca/lingo-tracker/commit/c16ecaf83c540dbb84d2b354811d20413a753b1d))
* **tracker:** editor hand-off resolves with the edit's outcome ([ed70abd](https://github.com/simoncodes-ca/lingo-tracker/commit/ed70abd7fe60fd6bf4608c43693cc8079015697d))
* **tracker:** encode route and query values exactly once ([1e224bc](https://github.com/simoncodes-ca/lingo-tracker/commit/1e224bc198809beb52d909d65d54f9392b28b30f))
* **tracker:** export dialog visual pass fixes ([e2cab42](https://github.com/simoncodes-ca/lingo-tracker/commit/e2cab42a6d399388a57ddc92df2a4cda365fbd96))
* **tracker:** export strip label, focus return and language switch ([21832ea](https://github.com/simoncodes-ca/lingo-tracker/commit/21832ea11cec8557a6ebe9d9e92eacbc6a698479))
* **tracker:** folder draft keeps the root collapsed and one draft identity ([a808e8d](https://github.com/simoncodes-ca/lingo-tracker/commit/a808e8df55f9c8dbee6b63137c62c0de40cd0777))
* **tracker:** guard session loads, keep settings current, always send tags ([c4bd117](https://github.com/simoncodes-ca/lingo-tracker/commit/c4bd1176d3212b33c4b77b4f405e1106efef1784))
* **tracker:** harden export dialog config, error reveal and shared dialog styles ([5432cb7](https://github.com/simoncodes-ca/lingo-tracker/commit/5432cb787bc90ea866a4cb14f213c9de618c2a8e))
* **tracker:** import UI taste fixes ([97036ed](https://github.com/simoncodes-ca/lingo-tracker/commit/97036ed915c4cd5d69b479935bf967100bc28b35))
* **tracker:** keep a config write's outcome when the dialog closes ([5b55038](https://github.com/simoncodes-ca/lingo-tracker/commit/5b550384c14e5cc3b71312190239440043a5d7f2))
* **tracker:** list scope rolls back to a loaded scope and owns its error ([2ef48eb](https://github.com/simoncodes-ca/lingo-tracker/commit/2ef48ebd5a1813a615eab6f320c2af8f766eb22c))
* **tracker:** list skipped export locales as one inline run ([e99d28d](https://github.com/simoncodes-ca/lingo-tracker/commit/e99d28db2152f1cd6afa0fd5b6645c445a1632f7))
* **tracker:** mark translations stale when the editor changes a base value ([e40f8ca](https://github.com/simoncodes-ca/lingo-tracker/commit/e40f8cad38939eb4c06f7b3a84a93af7d3abba48))
* **tracker:** one display status for a locale without metadata ([6c58460](https://github.com/simoncodes-ca/lingo-tracker/commit/6c58460385e8711062a4172d0e9fa0db9e6132fc))
* **tracker:** one folder drop rule, and root entries can be dropped into folders ([5091139](https://github.com/simoncodes-ca/lingo-tracker/commit/5091139314c765578810d7f4b58c36fd38d779a2))
* **tracker:** opt-in failed controls, typed clauses and named buttons on run result strip ([c320fe9](https://github.com/simoncodes-ca/lingo-tracker/commit/c320fe9c6d88fb9d09a66063f963cb99a1091d0c))
* **tracker:** picker folder nodes take the read-only expanded set ([5ab9924](https://github.com/simoncodes-ca/lingo-tracker/commit/5ab992400722156f38e5b4ff09e74abab0870c59))
* **tracker:** quieter import provenance, relative dates and capped details ([6b586c2](https://github.com/simoncodes-ca/lingo-tracker/commit/6b586c2706b478355d415348634498b3cdd4f199))
* **tracker:** reopen on locale or folder change and guard entry writes ([a57e865](https://github.com/simoncodes-ca/lingo-tracker/commit/a57e8651c989d02f86e0f008dbad5df4bc329f59))
* **tracker:** restore export dialog styles and swap the component style budget ([ffc2ae7](https://github.com/simoncodes-ca/lingo-tracker/commit/ffc2ae7c2b5af28ce9b82c6ba501c6e9b4d48ad1))
* **tracker:** return undefined from braced placeholder params for the transloco pipe ([c2ac382](https://github.com/simoncodes-ca/lingo-tracker/commit/c2ac3825dd896f9e46be9a1799703323bc840627))
* **tracker:** settings treats an accepted save as saved when the reload fails ([4ba8de3](https://github.com/simoncodes-ca/lingo-tracker/commit/4ba8de35afdb9a80fca52c0f5a28c70a9b64ae20))
* **tracker:** show preview failures and plan errors in the export footer ([83fd029](https://github.com/simoncodes-ca/lingo-tracker/commit/83fd0296b8faae01ec001c6fb8063323e72f8b84))
* **tracker:** size the export dialog through its open config ([4d95c63](https://github.com/simoncodes-ca/lingo-tracker/commit/4d95c6344e0f8047e84a7cb80a2d05a8c50105d6))
* **tracker:** skip body as an export focus-return target ([2b9d3fe](https://github.com/simoncodes-ca/lingo-tracker/commit/2b9d3fe550c074f9f2c6558596acacfa7abcd2e4))
* **tracker:** skipped-locale toasts no longer blame ICU format ([bb075c2](https://github.com/simoncodes-ca/lingo-tracker/commit/bb075c287169154c7914b0560f40f0db10851237))
* **tracker:** the store refuses folder-tree interactions while the tree is disabled ([da25851](https://github.com/simoncodes-ca/lingo-tracker/commit/da25851cc7713d3c28218f1908f21bfce989c4d9))


### Features

* **api:** add export dry-run, start and job endpoints ([19c11f5](https://github.com/simoncodes-ca/lingo-tracker/commit/19c11f571fc50220fa566319d6b0c239e65b0458))
* **api:** add imports API with source listing, dry run and jobs ([e5c074b](https://github.com/simoncodes-ca/lingo-tracker/commit/e5c074b565fbefc76b1f746dc29922daf5666af2))
* **api:** add request shape schemas and ValidBody pipe ([c69526f](https://github.com/simoncodes-ca/lingo-tracker/commit/c69526fb27dc674f9b3647a23c79684651c28f6f))
* **api:** upload import source files ([9111228](https://github.com/simoncodes-ca/lingo-tracker/commit/9111228eb5f8d0baf1f8954ab7a15edbb0350689))
* **bundle,validate:** runtime-aware bundle output and validate check ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([6598ba5](https://github.com/simoncodes-ca/lingo-tracker/commit/6598ba51f95a0fbcb91b64c1bc3987fab1171765))
* **cli:** a preflight hook checks command preconditions before prompts ([692507d](https://github.com/simoncodes-ca/lingo-tracker/commit/692507d026b1fa4378a35b4be64040ef8d48fc88))
* **cli:** add --yes to normalize to skip the all-collections prompt ([1746a31](https://github.com/simoncodes-ca/lingo-tracker/commit/1746a31e765519fc155aadcaf4f55431d7299ca3))
* **cli:** list unreadable folders in the normalize --json payload ([5d69624](https://github.com/simoncodes-ca/lingo-tracker/commit/5d696245ba39eff058484c41a22bf474880da404))
* **cli:** one Run Report prints every command's warnings, errors and exit ([9567b56](https://github.com/simoncodes-ca/lingo-tracker/commit/9567b5625dc46ded8cd256c28dd84f26dfa422e7))
* **config:** add runtime setting and runtime-aware import conversion ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([d3fc33f](https://github.com/simoncodes-ca/lingo-tracker/commit/d3fc33f8f2433ef18ab6e055888d510937e80f2c))
* **core:** add import source inspection and locale inference ([e82f8a0](https://github.com/simoncodes-ca/lingo-tracker/commit/e82f8a029b834f74291f04dbef0544f1d7f884ab))
* **core:** every write prunes the folders it empties, once, at the end ([8aea168](https://github.com/simoncodes-ca/lingo-tracker/commit/8aea1686b3fc5804dd6c768b4688e0b22d50641d))
* **core:** split export into prepare and write phases ([4585a20](https://github.com/simoncodes-ca/lingo-tracker/commit/4585a20064847e0b6afa52b5fb9f440d9e3a32b8))
* **icu:** accept dotted simple arguments in strict checks under plain transloco ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([0e69083](https://github.com/simoncodes-ca/lingo-tracker/commit/0e690839c08f193754b8a6076219c518f3e7c294))
* **import:** group missing interpolation params into one warning ([fb1cc9e](https://github.com/simoncodes-ca/lingo-tracker/commit/fb1cc9eb081ac8f4fd8896ed9d363c5316b444a9)), closes [#150](https://github.com/simoncodes-ca/lingo-tracker/issues/150)
* **import:** warn when an imported value won't survive the ICU round trip ([451a01f](https://github.com/simoncodes-ca/lingo-tracker/commit/451a01f35cd2d7078e3ef360faf2c983fdfd790a)), closes [#150](https://github.com/simoncodes-ca/lingo-tracker/issues/150)
* **init,mt:** detect app runtime at init and protect quoted ICU runs ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([f5279ed](https://github.com/simoncodes-ca/lingo-tracker/commit/f5279eda817eca845499ee362f56c18b5dbd72a4))
* **init:** print the detected runtime in interactive mode too ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([4b44c5f](https://github.com/simoncodes-ca/lingo-tracker/commit/4b44c5f2cd1180f100c4512638f597e004f61450))
* preferred terminology ([#108](https://github.com/simoncodes-ca/lingo-tracker/issues/108)) ([d0175eb](https://github.com/simoncodes-ca/lingo-tracker/commit/d0175eb7d1154990e18866cd0bc3c80b3c7aadc4))
* **tracker:** add and translate the translation editor dialog strings ([5cf56a7](https://github.com/simoncodes-ca/lingo-tracker/commit/5cf56a78eb8c97f4e3c68fa32d64394dc6f5456f))
* **tracker:** add export dialog ([82050fe](https://github.com/simoncodes-ca/lingo-tracker/commit/82050fe37291f52667f621e83baa01e7a76f816f))
* **tracker:** add export store, job polling, draft, form and preview ([f640b40](https://github.com/simoncodes-ca/lingo-tracker/commit/f640b40beb27977aa5121d5b59212628ba29db3a))
* **tracker:** add export translation resources ([2e72b8c](https://github.com/simoncodes-ca/lingo-tracker/commit/2e72b8ca4b4a81149a2ed09dee22ea3389a6ef60))
* **tracker:** add import data layer and generic job run controller ([b0a1c8c](https://github.com/simoncodes-ca/lingo-tracker/commit/b0a1c8c0942b93b8a4be4f111ee8d8568bd29d7d))
* **tracker:** add import dialog ([9c82110](https://github.com/simoncodes-ca/lingo-tracker/commit/9c8211043f71452ee98863ca4f5ee0c56c51eb06))
* **tracker:** add import dialog translation resources ([fbcabe9](https://github.com/simoncodes-ca/lingo-tracker/commit/fbcabe925a37576eb533146c4cd08eb40d6851c8))
* **tracker:** add import entry points and result strip to collections ([f518ff4](https://github.com/simoncodes-ca/lingo-tracker/commit/f518ff4199b9b952e8f678643e5b2d76354529f1))
* **tracker:** add import upload client ([02770e9](https://github.com/simoncodes-ca/lingo-tracker/commit/02770e9bfa95202954525fada0e3f722b31e7dc4))
* **tracker:** align compact rows on a fixed key column and surface edit ([0fb5586](https://github.com/simoncodes-ca/lingo-tracker/commit/0fb558630e3ec1c21749db2f27bbe35641150f0f))
* **tracker:** confirm before saving a value plain Transloco can't render ([#158](https://github.com/simoncodes-ca/lingo-tracker/issues/158)) ([20dc755](https://github.com/simoncodes-ca/lingo-tracker/commit/20dc7557aa6283112a11b1103a190b0082fd1241))
* **tracker:** redesign the translation editor dialog with a context column ([0be732f](https://github.com/simoncodes-ca/lingo-tracker/commit/0be732f315306be13bc5ba0c80dd877604030208))
* **tracker:** reject placeholders inside literal braces in the translation editor ([50ee633](https://github.com/simoncodes-ca/lingo-tracker/commit/50ee6333f344574e6d2b95a29f7830c1afbac3f9))
* **tracker:** runtime advisory in the editor; docs for the runtime setting ([#151](https://github.com/simoncodes-ca/lingo-tracker/issues/151)) ([42e8692](https://github.com/simoncodes-ca/lingo-tracker/commit/42e869244cef80f95e03a2212bd86162fe400892))
* **tracker:** self-host fonts and icons instead of Google Fonts ([cdd5709](https://github.com/simoncodes-ca/lingo-tracker/commit/cdd5709073215e3632a2df20b27ebb5aedbcb199)), closes [#147](https://github.com/simoncodes-ca/lingo-tracker/issues/147)
* **tracker:** upload files from the import dialog ([3c962bf](https://github.com/simoncodes-ca/lingo-tracker/commit/3c962bf118f782048d5e2a9bdf49b38634b8eb4d))
* **tracker:** wire export into the collections manager ([304e20f](https://github.com/simoncodes-ca/lingo-tracker/commit/304e20f6f7027bebce23367460d238d4002a0873))


### BREAKING CHANGES

* export include-* options and basePropertyName no longer
imply rich JSON; pass rich/--rich to get rich objects. Import
createMissing, updateComments and updateTags are ignored for strategies
other than migration.
* engines.node is now ^24.15.0 || >=26.0.0. Node 22 is no
longer supported.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* engines.node is now ^22.22.3 || ^24.15.0 || >=26.0.0.
Node 20, Node 22 before 22.22.3 and Node 24 before 24.15 are no longer
supported.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* POST /api/exports with an unwritable output folder now
returns 400 with the output problem before registering a job, instead of
starting a job that fails. The Tracker already blocks this submit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* The API now binds to 127.0.0.1 by default. Pass --host 0.0.0.0 or
set LINGO_TRACKER_HOST=0.0.0.0 for network access or containers with published ports.
Non-loopback bindings expose the full unauthenticated API, including listing any server
folder, importing from server paths, and uploading import files. Host and Origin
protection apply in every bind mode. LAN IP access needs no extra setting; named access
requires LINGO_TRACKER_ALLOWED_HOSTS.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **domain:** bundles now emit ICU-quoted literals (e.g. '{'x'}')
instead of unescaped text; correct for transloco-messageformat, but
consumers using plain Transloco will see the quotes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* `edit-resource --comment ""` now clears the stored comment
instead of being ignored.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* MoveOptions no longer takes `config`/`cwd`; pass an
opened collection. MoveConfigRequiredError and MOVE_CONFIG_REQUIRED are
removed. openProjectCollection is a new core export.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* ProjectTerms.problems and readProjectTermsView are replaced by the intent views.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* moveResource, moveResources and moveFolder are replaced by executeMove and
executeMoves (synchronous).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* a bundle whose keys conflict (a value with child keys, or two keys with the
same token path) now fails before writing instead of crashing mid-run or dropping a subtree;
plans omit empty-locale files; generateBundleTypes throws on token-path collisions.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* editCollectionTags returns Promise<string[]>.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* core's root barrel no longer exports 23 error classes
that no app uses (e.g. FolderNotFoundError, ConfigChangedError). It now
exports ERROR_CODES, PROVIDER_ERROR_CODES and the ErrorCode types.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* core no longer exports prepareTranslateLocale,
selectPreparedTranslateLocale, executeTranslateLocale or translateLocale;
use prepareTranslationRun(collection).forLocale(locale).execute().

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* a malformed move pattern or key now throws InvalidResourceKeyError instead
of being returned in result.errors. Batch moves validate every operation before writing, so
a malformed operation rejects the whole batch with nothing moved. The API answers 400 where
it used to answer 2xx with errors; the CLI still exits 1 with the same message.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* import fails a target-locale value whose ICU arguments disagree with its
source (after ICU auto-fix; migration imports are exempt), and validate fails a value that
drops a protected term. Use `validate --skip-protected-terms` to opt out.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* PUT /api/bundles/:name with a present but blank `name`
now answers 400 `name must be a non-empty string` instead of updating
without a rename; omit `name` when not renaming. On PUT
/api/collections/:name a non-string `name` answers `name must be a
string`, rename targets are trimmed, and a missing collection with a
blank name answers 404. A stored bundle key that fails the key pattern
can now be updated with its own name (200, was 400). Core consumers:
updateCollection with an empty or whitespace name and
updateBundleDefinition with newKey '' throw InvalidNameError.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* malformed required bodies and wrong-typed fields now return
plain 400 responses before reaching core. maxResults that is not a positive integer (non-numeric, 0,
negative, fractional or empty) now returns 400 instead of defaulting to 100; repeated scalar query parameters are rejected.
Partial collection.translation settings must include enabled, provider and
apiKeyEnv. Wrong-typed optional fields, including tags and override, are rejected.
Non-object bundle definitions and non-string bundle names now return a
plain shape error instead of the Invalid bundle definition response with
errors. Empty resource, keys and moves
arrays are rejected by schemas, and their messages change wording. Folder names
and paths must be strings, sourceFolderPath must be a non-empty string, and
folder move flags must be booleans; an empty destination remains valid for root.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* add, edit, delete, move and folder operations on a key
or folder that passes through a symbolic link below the translations
folder now fail with InvalidCollectionFolderError (HTTP 400) instead of
reading or writing through the link. A symlinked translations folder
itself is still supported.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* a collection whose `locales` is an empty list now
inherits the global locales, matching the Collection Entry rule that an
empty list means inherit. It used to resolve to no locales.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* `lingo-tracker normalize` no longer deletes folders that
hold files other than the collection files and OS junk (for example
.gitkeep, notes.md or a README); those folders are now kept. Folder move
now removes an emptied source folder that holds only OS junk.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* core API — updateCollection, addLocaleToCollection,
removeLocaleFromCollection and editCollectionTags drop the config-file handle;
addCollection, addBundleDefinition, updateBundleDefinition,
deleteBundleDefinition, planProjectTermsUpdate and updateProjectTerms take an
OpenedProject first and drop cwd; deleteCollectionByName(name, options) is now
deleteCollection(openedCollection, options); createConfigFileOperations,
ConfigFileOperations and the protected-terms setters leave the public API;
OpenedProject and openCollection's forDeletion option are added.
HTTP — POST /collections, DELETE /collections/:name and POST/PUT/DELETE
/bundles answer 409 when the config changed during the request (they used to
overwrite the other writer); these routes and protected-terms-only
PUT /config answer 404 for a missing config and 500 "Invalid configuration
file format" for a malformed one.
CLI — add-collection and delete-collection can exit 1 with the conflict
message; protected-terms and preferred-terminology validate the config
(missing baseLocale, non-array locales or missing collections exit 1) and
refuse a missing list destination before printing the preview.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* openResourceFolder requires `baseLocale`; the domain export
`normalizeTranslocoSyntax` is removed in favour of `translocoToICU`.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* `lingo-tracker bundle` now exits 1 when type generation
fails. It used to print the error and exit 0. The API bundle job still
completes with a warning.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* core write results no longer carry `mutations`
(add/edit/delete/move resource, folder create/delete/move, relocation,
translate existing/locale, locale add/remove, updateCollection,
deleteCollectionByName). `translateLocale`'s `onWrite` is renamed
`onMutation`. deleteResource, moveResource, moveFolder, createFolder,
deleteFolder, addLocaleToCollection and removeLocaleFromCollection take a
trailing options argument. HTTP responses are unchanged.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* an unknown status in an API request body is now a 400
instead of being stored. add-resource keeps an explicit `translated` or
`verified` on a value identical to the base (it used to store `new`).
The status of a translation in CreateResourceDto and LocaleUpdateDto is
now optional.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* `lingo-tracker import --strategy migration` without
`--update-comments`/`--update-tags` now updates comments and tags, as the
migration strategy documents.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
* POST /resources is no longer an upsert (409 on an
existing key); non-interactive `add-resource` no longer overwrites
without --override; addResource/addResources throw
ResourceAlreadyExistsError by default; resolveResourcePaths and its two
types are removed from @simoncodes-ca/core.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

## [0.19.1](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.19.0...v0.19.1) (2026-09-17)


### Bug Fixes

* **ci:** migrate pnpm overrides to workspace config ([2c9a3aa](https://github.com/simoncodes-ca/lingo-tracker/commit/2c9a3aa1208ba10ae119a33a627d0bfafbe500b7))

# [0.19.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.18.0...v0.19.0) (2026-09-17)


### Bug Fixes

* correct edit-resource example flag to --base-value ([f2d85ea](https://github.com/simoncodes-ca/lingo-tracker/commit/f2d85eac27245ce8901c1e587ecd5fd40c15fd0c))
* **tracker:** let locale values be selected and copied instead of opening the editor ([e8650b2](https://github.com/simoncodes-ca/lingo-tracker/commit/e8650b201e7f5b2261436f8d9a5fd720e773f3b3))
* **tracker:** make compact rows show one locale consistently ([3227357](https://github.com/simoncodes-ca/lingo-tracker/commit/32273576b4927ddb70934fbe72c784e22833b4e0))
* **tracker:** show indexing state while cache status loads ([0b661fa](https://github.com/simoncodes-ca/lingo-tracker/commit/0b661faa4e0b73b0b4fe058da5574c53c3e7737e))


### Features

* **api:** expose bundle CRUD, dry run and job-based generation ([71a5d03](https://github.com/simoncodes-ca/lingo-tracker/commit/71a5d03fb8637fe053dd1654aaf6648298ef8831))
* **core:** plan, validate and edit bundle definitions ([2cd35f2](https://github.com/simoncodes-ca/lingo-tracker/commit/2cd35f251ca8750cd6e4439c903b90d8838ca584))
* **data-transfer:** add bundle DTOs ([e546182](https://github.com/simoncodes-ca/lingo-tracker/commit/e54618281f6a49e37e3ed04652adf71073c6a952))
* **domain:** add JavaScript identifier validation ([5c5287e](https://github.com/simoncodes-ca/lingo-tracker/commit/5c5287e59c14533e5780520b375c3c71e9d99bf0))
* **tracker:** manage and generate bundles from the collections page ([b551944](https://github.com/simoncodes-ca/lingo-tracker/commit/b55194444195f48cb9bdd172daa475f16e4a3768))
* **tracker:** redesign the create and edit collection dialogs ([09531f9](https://github.com/simoncodes-ca/lingo-tracker/commit/09531f9622061c84dc3b575d4bda387b3efe6479))

# [0.18.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.17.0...v0.18.0) (2026-09-08)


### Bug Fixes

* **api:** cache collections independently instead of one at a time ([0a2aa5d](https://github.com/simoncodes-ca/lingo-tracker/commit/0a2aa5dc0aeb5d7576a1785b5d0474635f30de1f))
* **release:** pack the tarball after the CLI is rebuilt ([d476682](https://github.com/simoncodes-ca/lingo-tracker/commit/d47668236a10c3a994f62551f4debc5b7ea517aa))
* **sample-translations:** repair escaped placeholders in playground fixtures ([134138f](https://github.com/simoncodes-ca/lingo-tracker/commit/134138f72bcaa42b1c4c13ed02bb747a9c616281))
* **tracker:** complete the collections translations ([f74dddb](https://github.com/simoncodes-ca/lingo-tracker/commit/f74dddbab1ed0bc04bf60e6133f7f71790ab7875))
* **tracker:** correct mistranslated status and editor copy ([ae2795e](https://github.com/simoncodes-ca/lingo-tracker/commit/ae2795ebd04215ac1e9b4d2f2fd6d8e5db3c6885))
* **tracker:** describe where protected terms are actually enforced ([80152e3](https://github.com/simoncodes-ca/lingo-tracker/commit/80152e35e0f5b393e7c6fcf804bcecd15d61a00a))
* **tracker:** keep Save reachable in the settings header on narrow screens ([354e47f](https://github.com/simoncodes-ca/lingo-tracker/commit/354e47fe29d51b8125c58a9390adb93e5af15453))
* **tracker:** lead the compact row with the source string ([da9da80](https://github.com/simoncodes-ca/lingo-tracker/commit/da9da80624c67c7b310a5f5ab2fce9364fa6d7e1))
* **tracker:** make the header Settings button inert on the settings page ([091f6fd](https://github.com/simoncodes-ca/lingo-tracker/commit/091f6fd44e60c28aee35d9cabe7b198ff21e6277))
* **tracker:** make the translation item legible and honest ([4463497](https://github.com/simoncodes-ca/lingo-tracker/commit/44634973d34b0175569fb5b46e1ff2f04ecc53f2))
* **tracker:** raise the skip link above the contrast floor ([92e8b56](https://github.com/simoncodes-ca/lingo-tracker/commit/92e8b56db2540f7db090dce1190cf1cbd3c8b77d))
* **tracker:** rebuild the app header control group ([5e77b00](https://github.com/simoncodes-ca/lingo-tracker/commit/5e77b006f33810370c3b9b5c6ed91032b6f2b4be))
* **tracker:** resolve header counts through the transloco pipe ([2cd931c](https://github.com/simoncodes-ca/lingo-tracker/commit/2cd931c023f431609beaecb317a07b6e58836b3e))
* **tracker:** restore interpolation in translated aria-labels ([72abeec](https://github.com/simoncodes-ca/lingo-tracker/commit/72abeecec8ff958ef505cf5874e93620f44737b6))
* **tracker:** separate the two issue states the rollup ring merged ([ce167bf](https://github.com/simoncodes-ca/lingo-tracker/commit/ce167bfdb836b2d18543c59203b7f062ec0f37cc))
* **tracker:** set the resource comment as prose, not fine print ([91985c8](https://github.com/simoncodes-ca/lingo-tracker/commit/91985c8d961cb87b92e2e02aef2c456c26c31f4d))
* **tracker:** show the system glyph when the theme follows the OS ([51fa9e3](https://github.com/simoncodes-ca/lingo-tracker/commit/51fa9e3b0c8ca9214f539f01462c58bd96e110bb))
* **tracker:** unify the browser content toolbar ([cdc2442](https://github.com/simoncodes-ca/lingo-tracker/commit/cdc244298c1475d26a2aac797b806ab63a30a8f5))


### Features

* **api:** revalidate the collection cache against disk on read ([93f32bb](https://github.com/simoncodes-ca/lingo-tracker/commit/93f32bb1b08ebef6a049fb384eec0465902ee9e4)), closes [#86](https://github.com/simoncodes-ca/lingo-tracker/issues/86)
* **cli:** add optional --quiet flag ([5898d7c](https://github.com/simoncodes-ca/lingo-tracker/commit/5898d7c9674605f57772d2431f629e3a62bd2b27))
* **cli:** validate that translations interpolate the base value's placeholders ([18c824e](https://github.com/simoncodes-ca/lingo-tracker/commit/18c824efa238f41449fe4460028adda1e4b00746))
* **tracker:** make status a first-class control in the browser toolbar ([f273c5d](https://github.com/simoncodes-ca/lingo-tracker/commit/f273c5d152f95dcdcf1472a86d1ac8ce5fa461c7))
* **tracker:** make the folder tree collapsible and add a collection root ([4b01558](https://github.com/simoncodes-ca/lingo-tracker/commit/4b015585ae9921ea763864d94c343ed8aa7dd758))
* **tracker:** manage protected terms as an editable list ([2ebe50a](https://github.com/simoncodes-ca/lingo-tracker/commit/2ebe50a582c33154aca201695fcf1e38e7d10002))
* **tracker:** present the protected-terms explanation as an info callout ([e569e3e](https://github.com/simoncodes-ca/lingo-tracker/commit/e569e3edd65c854dc1a647f06d8949049ce41467))
* **tracker:** rework the collections view as a dense card grid ([951df93](https://github.com/simoncodes-ca/lingo-tracker/commit/951df93cc1be073fe2e26709af424a81618cd737))
* **tracker:** rework the translation editor dialog ([407d9a0](https://github.com/simoncodes-ca/lingo-tracker/commit/407d9a0e8252a5a69439ce8b615acf885396627a))

# [0.17.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.16.0...v0.17.0) (2026-09-01)


### Bug Fixes

* **cli:** stop find-similar discarding entries whose key matches the query ([8cd8559](https://github.com/simoncodes-ca/lingo-tracker/commit/8cd8559d1e61b8793b594f6755cd917ed7af992f)), closes [#74](https://github.com/simoncodes-ca/lingo-tracker/issues/74) [#75](https://github.com/simoncodes-ca/lingo-tracker/issues/75)
* **deps:** resolve reported dependency vulnerabilities ([207fe3d](https://github.com/simoncodes-ca/lingo-tracker/commit/207fe3d87044db6d081acd68aefe11f331e9377f))
* **domain:** correct normalizedLevenshtein scoring for identical strings ([8f9f2a4](https://github.com/simoncodes-ca/lingo-tracker/commit/8f9f2a476e2239bc38fa2612a562430f942ca3a4)), closes [#75](https://github.com/simoncodes-ca/lingo-tracker/issues/75) [#74](https://github.com/simoncodes-ca/lingo-tracker/issues/74)
* **domain:** keep selectordinal branches in bundled output ([d2930cb](https://github.com/simoncodes-ca/lingo-tracker/commit/d2930cbe7b47dac28b1b6086b01d783e39938e19)), closes [#69](https://github.com/simoncodes-ca/lingo-tracker/issues/69)


### Features

* **validate:** compile every stored value as ICU for its own locale ([90d829f](https://github.com/simoncodes-ca/lingo-tracker/commit/90d829f934231f46ac6b98ac2d1e8ac1ac4e0e48)), closes [#68](https://github.com/simoncodes-ca/lingo-tracker/issues/68)

# [0.16.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.15.0...v0.16.0) (2026-08-31)


### Bug Fixes

* **core:** build domain declarations before core's dts step ([1580002](https://github.com/simoncodes-ca/lingo-tracker/commit/158000259daa5cd6129d854d6576b5ff85db0bb4))
* **domain:** emit the branch-body brace pair for a Transloco consumer ([#70](https://github.com/simoncodes-ca/lingo-tracker/issues/70)) ([7ac9ea6](https://github.com/simoncodes-ca/lingo-tracker/commit/7ac9ea69b95c6f8b4f8a5abad93dc233060aeb45))
* **domain:** make Transloco to ICU conversion position-aware ([#67](https://github.com/simoncodes-ca/lingo-tracker/issues/67)) ([d817a3f](https://github.com/simoncodes-ca/lingo-tracker/commit/d817a3fa21c854d779a8d62888fe917e38936bb9))
* **tsconfig:** repair project references so typecheck actually runs ([d4013ac](https://github.com/simoncodes-ca/lingo-tracker/commit/d4013acd12904ff656e358f4c551150882a05526))


### Features

* **protected-terms:** protect terms from translation across export, import, API, CLI, and UI ([551481d](https://github.com/simoncodes-ca/lingo-tracker/commit/551481d23602166a6c69223cca5c9d983c40c866))
* **protected-terms:** store protected terms in a JSON file ([7574514](https://github.com/simoncodes-ca/lingo-tracker/commit/75745141de5458c629ccad5fd18d5a501f20adf8))

# [0.15.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.14.4...v0.15.0) (2026-06-23)


### Bug Fixes

* **cli:** timestamp summary filenames to prevent overwrite across runs ([5fbb7d4](https://github.com/simoncodes-ca/lingo-tracker/commit/5fbb7d4de68e2a3c8660ec87853a4e3d1faeee94))
* **cli:** write import/export summary files to OS temp dir ([7440a81](https://github.com/simoncodes-ca/lingo-tracker/commit/7440a8172fb11fac612098a03ece5154f23f8cb9)), closes [#56](https://github.com/simoncodes-ca/lingo-tracker/issues/56)


### Features

* **cli:** add glossary command for help-translation extraction ([6ddd6e6](https://github.com/simoncodes-ca/lingo-tracker/commit/6ddd6e686bcb7ad785c403adb83103a53f8c8e9b))
* **collections:** add read-only flag to block resource mutations across CLI, API, and UI ([accfbc7](https://github.com/simoncodes-ca/lingo-tracker/commit/accfbc73e86d667afb9ab52e195ad95a8b306aa9))
* **core:** add collection level inheritable tags ([c0654dd](https://github.com/simoncodes-ca/lingo-tracker/commit/c0654dd31407407af48fee160f49c0f2685212b7))
* **tracker:** add ability to edit tags and few small fixes ([e768f81](https://github.com/simoncodes-ca/lingo-tracker/commit/e768f8129f934fe986f3914d9e1c0b588aa962c1))

## [0.14.4](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.14.3...v0.14.4) (2026-05-21)


### Bug Fixes

* **repo:** upgrade npm to 11.5.1+ for OIDC trusted publishing ([4eaf917](https://github.com/simoncodes-ca/lingo-tracker/commit/4eaf917e5c6fadf5f704557059cb2760dd4b74a3))

## [0.14.3](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.14.2...v0.14.3) (2026-05-21)


### Bug Fixes

* **repo:** add registry-url to setup-node to enable OIDC trusted publishing ([0f40449](https://github.com/simoncodes-ca/lingo-tracker/commit/0f40449bf41519859cbc8f98db23b8733341c693))

## [0.14.2](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.14.1...v0.14.2) (2026-05-21)


### Bug Fixes

* **repo:** use explicit ./ prefix so npm treats tarball as a local file ([9000ad4](https://github.com/simoncodes-ca/lingo-tracker/commit/9000ad4d4f67e55123ab58215f68f3ffa61a9c17))

## [0.14.1](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.14.0...v0.14.1) (2026-05-21)


### Bug Fixes

* **repo:** restore npm trusted publishing in release workflow ([410abfe](https://github.com/simoncodes-ca/lingo-tracker/commit/410abfe96b2f5cbf9d2982901e0cc94ddaaa905a))

# [0.14.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.13.0...v0.14.0) (2026-05-21)


### Bug Fixes

* **cli:** fix and improve json export flag resolution ([cd17dee](https://github.com/simoncodes-ca/lingo-tracker/commit/cd17dee458f8fd77dda14b15cfaa6b899cc10b79))
* **core:** add source-language and target-language to file node in xliff export ([c7c276a](https://github.com/simoncodes-ca/lingo-tracker/commit/c7c276a544c5f75965f0663eb0a999154d532d3a))


### Features

* **app:** allow user to modify locales of a collection ([b38c75e](https://github.com/simoncodes-ca/lingo-tracker/commit/b38c75e67c6e1d8abc8189fefbdd178a3d836120))
* **cli:** add ability to change base value property in exported json files ([3db9bf5](https://github.com/simoncodes-ca/lingo-tracker/commit/3db9bf53bbb237a6e7785edb2f245a113168a003))
* **cli:** add configurable debug-keys option for bundle generation ([bf77dae](https://github.com/simoncodes-ca/lingo-tracker/commit/bf77daecc503f41d7e9a1b2014f0554357aa2269))
* **cli:** allow to skip some locales in validate command ([0408f94](https://github.com/simoncodes-ca/lingo-tracker/commit/0408f948901000d262fc4d985ec1ea3dc64fb1a2))
* **tracker:** add link to documentation in the footer ([5d4f40e](https://github.com/simoncodes-ca/lingo-tracker/commit/5d4f40e42a42ba77c37019c51fa9df2a4554eb6e))

# [0.13.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.12.0...v0.13.0) (2026-04-13)


### Features

* **cli:** add ability to add and remove locales ([07417e7](https://github.com/simoncodes-ca/lingo-tracker/commit/07417e7397fee8fccd78380175cc1fe250eb4201))
* **cli:** add ability to translate a locale ([684f185](https://github.com/simoncodes-ca/lingo-tracker/commit/684f185c27c9900f780717c550332f0e1b9277f2))

# [0.12.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.11.0...v0.12.0) (2026-04-08)


### Features

* **tracker:** handle quotes in ICU better ([8c6beca](https://github.com/simoncodes-ca/lingo-tracker/commit/8c6becae16c041ba78598f8e04d0e938463cd660))

# [0.11.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.10.0...v0.11.0) (2026-04-01)


### Bug Fixes

* **app:** add missing translations ([7758c75](https://github.com/simoncodes-ca/lingo-tracker/commit/7758c75c86938d4307ca347969d49cd718fe3f6b))
* **core:** fix transloco to ICU normalization ([345d5b8](https://github.com/simoncodes-ca/lingo-tracker/commit/345d5b87ef41bf74ef199c8eba4156b57d00037d))
* **infra:** address msising review comments ([32c2a92](https://github.com/simoncodes-ca/lingo-tracker/commit/32c2a92597ba606098a15fbdffdd63c9a13578a2))
* **infra:** remove invalid allowed_tools input from claude-review workflow ([74b5114](https://github.com/simoncodes-ca/lingo-tracker/commit/74b5114bd9ca0b7a6fd844c8fcaea1e2e6ae9c72))
* **repo:** address vulnarabilities ([7c370e5](https://github.com/simoncodes-ca/lingo-tracker/commit/7c370e5d6f04143e60393eec63fcec303bb08fed))
* **tests:** fix unit tests ([dcb4152](https://github.com/simoncodes-ca/lingo-tracker/commit/dcb4152b7b826202fe0e534d617fd14467d7dc76))


### Features

* **app:** change create/edit resource dialog to tabed view ([49563db](https://github.com/simoncodes-ca/lingo-tracker/commit/49563db74fd93af2f03dd755f120cd910c4e57c5))

# [0.10.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.9.0...v0.10.0) (2026-03-23)


### Bug Fixes

* **ci:** update remaining main.js references to main.cjs ([63ff414](https://github.com/simoncodes-ca/lingo-tracker/commit/63ff414da962101d76bca163d4cc4af31d4b5a58))


### Features

* add ICU format support with bidirectional Transloco conversion ([3ef6611](https://github.com/simoncodes-ca/lingo-tracker/commit/3ef66113adb4e05d2a37b8fbfea31a7d5a7547f3))
* **app:** change logo and favicon ([25d98d9](https://github.com/simoncodes-ca/lingo-tracker/commit/25d98d9b1ed87fdb3c0c379b6cc93940f508f366))
* **cli:** inject version from package.json at build time via esbuild define ([e661972](https://github.com/simoncodes-ca/lingo-tracker/commit/e661972f4c97075b20e179dba3428dbc63caa80d))
* **tracker:** add locale picker to app header with persistence ([3d09d81](https://github.com/simoncodes-ca/lingo-tracker/commit/3d09d81963c2f671937747556f1455ad452f3307))

# [0.9.0](https://github.com/simoncodes-ca/lingo-tracker/compare/v0.8.0...v0.9.0) (2026-03-19)


### Bug Fixes

* **api:** attempt to fix .bin entry to allow for direct invocation of lingo-tracker-app ([af796d9](https://github.com/simoncodes-ca/lingo-tracker/commit/af796d9463351ce8e75031516008b002fefe171b))
* **cli:** require collection name in import command to prevent unexpected folder imports ([fae78ef](https://github.com/simoncodes-ca/lingo-tracker/commit/fae78ef98465ba5cabe2af731663a68723456dc3))
* **core:** preserve original casing in camelCase token generation ([ffe0b47](https://github.com/simoncodes-ca/lingo-tracker/commit/ffe0b47ed7309cd900122064a6460102157a3ab3))
* **core:** support Transloco {{ }} placeholder syntax in import ([69d25a0](https://github.com/simoncodes-ca/lingo-tracker/commit/69d25a022fa15f0147accc25a1f37846d2f34cde))
* **repo:** fix some installation warnings ([100f1cb](https://github.com/simoncodes-ca/lingo-tracker/commit/100f1cb66a3d23f6085c07fe3d270cb5113463ea))
* **repo:** resolve 25 Dependabot security alerts via pnpm overrides ([9189eff](https://github.com/simoncodes-ca/lingo-tracker/commit/9189eff466033bb31cecd436ee6066992f87fab1))
* resolve lint issues across cli and core libraries ([1404e98](https://github.com/simoncodes-ca/lingo-tracker/commit/1404e9889f0f03d4e3e94fae697655d0f5f62699))


### Features

* **cli:** add bundle setup prompts to init command ([356f710](https://github.com/simoncodes-ca/lingo-tracker/commit/356f710760c20105a29023cecb15844b2c22ee8f))
* **core:** add optional tokenConstantName for custom bundle type constant names ([882ea1a](https://github.com/simoncodes-ca/lingo-tracker/commit/882ea1a8dac58afd92a11c737e62bd08094f338b))
* **core:** rename typeDist to typeDistFile with validation and deprecation support ([c87c239](https://github.com/simoncodes-ca/lingo-tracker/commit/c87c2390eeab9b91d5f7074390dbfed2619ca79b))
* **core:** respect source status in migration import strategy ([6f91d6e](https://github.com/simoncodes-ca/lingo-tracker/commit/6f91d6e92870b25f61c9b2c4fa477ab9e7b8ca15))

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
