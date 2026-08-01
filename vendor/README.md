# Vendored browser libraries

These files are pinned locally so document uploads are not sent to a third-party CDN and releases do not silently change when a CDN asset changes.

| Library | Version | Files | Upstream source |
| --- | --- | --- | --- |
| Mozilla PDF.js (legacy build) | 6.2.108 | `pdfjs/pdf.mjs`, `pdfjs/pdf.worker.mjs` | `pdfjs-dist@6.2.108` |
| pdf-lib | 1.17.1 | `pdf-lib/pdf-lib.min.js` | `pdf-lib@1.17.1` |
| SheetJS Community Edition | 0.20.3 | `sheetjs/xlsx.full.min.js` | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` |

SHA-256 checksums:

```text
842284e0d1d439e60701e3355c2128cd3016ebebf14220e27f512467682aad66  pdfjs/pdf.mjs
b4e582882f5e811f4d1b7b511f68d9a0c3209141e6f68856f01408c5cc155131  pdfjs/pdf.worker.mjs
0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f  pdf-lib/pdf-lib.min.js
cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41  sheetjs/xlsx.full.min.js
```

The applicable license text is stored beside each library.
