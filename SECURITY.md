# Security policy

## Supported versions

Only the latest 1.x release receives security fixes.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/simoncodes-ca/lingo-tracker/security/advisories/new). Do not open a public issue for a vulnerability.

One maintainer handles reports. The response is best effort. There is no response-time guarantee.

## Security model

The local server (`lingo-tracker-app`) has no authentication. It is built for one developer's machine.

- It binds to `127.0.0.1` by default.
- A Host check allows only `localhost`, IP literals and names in `LINGO_TRACKER_ALLOWED_HOSTS`. This blocks DNS rebinding.
- An Origin check rejects cross-site requests.

If you bind to another interface, anyone who can reach the port has full read and write access to your translation files, folder listings and import uploads. This is documented behavior, not a vulnerability. See [Running the server](docs/api.md#running-the-server).

## Scope

In scope:

- A bypass of the Host or Origin checks.
- Reading or writing files outside the project, other than the documented path inputs in the [API reference](docs/api.md#authentication).
- Writing to a read-only collection.
- Code execution through imported or configured files.

Out of scope:

- Issues that need the server to be exposed beyond loopback on purpose.
- Dependency issues with no exploitable path through LingoTracker.
