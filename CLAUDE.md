# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Personal homepage for Glenn Svendsen (role-neutral: no job title or employer on the home page).
Live at https://glennsvendsen.github.io. Static site, no build step, no dependencies. Auto-deploys to
GitHub Pages on push to `main` (`.github/workflows/deploy.yml`).

Local preview: `python3 -m http.server 8000`

## Files

- `index.html` — the home page: hero (signature + Oslo skyline), about, projects, sketches, hello
- `style.css` — all home page styles
- `main.js` — progressive enhancement only (the page must read fine without it)
- `i18n.js` — Norwegian (Bokmål) strings for the EN/NO switch; English is the HTML itself
- `work/` — **frozen copy of the old PM portfolio** (Arrive case studies, testimonials), linked only
  from the footer as "Earlier work", `noindex`. It has its own `style.css`/`main.js`; don't restyle it.
  The pre-redesign site is also tagged `v1-portfolio`.
- `signature.svg` — Glenn's signature: filled outline (`fill-rule="evenodd"`) + the pen strokes (`#pen`)
- `og-image.png` (1200×630) — regenerate with `python3 assets-src/make_og.py` (reads the signature and
  the skyline, so run it after changing either)
- `favicon.svg` (adapts to dark mode), `apple-touch-icon.png`, `profile.jpg` (keep < ~200 KB)
- `assets-src/` — sources and generators, not used by the page:
  - `signature.jpg` (original scan), `trace_signature.py` (outline + pen strokes from the scan)
  - `make_skyline.py` — generates the hero's Oslo panorama into `index.html` between
    `<!-- LAND -->` markers. Edit the script, not the generated markup.
  - `make_og.py` — renders `og-image.png`

## Design system: "quiet paper"

- Ink on warm paper, one rose accent. Colours are `oklch()` tokens on `:root` using `light-dark()`:
  `--paper --paper-2 --ink --muted --faint --line --accent --shadow`. Components use only these.
- Theme: `color-scheme: light dark`; a saved choice sets `html[data-theme]` (inline head script) and
  JS mirrors the result as `html.is-dark`. The toggle switches with a View Transition ink wipe.
- Type: Instrument Serif (display, headings, link text), Instrument Sans (body), IBM Plex Mono (`.mono`
  for small labels). Body copy 1rem+, labels ≥ ~0.72rem.
- Paper texture is `body::before` (feTurbulence + feDiffuseLighting data URI); a faint light drifts
  with scroll on `body::after`.
- Everything decorative should look hand-drawn: pen strokes with the `#sketch-rough` wobble filter,
  one accent detail per drawing. No glass, neon or 3D.

## Patterns

- **Signature write-on**: `.signature` SVGs hold the outline (`.sig-ink`) and a `<mask>` of pen strokes
  (`.pen path`, `pathLength="1"`). `write()` in main.js times each stroke by length, applies the mask
  while writing and removes it after, so the exact outline shows. Hero plays once per session;
  the footer sign-off plays when scrolled into view. The header wordmark is `<use href="#sig">`.
- **Skyline** (`.land`): layers `layer--sky|far|mid|near` parallax on scroll (scroll-driven
  animations), draw in on first load (`.is-drawing` → `.is-drawn`), and `.life` holds the ferry,
  sailboat, gulls; the City Hall flag is the accent. `.fill` paths are paper silhouettes.
- **Sky**: main.js places sun/moon by the real time in Oslo (`Intl`, `Europe/Oslo`) and a month table of
  sunrise/sunset; aurora on winter nights. Debug on localhost: `?hour=22.5&month=1`.
- **Sketches** (`.sketch`, From the notebook): `.ink` strokes get pathLength="1" + ghost copies from
  main.js and draw with scroll (`view()` timeline; IntersectionObserver fallback). `.is-drawn` starts
  one looping detail per sketch (CSS, by `:nth-child`). Classes: `.thin`, `.accent`, `.notes`, `.trail`.
- **Project cards** (`.card` in `.cards`): container queries, `:has()` dims siblings on hover, pointer
  tilt via `@property --rx/--ry`, and the ink-bleed reveal (`.plate.will-bleed` → `.is-bleeding`,
  `#ink-bleed` filter + growing radial mask).
- `.reveal` and cards rise in with `animation-timeline: view()`; JS fallback adds `.is-visible`.
- Page ↔ `/work/` uses cross-document View Transitions (`@view-transition`), the brand morphs.
- `prefers-reduced-motion`: everything static and fully drawn. Keep that working for anything new.
- **Language (EN/NO)**: text that should translate gets `data-i18n="key"` (swaps innerHTML) or
  `data-i18n-attr="attr:key"`; add the key to `i18n.js`. Strings made in JS go through `tr(key, english)`
  and re-render via `langListeners`. Choice is saved in `localStorage.lang`; first visits follow the
  browser's languages (nb/nn/no → Norwegian). `/work/` stays English only.
- Console: a GS greeting plus a hidden `coffee()` command (tracked as `console-coffee`).

## Adding a side project

Copy an `<li><a class="card">` block in `#projects`; update number, name, description, tag, href,
image (`.cover` for 16:9 art, `.logo` for an app icon) and the `data-umami-event-project` value.
Give the description `data-i18n="card.N"` and add its Norwegian text to `i18n.js`.
