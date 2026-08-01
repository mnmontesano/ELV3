# Security policy

Vertical Terminal is a static browser application. Every committed file and every value placed in its HTML or JavaScript is public to site visitors.

## Secrets

Do not add API keys, passwords, private tokens, service-account files, or private customer/building exports to this repository. Public NYC Open Data requests used by the site do not require a key. If a future integration requires a secret, put that integration behind a server-side endpoint and keep the secret in the hosting provider's encrypted environment settings.

If a secret is committed, revoke or rotate it immediately. Removing it from the latest commit is not sufficient because it remains in Git history.

## Release checks

- Run `node tools/check_nyc_api_contract.mjs` to detect NYC dataset or terminology changes.
- Keep the pinned libraries in `vendor/` current and update their checksums and license files together.
- Publish only over HTTPS.
- Test PDF, spreadsheet, JSON-map import, device lookup, BIN lookup, violations, permits, and CSV export in a clean browser profile.

## Reporting a vulnerability

Please report security problems privately to `michaelnmontesano@gmail.com`. Do not include private building exports, uploaded forms, or credentials in a public issue.
