# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arctic Labs is a static portfolio website showcasing personal projects. It's a single-page site with no build process, using pure HTML and CSS with animated aurora effects and a modern glassmorphism design.

**Live site**: https://glennsvendsen.github.io

## Tech Stack

- Pure HTML5 and CSS3 (no JavaScript frameworks or build tools)
- No package manager or dependencies
- Deployed to GitHub Pages via GitHub Actions

## Development

This is a static site with no build process. To develop:

1. **Local development**: Open `index.html` directly in a browser, or use any simple HTTP server:
   ```bash
   python3 -m http.server 8000
   # or
   npx serve .
   ```

2. **Preview changes**: Simply refresh the browser after editing HTML/CSS files

## Deployment

The site auto-deploys to GitHub Pages on every push to the `main` branch via `.github/workflows/deploy.yml`. No manual deployment steps needed.

## Design System & Architecture

### Color Palette (Arctic/Ice Theme)
All colors are defined as CSS custom properties in `:root` (style.css:1-15):
- **Primary**: `--bg-primary` (#050810) - Deep space blue
- **Accents**: `--accent-ice` (#38bdf8), `--accent-aurora-1/2/3` - Blue/green/purple gradient
- **Text**: `--text-primary`, `--text-secondary`, `--text-muted` - White to gray scale

### Key Visual Elements

1. **Aurora Background** (style.css:39-93)
   - Fixed-position animated gradient bands
   - Three overlapping aurora layers with different animation delays
   - Uses hardware acceleration (`transform: translate3d`)
   - `aurora-wave` keyframe animation creates flowing movement

2. **Gradient Text Effects**
   - Applied via `background-clip: text` technique
   - Used for hero title "software" and logo text
   - Animated with `gradient-shift` keyframe (style.css:155-165)
   - **Important**: Logo subtitle uses bulletproof gradient with color fallback (style.css:201-208)

3. **Project Cards** (style.css:248-330)
   - Glassmorphism effect with `backdrop-filter: blur(20px)`
   - Dual-layer gradient borders using `border-box` technique
   - Hover states: lift (`translateY`), scale, glow effects
   - Top glow line appears on hover
   - Arrow icon animates diagonally on hover

4. **Logo SVG** (index.html:47-80)
   - Custom Arctic Labs logo: hexagonal crystal + mountain
   - SVG gradients defined inline with `<defs>`
   - Represents "lab" (hexagon/orbital ring) + "arctic" (crystal mountain)

### File Structure

- `index.html` - Single-page site with semantic HTML5
- `style.css` - All styles (no CSS preprocessor)
- `favicon.svg` - Site icon
- Project logo images: `equity-logo.jpg`, `mybooks-logo.jpg`, `utendorsliv-logo.png`

### Animation Strategy

All animations use `cubic-bezier(0.4, 0, 0.2, 1)` easing for smooth, professional motion:
- Aurora: Continuous wave animation (10s infinite alternate)
- Page load: Staggered fade-up animations with delays (style.css:374-403)
- Hover: Transform-based lift/scale effects (0.4s duration)

## Common Tasks

### Adding a New Project Card

1. Add image to root directory
2. Add `<a class="project-card">` block in the projects section (index.html:96-146)
3. Follow existing structure: glow div, logo img, content div, arrow SVG
4. Update project name, description, and href

### Modifying Colors

Update CSS custom properties in `:root` (style.css:1-15). The entire site uses these variables consistently.

### Adjusting Aurora Effect

Modify `.aurora-band` positions and gradients (style.css:62-81) or animation keyframes (style.css:83-93). Each band has a different animation delay to create layered movement.

### Responsive Design

Mobile breakpoint at 640px (style.css:350-371). Adjusts container padding, hero font sizes, and aurora blur radius for mobile devices.
