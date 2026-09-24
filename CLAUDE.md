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

## Patterns

- `.reveal` — fades in on scroll (only hidden when `.js` is on `<html>`).
- `[data-play]` — gets `.is-playing` when scrolled into view; animations key off that.
- `[data-count]` — animates the first number in its text.
- `.scribble` — JS injects the hand-drawn underline; use sparingly (featured case titles, about, contact).
- Case studies: 3 featured `.case` articles, then 3 `.case--compact` inside the `#more-panel`
  toggle. Links to `#case-*` inside the panel auto-open it.
- `prefers-reduced-motion` is respected globally in `style.css`.

## Adding a side project

Copy an `<a class="pi">` block in `#projects`, update number, name, description, tag, href and image.
