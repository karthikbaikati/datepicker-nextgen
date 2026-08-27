# Security Policy

## Supported versions

The latest minor release of the current major version receives security fixes.

## Reporting a vulnerability

Please report security issues privately via GitHub's
[private vulnerability reporting](https://github.com/karthikbaikati/datepicker-nextgen/security/advisories/new)
rather than opening a public issue. You should get a first response within 72 hours.

`datepicker-nextgen` has no runtime dependencies and performs no network access, so the
realistic attack surface is limited to how host applications pass untrusted input into
options. Note that `dayMeta` content and `labels` are rendered as text, never as HTML.
