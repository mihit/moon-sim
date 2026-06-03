# Security Policy

This project is a dependency-free static site. It intentionally avoids npm packages, CDNs, build tools, analytics, and remote assets to reduce supply-chain risk.

## Publishing checklist

- Keep the site dependency-free unless there is a strong reason to add a package.
- If a dependency becomes necessary, pin versions and commit the lockfile.
- Prefer first-party code over third-party scripts for small UI behavior.
- Do not add external script, style, image, font, analytics, or widget URLs without reviewing the CSP in `_headers` and `index.html`.
- Enable GitHub branch protection before publishing: require pull requests, require status checks if workflows are added, and restrict force pushes.
- Enable GitHub two-factor authentication on maintainer accounts.
- Enable GitHub code scanning and secret scanning if the repository owner account supports them.

## Reporting

If you find a security issue, report it privately to the repository owner. Do not open a public issue with exploit details.
