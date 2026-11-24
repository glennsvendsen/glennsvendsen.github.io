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
- `work/` — "Earlier work": the old PM content (six case studies, colleague quotes) re-told in the new
  design. Hand-written `work/index.html` that shares `../style.css` (the "WORK PAGE" block) and
  `../main.js` (null-safe on pages without the hero) and `../i18n.js` (keys `w.*`; the colleagues' quotes stay in English). `noindex`, linked from the footer.
  Quotes are taped index cards (`.note`), cases are `.case` rows with `.case-stats`.
- `work/archive/` — **frozen copy of the original v1 site** (interactive case-study demos) with its own
  old `style.css`/`main.js`; linked from the end of the case list. Don't restyle it. Also tagged `v1-portfolio`.
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
- **Portrait** (`.portrait`): a taped polaroid. The photo "develops" (washed-out, blurred proof → colour via a
  CSS filter transition) when `.is-developed` is added by main.js; a hand-drawn "Hi!" speech bubble pops up after it develops (hover wiggles it). `profile.jpg` is 4:5 (960×1200), < 200 KB.
- **Skyline** (`.land`): layers `layer--sky|back|far|mid|near` (fainter and finer further back; Holmenkollen/Tryvann west, Bygdøy and a near shore with a pine in front, Ekeberg with Sjømannsskolen and Ekebergrestauranten east; the city is shifted by `CITY_DX`; the skyline uses the finer `#sketch-fine` wobble) parallax on scroll (scroll-driven
  animations), draw in on first load (`.is-drawing` → `.is-drawn`), and `.life` holds the ferry,
  sailboat, gulls; the Norwegian flag on City Hall (`.flagpole`, its own mid-layer group so it can wave) is the one place with real colours. `.fill` paths are paper silhouettes.
- **Weather & seasons**: main.js fetches Oslo weather once per visit from Open-Meteo (free, no key, no
  cookies, CC BY 4.0, credited in the footer; cached 30 min in sessionStorage) and sets `data-wx`
  (clear|cloud|fog|rain|snow|storm), `data-clouds` (0–3), `data-intensity`, `data-cover` (none|light|deep,
  from snow depth) and `data-ice` (0–2, from freezing degree-days over 14 days) on `.land`. Snow/ice are
  in the `.cover` groups, falling weather in `.wx-front`; all paused when the skyline is off-screen.
  Debug on localhost: `?wx=snow&snow=0.3&ice=2&temp=-8&clouds=2` (wx: clear|cloud|fog|drizzle|rain|snow|storm).
- **Sky**: main.js places sun/moon by the real time in Oslo (`Intl`, `Europe/Oslo`) and a month table of
  sunrise/sunset; aurora on winter nights; at golden hour (dusk/dawn, not overcast) `.afterglow`, a warm haze behind the skyline, follows the sun (`data-glow`). The City Hall clock hands (`.hand--hour/--min`, `data-pivot`, rotated in `updateSky`) show the same Oslo time.
  Debug on localhost: `?hour=22.5&month=1`.
- **Sketches** (`.sketch`, the Life section): `.ink` strokes get pathLength="1" + ghost copies from
  main.js and draw with scroll (`view()` timeline; IntersectionObserver fallback). `.is-drawn` starts
  one looping detail per sketch (CSS, keyed by `.sketch-card--run|hike|board|bike|camera|music`; paused
  off-screen via `.is-paused`). Classes: `.thin`, `.accent`, `.notes`, `.trail`. The turntable sketch is an
  `<a class="sketch sketch-link">` to the Spotify playlist (mouse shortcut, `tabindex=-1`; the inline link
  in the text is the accessible one); its `.platter` group spins.
- **Project cards** (`.card` in `.cards`): container queries, `:has()` dims siblings on hover, pointer
  tilt via `@property --rx/--ry`, and the ink-bleed reveal (`.plate.will-bleed` → `.is-bleeding`,
  `#ink-bleed` filter + growing radial mask).
- `.reveal` and cards rise in with `animation-timeline: view()`; JS fallback adds `.is-visible`.
- Page ↔ `/work/` uses cross-document View Transitions (`@view-transition`), the brand morphs.
- `prefers-reduced-motion`: everything static and fully drawn. Keep that working for anything new.
- **Language (EN/NO)**: text that should translate gets `data-i18n="key"` (swaps innerHTML) or
  `data-i18n-attr="attr:key"`; add the key to `i18n.js`. Strings made in JS go through `tr(key, english)`
  and re-render via `langListeners`. Choice is saved in `localStorage.lang`; first visits follow the
  browser's languages (nb/nn/no → Norwegian). `/work/` has its own switch and follows the same saved choice (the archive stays English).
- **Night lights & days of the year**: `.lights` windows glow after dark (`data-lights` on|late from
  `updateSky`). `data-day` (17mai | jul | nyttar, from the Oslo date) shows rooftop flags, a Christmas tree on
  Rådhusplassen or fireworks; on snowy days (`data-cover`) a ski jumper leaves Holmenkollen now and then.
  Debug on localhost: `?day=17mai|jul|nyttar`.
- **Fonts** are self-hosted in `fonts/` (woff2, Latin subset; `@font-face` at the top of style.css).
- Console: a GS greeting plus a hidden `coffee()` command (tracked as `console-coffee`).

## Adding a side project

Copy an `<li><a class="card">` block in `#projects`; update number, name, description, tag, href,
image (`.cover` for 16:9 art, `.logo` for an app icon) and the `data-umami-event-project` value.
Give the description `data-i18n="card.N"` and add its Norwegian text to `i18n.js`.
