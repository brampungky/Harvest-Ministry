# Fonts

All four families are licensed under the **SIL Open Font License 1.1** (`OFL.txt`), which
permits redistribution inside these templates, including commercially, provided the licence
text ships with them. Do not sell the font files on their own.

| File | Family | Used by | Source |
|---|---|---|---|
| `ebgaramond-var.woff2`, `ebgaramond-italic-var.woff2` | EB Garamond | Liturgical | github.com/googlefonts/EBGaramond |
| `vollkorn-var.woff2` | Vollkorn | Plain | github.com/FontFactory/vollkorn |
| `archivonarrow-var.woff2` | Archivo Narrow | Movement | github.com/Omnibus-Type/ArchivoNarrow |
| `publicsans-var.woff2` | Public Sans | Civic, plus UI labels in every family | github.com/uswds/public-sans |

Variable fonts, Latin subset only, `font-display: swap`. A template loads its own family plus
Public Sans — roughly 70 KB total, self-hosted, with no third-party request at runtime.

Regenerate with `node build/fetch-fonts.mjs`.
