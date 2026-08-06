# Eugene Card — Marketplace CSS Package

`index.html` (and the sibling `analytics.html`, `admin-command-center.html`,
`revenue.html`) are self-contained pages: all application logic lives in a
single inline `<script>` block at the bottom of each file, and page layout
comes from Tailwind (loaded via CDN). `assets/css/main.css` supplies exactly
the things Tailwind can't — see below.

## What's in assets/css/

- **core/** — design tokens (`variables.css`) and a minimal reset
  (`reset.css`).
- **layout/** — global page chrome: scrollbar styling, skeleton-loading
  animation.
- **components/** — the actual visual system used across the page:
  - `card.css` — the holographic PREMIUM/STANDARD card shells
    (`.card-holo-premium`, `.foil-sweep`, `.rarity-ribbon`, `.serial-engraved`,
    etc.) used in the catalog, vault, trending row, and auction views.
  - `widget.css` — collector level ring (`.level-ring`), XP/collection
    progress bars (`.progress-track`/`.progress-fill`), market-profile stat
    tiles (`.mp-stat`), and achievement badges (`.badge-chip` + variants).
  - `modal.css`, `button.css`, `table.css`, `navigation.css` — small global
    polish (modal open transition, focus-visible rings, table/nav styling)
    that Tailwind's CDN build doesn't provide out of the box.
- **pages/** — page-specific overrides. Most are intentionally near-empty
  with a comment explaining why (the shared components already cover them).
- **themes/** — reserved for a future light/alt theme; the app currently
  ships dark-only via Tailwind's `darkMode:'class'`.
- **utilities/** — a few small helper classes (`.ec-hidden`,
  `.ec-scrollbar-hide`) and a narrow-viewport padding fix.

Every selector in this package is referenced somewhere in the HTML — use
`main.css` as the single entry point; nothing here is dead scaffolding.

## Note on JS

An earlier version of this package also shipped an `assets/js/` module tree
(`core/router.js`, `modules/cards.js`, etc.). It was never imported by any
page — all real logic already lives inline in each HTML file — so it was
unused dead code and has been removed. If you want to actually modularize
the inline script, that's a real (larger) refactor of `index.html` itself,
not a matter of restoring those stub files.
