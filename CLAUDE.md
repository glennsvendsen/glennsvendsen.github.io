# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Personal PM portfolio / marketing page for Glenn Svendsen. Live at https://glennsvendsen.github.io.
Static site, no build step, no dependencies. Auto-deploys to GitHub Pages on push to `main`
(`.github/workflows/deploy.yml`).

Local preview: `python3 -m http.server 8000`

## Files

- `index.html` — all content (single page)
- `style.css` — all styles
- `main.js` — progressive enhancement only (the page must read fine without it)
- `og-image.png` (1200×630) — LinkedIn/social preview; regenerate if name/title/tagline changes
- `favicon.svg`, `apple-touch-icon.png`, `profile.jpg` (keep < ~200 KB)

## Design system

- Editorial look: Bebas Neue (display, uppercase-only glyphs, so avoid lowercase units like "s" in
  display numbers; write "sec"), Instrument Sans (body), IBM Plex Mono (labels/data).
- Every section declares a surface: `class="surface-dark|surface-light"` plus `data-surface="dark|light"`.
  Surfaces set `--bg --fg --muted --faint --line --track --accent`; components only use these tokens.
  `data-surface` also drives the nav colour.
- Accent: `--pink` (#FFB0C8) on dark only. On light surfaces text accent is `--pink-ink` (#B4295F)
  for contrast. Pink is fine as a *fill* (bars) on light.
- Minimum text size ~0.7rem for labels; body copy 1rem+.
- Product demo windows (`.app`) stay dark on any surface and have their own token set on `.app`:
  `--app-bg --app-raise --app-fg --app-text --app-muted --app-faint --app-dim --app-line
  --app-line-strong --app-fill --app-fill-strong --app-accent-wash/-soft/-line`. Everything inside
  `.app` uses only these (plus `--pink`/`--black` for accents), never raw rgba values.
- Dark surfaces get a static film grain (`.surface-dark::after`, one noise tile). It needs
  `position: relative`, which `.surface-dark` sets.

## Patterns

- `.reveal` — fades in on scroll (only hidden when `.js` is on `<html>`).
- `[data-play]` — gets `.is-playing` when scrolled into view; animations key off that.
- `[data-count]` — animates the first number in its text.
- `.scribble` — JS injects the hand-drawn underline; use sparingly (featured case titles, about, contact).
- `drawIn(els, opts)` (main.js) — the one dash-offset draw-in for hand-drawn strokes (scribbles,
  sketches, annotations). Reduced motion draws immediately.
- `.annot` — hand-drawn chart annotation: `<span class="annot annot--x" aria-hidden="true">` with an
  inline SVG stroke (wobbled, `--scribble`) and an optional `.annot-note` (crisp mono, `--accent`).
  Anchor it inside the element it marks so it follows the layout. Notes hide below 640px.
- Case studies: 3 featured `.case` articles, then 3 `.case--compact` inside the `#more-panel`
  toggle. Links to `#case-*` inside the panel auto-open it.
- `prefers-reduced-motion` is respected globally in `style.css`.
- Pinned layers (curtain, `.js` only): `.hero` is sticky (About slides over it) and `.finale`
  (testimonials + contact) is sticky underneath until Outside slides off it. Paint order is
  flow sections (z 2) > hero (1) > finale (0); never give the finale a negative z-index (it stops
  being clickable). Rule: **flow beats pinned**. A pinned layer can be in the viewport yet covered,
  so anything asking "what's showing" (nav theme, active link, dwell, `onceVisible`) goes through
  `layerOf`/`topmost`/`shownRatio` in main.js. Anchor links and focus into pinned layers are
  handled in main.js (`#hero`, `#testimonials`, `#contact`); add new pinned anchors to `PINNED`.
  Pin offsets (`--hero-pin`, `--finale-pin`) come from a ResizeObserver so tall layers stay reachable.
- `.case-rail` — fixed progress rail in the left margin while `#work` is on screen (≥1200px, JS only).
  Items link to the featured cases; progress is computed in the nav's rAF scroll handler.
- Hero proof numbers (`.hero-proof dt`) get a split-flap intro (`.flap` cells, JS + motion only).
  Works with any text; spaces and `·` don't flip; screen readers get an sr-only copy.
- Demo windows lean back and settle flat on scroll (CSS `animation-timeline: view()`, flat where
  unsupported) and get a cursor sheen on fine pointers.
- Console: a GS monogram greeting plus a hidden `coffee()` command (tracked as `console-coffee`).
- `.sketch` (Outside work) — inline SVG notebook line art. Strokes in `.ink` get the `#sketch-rough`
  wobble filter, a faint offset "ghost" copy and a draw-in on view (main.js). Use `.thin`, `.accent`
  (one pink detail per sketch), `.notes` for leader lines + mono annotations; keep text unfiltered.

## Adding a side project

Copy an `<a class="pi">` block in `#projects`, update number, name, description, tag, href and image.
