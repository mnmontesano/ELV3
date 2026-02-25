# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**Vertical Terminal** is a zero-build, zero-dependency static HTML/CSS/JS web application for NYC elevator/escalator industry professionals. It queries NYC Open Data (Socrata) APIs directly from the browser. There is no backend, no package manager, no build step, and no database.

### Files

- `index.html` — Main app (very large, ~17k lines; contains all tabs: ELV3, DOB, DATES, PDF)
- `device_search.html` — Standalone device search page
- `styles.css` — All CSS theming (light/dark/system)
- `theme_script.js` — Theme toggle logic
- `dob-lookup.js` — DOB Now device lookup helper
- `device-filter-functions.js` — Device filter/sort utilities

### Running the dev server

Serve the project root with any static HTTP server. For example:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/` in Chrome. The app requires internet access to reach NYC Open Data APIs (`data.cityofnewyork.us`) and CDNs (`unpkg.com`, `cdnjs.cloudflare.com`) for Leaflet, pdf-lib, and SheetJS.

### Lint / Test / Build

There are no lint, test, or build scripts. This is a plain static site with no tooling. Validation is done manually through the browser.

### Gotchas

- `index.html` is extremely large (~1.1 MB, ~17k lines). Avoid reading the entire file; use offset/limit or search tools.
- All external libraries (Leaflet, pdf-lib, SheetJS) are loaded via CDN — no local `node_modules`.
- The app calls public NYC Open Data APIs with no auth token; no secrets are required.
- The `file://` protocol will not work due to `fetch()` calls; a proper HTTP server is required.
