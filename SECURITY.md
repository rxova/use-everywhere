# Security Policy

Please report security issues privately.

## How To Report

Use one of the following:

- Email: rxova@proton.me
- [GitHub Security Advisory form](https://github.com/rxova/use-everywhere/security/advisories/new)

If the advisory link is unavailable, use email.

Include:

- affected version
- minimal reproduction
- impact assessment

Public disclosure should happen after a fix is available.

## Scope Notes

The cross-origin window channel (`openWindow` / `connectToOpener`) is a
security surface: reports about origin validation, nonce handling, or message
spoofing are especially welcome. The same-origin engines intentionally trust
all code running on the origin — that is not a vulnerability.
