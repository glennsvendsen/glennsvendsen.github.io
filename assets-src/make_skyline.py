"""Generate the hero's hand-drawn Oslo panorama and write it into index.html (between the
<!-- LAND --> markers). Hand-authored shapes; only the tree rows are generated along their hills.

Layers (back to front), each a <g class="layer layer--*"> so CSS can parallax them on scroll:
  sky   sun / moon / stars (placed by main.js from the time in Oslo)
  far   Holmenkollåsen: the ridge, the Tryvann tower and the Holmenkollen ski jump
  mid   forested hills, City Hall (Rådhuset), Akershus, the Opera, Munch, the Barcode
  near  the fjord: water, Hovedøya, reflections, and the living bits (ferry, sailboat, gulls)
Paths with class "fill" are paper-coloured silhouettes (no stroke) so nearer layers hide farther
ones. Everything else in .ink is drawn in by CSS. Run from the repo root:
  python3 assets-src/make_skyline.py
"""
import math
import re

W, H = 1200, 260
WATER = 196


def cubic_y(segs, x):
    """y on a chain of cubic segments [(p0, c1, c2, p3), ...] at a given x (by sampling)."""
    best = None
    for p0, c1, c2, p3 in segs:
        for i in range(81):
            t = i / 80
            bx = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * c1[0] + 3 * (1 - t) * t ** 2 * c2[0] + t ** 3 * p3[0]
            by = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * c1[1] + 3 * (1 - t) * t ** 2 * c2[1] + t ** 3 * p3[1]
            if best is None or abs(bx - x) < abs(best[0] - x):
                best = (bx, by)
    return best[1]


def chain(start, *rest):
    """'M x y C ... ' from a start point and (c1, c2, p) triples; also returns the segments."""
    d = f'M{start[0]} {start[1]}'
    segs, p0 = [], start
    for c1, c2, p in rest:
        d += f' C{c1[0]} {c1[1]}, {c2[0]} {c2[1]}, {p[0]} {p[1]}'
        segs.append((p0, c1, c2, p))
        p0 = p
    return d, segs


def spruce(x, base, h):
    """A small spruce as one zigzag outline, h tall, standing on (x, base)."""
    w = h * 0.34
    pts = [(x, base - h)]
    tiers = 4
    for i in range(1, tiers + 1):
        y = base - h + h * i / tiers
        ww = w * i / tiers
        pts += [(x - ww, y), (x - ww * 0.45, y)] if i < tiers else [(x - ww, y)]
    right = [(2 * x - px, py) for px, py in reversed(pts[1:])]
    pts += right
    return 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts) + ' Z'


def trees_along(segs, x0, x1, step, hmin, hmax, seed, dy=3):
    out = []
    x = x0
    k = seed
    while x < x1:
        k = (k * 9301 + 49297) % 233280
        r = k / 233280
        h = hmin + (hmax - hmin) * r
        y = cubic_y(segs, x) + dy + 3 * r
        out.append(spruce(x, y, h))
        x += step * (0.7 + 0.6 * r)
    return ' '.join(out)


def circle(cx, cy, r):
    k = 0.5523 * r
    return (f'M{cx - r} {cy} C{cx - r} {cy - k}, {cx - k} {cy - r}, {cx} {cy - r} '
            f'C{cx + k} {cy - r}, {cx + r} {cy - k}, {cx + r} {cy} '
            f'C{cx + r} {cy + k}, {cx + k} {cy + r}, {cx} {cy + r} '
            f'C{cx - k} {cy + r}, {cx - r} {cy + k}, {cx - r} {cy} Z')


# ── far: Holmenkollåsen ─────────────────────────
far_d, far_segs = chain((0, 128), ((60, 116), (110, 92), (170, 80)), ((220, 70), (270, 64), (330, 70)),
                        ((390, 76), (440, 92), (520, 110)), ((600, 128), (660, 140), (720, 138)),
                        ((800, 136), (860, 118), (940, 112)), ((1020, 106), (1100, 122), (1200, 134)))
ty = cubic_y(far_segs, 230)
hy = cubic_y(far_segs, 470)
far = f'''
        <path class="fill" d="{far_d} L1200 {H} L0 {H} Z"/>
        <path class="thin" d="{far_d}"/>
        <path class="thin" d="M227 {ty:.0f} L228.5 36 M233 {ty:.0f} L231.5 36 M225 40 L235 40 L235 46 L225 46 Z M230 36 L230 16 M228 52 L232 52"/>
        <path d="M478 {hy - 50:.0f} L478 {hy:.0f} M484 {hy - 50:.0f} L484 {hy:.0f} M474 {hy - 54:.0f} L488 {hy - 54:.0f} L488 {hy - 48:.0f} L474 {hy - 48:.0f} Z"/>
        <path d="M478 {hy - 48:.0f} C462 {hy - 38:.0f}, 446 {hy - 22:.0f}, 428 {hy - 8:.0f} M478 {hy - 40:.0f} C464 {hy - 31:.0f}, 450 {hy - 17:.0f}, 434 {hy - 4:.0f}"/>
        <path class="thin" d="M462 {hy - 35:.0f} L462 {hy + 2:.0f} M447 {hy - 22:.0f} L447 {hy + 4:.0f} M428 {hy - 8:.0f} C412 {hy + 2:.0f}, 396 {hy + 10:.0f}, 376 {hy + 16:.0f} M434 {hy - 4:.0f} C420 {hy + 6:.0f}, 404 {hy + 14:.0f}, 384 {hy + 22:.0f}"/>'''

# ── mid: hills with forest, then the city ───────
west_d, west_segs = chain((0, 150), ((70, 138), (160, 130), (250, 140)), ((330, 148), (410, 164), (490, 188)))
east_d, east_segs = chain((1030, WATER), ((1070, 172), (1120, 154), (1200, 148)))
city_fill = ('M468 196 L470 166 L522 160 L530 98 L566 98 L566 150 L588 150 L588 86 L628 86 L628 160 L642 160 '
             'L654 178 L700 170 L708 150 L716 170 L752 172 L760 182 L870 186 L872 196 L930 166 L940 152 L966 152 '
             'L978 166 L1006 196 L1012 124 L1020 104 L1048 104 L1046 140 L1056 140 L1056 132 L1066 132 L1070 196 Z')
mid = f'''
        <path class="fill" d="{west_d} L490 {H} L0 {H} Z"/>
        <path d="{west_d}"/>
        <path class="thin trees" d="{trees_along(west_segs, 8, 462, 8, 13, 26, 7)}"/>
        <path class="thin trees trees--back" d="{trees_along(west_segs, 20, 430, 11, 9, 16, 11, dy=14)}"/>
        <path class="fill" d="{east_d} L1200 {H} L1030 {H} Z"/>
        <path d="{east_d}"/>
        <path class="thin trees" d="{trees_along(east_segs, 1070, 1198, 8, 11, 20, 3)}"/>
        <path class="fill" d="{city_fill}"/>
        <path class="thin" d="M470 196 L470 172 L488 172 L488 166 L506 166 L506 176 L522 176"/>
        <path d="M522 196 L522 160 L530 160 M530 196 L530 98 L566 98 L566 196 M528 98 L568 98 M533 98 L533 92 L563 92 L563 98"/>
        <path class="thin" d="M535 120 L561 120 M535 140 L561 140 M535 160 L561 160 M535 180 L561 180 M541 104 L541 115 M548 104 L548 115 M555 104 L555 115"/>
        <path d="M566 150 L588 150 M588 196 L588 92 L628 92 L628 196 M586 92 L630 92 M592 92 L592 86 L624 86 L624 92 M628 160 L642 160 L642 196"/>
        <path class="thin" d="{circle(608, 106, 7)} M608 106 L608 101.5 M608 106 L611 107.5 M593 124 L623 124 M593 144 L623 144 M593 164 L623 164 M593 184 L623 184 M570 160 L584 160 M570 172 L584 172"/>
        <path class="thin" d="M608 86 L608 70"/>
        <path class="accent flag" d="M608 70 L621 73 L608 77"/>
        <path d="M650 196 L654 178 L700 178 L700 170 L716 170 L716 178 L752 178 L758 196 M698 170 L708 154 L718 170 M708 154 L708 148"/>
        <path class="thin" d="M724 178 L724 172 L740 172 L740 178 M722 172 L732 164 L742 172 M660 186 L664 186 M676 186 L680 186 M690 186 L694 186 M730 186 L734 186"/>
        <path class="thin" d="M760 196 L760 182 L780 182 L780 176 L800 176 L800 186 L826 186 L826 178 L846 178 L846 190 L870 190"/>
        <path d="M872 196 L930 166 L978 166 L1006 196 M940 166 L940 152 L966 152 L966 166"/>
        <path class="thin" d="M898 183 L934 166 M916 196 L950 166 M944 180 L976 180 M944 186 L982 186"/>
        <path d="M1012 196 L1012 124 L1020 104 L1048 104 L1040 124 L1040 196 M1012 124 L1040 124"/>
        <path class="thin" d="M1019 130 L1019 192 M1026 130 L1026 192 M1033 130 L1033 192 M1046 196 L1046 140 L1056 140 L1056 196 M1056 196 L1056 132 L1066 132 L1066 196"/>'''

# ── near: the fjord ─────────────────────────────
near = f'''
        <path class="fill" d="M0 {WATER} L1200 {WATER} L1200 {H} L0 {H} Z"/>
        <path d="M0 196 C200 194, 400 199, 600 196 S1000 194, 1200 197"/>
        <path class="thin" d="M232 197 C262 186, 330 184, 368 197"/>
        <path class="thin trees" d="{spruce(286, 189, 9)} {spruce(298, 188, 11)} {spruce(312, 188, 8)}"/>
        <path class="thin" d="M548 202 C550 206, 546 210, 548 214 M608 202 C610 207, 606 212, 608 218 M953 202 L953 206 M1026 202 C1028 206, 1024 210, 1026 213"/>
        <path class="thin" d="M70 212 L140 212 M220 222 L320 222 M410 210 L460 210 M640 226 L760 226 M820 212 L900 212 M980 222 L1060 222 M110 238 L180 238 M350 244 L430 244 M690 246 L770 246 M1000 240 L1080 240 M520 234 L580 234"/>'''

life = '''
        <g class="ferry"><g transform="translate(0 212)"><path d="M0 0 L46 0 L41 7 L5 7 Z M10 0 L10 -6 L36 -6 L36 0 M14 -3 L16 -3 M20 -3 L22 -3 M26 -3 L28 -3 M26 -6 L26 -11 L31 -11 L31 -6"/></g></g>
        <g transform="translate(790 208)"><g class="sailboat"><path d="M-20 0 C-12 8, 12 8, 22 0 Z M0 0 L0 -30 M0 -28 L16 -4 L0 -4 Z"/></g></g>
        <g class="gulls"><path d="M0 0 C3 -4, 7 -4, 10 0 C13 -4, 17 -4, 20 0" transform="translate(380 56)"/><path d="M0 0 C2 -3, 5 -3, 7 0 C9 -3, 12 -3, 14 0" transform="translate(410 46)"/></g>'''

markup = f'''<!-- LAND -->
    <!-- Hand-drawn Oslo, generated by assets-src/make_skyline.py. The sky follows the time of day in
         Oslo (main.js); the layers parallax on scroll and draw themselves in on load (style.css). -->
    <div class="land" aria-hidden="true">
      <svg class="aurora" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="aurora-a" x1="0" x2="1">
            <stop offset="0" stop-color="oklch(0.82 0.13 160)" stop-opacity="0"/>
            <stop offset="0.35" stop-color="oklch(0.82 0.13 160)"/>
            <stop offset="0.7" stop-color="oklch(0.78 0.1 200)"/>
            <stop offset="1" stop-color="oklch(0.78 0.12 330)" stop-opacity="0"/>
          </linearGradient>
          <filter id="aurora-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
        </defs>
        <g class="layer layer--sky" filter="url(#aurora-blur)" stroke="url(#aurora-a)" fill="none" stroke-linecap="round">
          <path class="ab ab1" d="M140 70 C300 20, 460 96, 640 46 S960 30, 1100 70" stroke-width="26"/>
          <path class="ab ab2" d="M220 96 C380 56, 520 118, 700 74 S980 64, 1080 98" stroke-width="16"/>
          <path class="ab ab3" d="M320 40 C460 10, 600 60, 760 24 S960 20, 1020 44" stroke-width="10"/>
        </g>
      </svg>
      <svg class="fjord" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">
        <g class="layer layer--sky sky">
          <g class="stars">
            <path d="M160 40h6M163 37v6"/><path d="M300 22h4M302 20v4"/><path d="M430 52h5M432.5 49.5v5"/>
            <path d="M520 18h4M522 16v4"/><path d="M690 40h6M693 37v6"/><path d="M820 20h4M822 18v4"/>
            <path d="M930 50h5M932.5 47.5v5"/><path d="M1060 28h6M1063 25v6"/><path d="M250 70h4M252 68v4"/>
            <path d="M610 66h4M612 64v4"/><path d="M1140 64h4M1142 62v4"/><path d="M60 58h4M62 56v4"/>
          </g>
          <g class="sun">
            <circle r="16"/>
            <path class="thin" d="M0 -26v-8M0 26v8M-26 0h-8M26 0h8M-18 -18l-6 -6M18 18l6 6M-18 18l-6 6M18 -18l6 -6"/>
          </g>
          <g class="moon">
            <path d="M8 -15 A16 16 0 1 0 15 7 A12.5 12.5 0 0 1 8 -15 Z"/>
            <path class="thin" d="M-5 -2a1.8 1.8 0 1 0 .1 0M2 8a1.2 1.2 0 1 0 .1 0"/>
          </g>
        </g>
        <g class="layer layer--far ink">{far}
        </g>
        <g class="layer layer--mid ink">{mid}
        </g>
        <g class="layer layer--near ink">{near}
        </g>
        <g class="layer layer--near life">{life}
          <g class="glint"><path d="M-14 0h28M-8 7h16M-4 14h8"/></g>
        </g>
      </svg>
    </div>
    <!-- /LAND -->'''

html = open('index.html').read()
if '<!-- LAND -->' in html:
    html = re.sub(r'<!-- LAND -->.*?<!-- /LAND -->', lambda m: markup, html, flags=re.S)
else:
    start = html.index('    <!-- Hand-drawn fjord.')
    end = html.index('  </section>', start)
    html = html[:start] + '    ' + markup + '\n' + html[end:]
open('index.html', 'w').write(html)
print('skyline written')
