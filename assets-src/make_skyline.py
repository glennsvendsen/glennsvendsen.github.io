"""Generate the hero's hand-drawn Oslo panorama and write it into index.html (between the
<!-- LAND --> markers). Edit this script, not the generated markup. Run from the repo root:

  python3 assets-src/make_skyline.py

Coordinates: viewBox 1200x260, the water line at y=196. main.js places the sun/moon on arcs above it.

Layers, back to front. Each is a <g class="layer layer--*"> so CSS can parallax it on scroll:
  sky   sun / moon / stars (placed by main.js from the real sun and moon over Oslo, see astro.js), clouds
  back  the hills far inland (Grefsenkollen with its mast), faint, for depth
  far   Holmenkollåsen in the west: the ridge, the Tryvann tower and the Holmenkollen ski jump
  mid   the west hills; the city: City Hall (Rådhuset), Akershus, Oslo Plaza, the Opera, Munch, the
        Barcode; and Ekebergåsen in the east with Ekebergrestauranten and Sjømannsskolen
  near  the fjord: water lines that open up towards the viewer, Hovedøya, a skerry with a sea mark,
        reflections, and the living bits (ferry, sailboat, gulls)
Depth comes from atmosphere (each layer further back is fainter and thinner, see style.css) and
from scale (water lines, the skerry).

Rules that other code relies on:
  - `ink` groups stay flat (paths only, no nested <g>): make_og.py parses them with a regex, and
    main.js / style.css draw in every `.ink path` that isn't `.fill`.
  - Snow and ice live in sibling groups with the same layer class but `cover` instead of `ink`
    (e.g. <g class="layer layer--far cover">), so they move with what they sit on and stay out of
    the OG image and the draw-in. main.js shows them from the weather (data-cover / data-ice).
  - Falling weather (rain, snow, fog, lightning) is in `.wx-front`, outside any filtered group.
  - Clock hands carry data-pivot; main.js sets transform="translate(pivot) rotate(deg)".
"""
import math
import re

W, H = 1200, 260
WATER = 196


# ── helpers ─────────────────────────────────────
def rng(seed):
    k = seed
    while True:
        k = (k * 9301 + 49297) % 233280
        yield k / 233280


def chain(start, *rest):
    """'M x y C ...' from a start point and (c1, c2, p) triples; also returns the segments."""
    d = f'M{start[0]} {start[1]}'
    segs, p0 = [], start
    for c1, c2, p in rest:
        d += f' C{c1[0]} {c1[1]}, {c2[0]} {c2[1]}, {p[0]} {p[1]}'
        segs.append((p0, c1, c2, p))
        p0 = p
    return d, segs


def bez(p0, c1, c2, p3, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p3[1])


def samples(segs, n=60):
    pts = []
    for s in segs:
        pts += [bez(*s, i / n) for i in range(n + 1)]
    return sorted(pts)


def y_at(segs, x):
    pts = samples(segs)
    return min(pts, key=lambda p: abs(p[0] - x))[1]


def poly(pts, close=False):
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + (' Z' if close else '')


def circle(cx, cy, r):
    k = 0.5523 * r
    return (f'M{cx - r} {cy} C{cx - r} {cy - k}, {cx - k} {cy - r}, {cx} {cy - r} '
            f'C{cx + k} {cy - r}, {cx + r} {cy - k}, {cx + r} {cy} '
            f'C{cx + r} {cy + k}, {cx + k} {cy + r}, {cx} {cy + r} '
            f'C{cx - k} {cy + r}, {cx - r} {cy + k}, {cx - r} {cy} Z')


def snow_band(line_pts, depth, seed, step=5):
    """A lumpy band of snow lying on a line (list of (x, y), left to right): the top edge rides
    `depth` above the line with a little wobble, the bottom edge is the line itself."""
    r = rng(seed)
    xs = [line_pts[0][0]]
    while xs[-1] < line_pts[-1][0]:
        xs.append(min(xs[-1] + step, line_pts[-1][0]))

    def y_on(x):
        for (x0, y0), (x1, y1) in zip(line_pts, line_pts[1:]):
            if x0 <= x <= x1:
                return y0 + (y1 - y0) * ((x - x0) / (x1 - x0) if x1 != x0 else 0)
        return line_pts[-1][1]
    top = [(x, y_on(x) - depth * (0.65 + 0.55 * next(r))) for x in xs]
    bottom = [(x, y_on(x) + 0.6) for x in reversed(xs)]
    return poly(top + bottom, close=True)


def spruce(x, base, h, r):
    """A spruce with drooping tiers, as one closed outline (filled with paper so trees overlap).
    Returns (outline, snow_light, snow_deep): snow caps for the top, and for every tier."""
    w = h * (0.3 + 0.08 * next(r))
    tiers = 5
    top = (x, base - h)
    left, caps = [top], []
    prev = top
    for i in range(1, tiers + 1):
        y = base - h + h * 0.88 * i / tiers
        ww = w * (0.35 + 0.65 * i / tiers) * (0.9 + 0.2 * next(r))
        tip = (x - ww, y + h * 0.035)
        inner = (x - ww * 0.32, y - h * 0.045) if i < tiers else (x - 1.1, base - h * 0.1)
        left += [tip, inner]
        caps.append((prev, tip))
        prev = inner
    right = [(2 * x - px, py) for px, py in reversed(left[1:])]
    outline = poly(left + right, close=True)
    trunk = f'M{x - 1.1} {base - h * 0.1:.1f} L{x - 1.1} {base} M{x + 1.1} {base - h * 0.1:.1f} L{x + 1.1} {base}'
    # snow: the top cap (light cover) and a sliver along every branch (deep cover)
    t1 = left[1]
    light = poly([(x, top[1] - 0.6), (t1[0] + 0.6, t1[1] - 0.8), (x, t1[1] - 1.6),
                  (2 * x - t1[0] - 0.6, t1[1] - 0.8)], close=True)
    deep = []
    for (a, b) in caps[1:]:
        for sgn in (1, -1):
            ax, bx = (a[0], b[0]) if sgn == 1 else (2 * x - a[0], 2 * x - b[0])
            deep.append(poly([(ax, a[1] - 0.3), (bx, b[1] - 0.5), (bx + sgn * 1.2, b[1] + 0.4),
                              (ax, a[1] + 1.4)], close=True))
    return outline, trunk, light, ' '.join(deep)


def forest(segs, x0, x1, step, hmin, hmax, seed, dy=2):
    r = rng(seed)
    outs, trunks, light, deep = [], [], [], []
    x = x0
    while x < x1:
        h = hmin + (hmax - hmin) * next(r)
        base = y_at(segs, x) + dy + 3 * next(r)
        o, t, l, d = spruce(x, base, h, r)
        outs.append(o); trunks.append(t); light.append(l); deep.append(d)
        x += step * (0.65 + 0.7 * next(r))
    return ' '.join(outs), ' '.join(trunks), ' '.join(light), ' '.join(deep)


def lumps(x0, y0, w, h, seed, n=5):
    """A lumpy crown sitting on the line y0 from x0 to x0+w (bumps on top, flat-ish bottom)."""
    r = rng(seed)
    d = f'M{x0:.1f} {y0:.1f}'
    step = w / n
    for i in range(n):
        a, b = x0 + i * step, x0 + (i + 1) * step
        top = y0 - h * (0.55 + 0.45 * math.sin(math.pi * (i + 0.5) / n)) * (0.85 + 0.3 * next(r))
        d += f' C{a:.1f} {top:.1f}, {b:.1f} {top:.1f}, {b:.1f} {y0 - h * 0.25 * next(r):.1f}'
    return d + f' C{x0 + w * 0.7:.1f} {y0 + h * 0.18:.1f}, {x0 + w * 0.3:.1f} {y0 + h * 0.18:.1f}, {x0:.1f} {y0:.1f} Z'


def grove(segs, x0, x1, step, hmin, hmax, seed, dy=2):
    """Round leafy trees (Bygdøy is mostly oak, lime and birch), overlapping, with a trunk each."""
    r = rng(seed)
    crowns, trunks = [], []
    x = x0
    while x < x1:
        h = hmin + (hmax - hmin) * next(r)
        base = y_at(segs, x) + dy + 2 * next(r)
        w = h * (0.8 + 0.4 * next(r))
        crowns.append(lumps(x - w / 2, base - h * 0.35, w, h * 0.65, int(next(r) * 1000), n=3))
        trunks.append(f'M{x:.1f} {base - h * 0.3:.1f} L{x:.1f} {base:.1f}')
        x += step * (0.6 + 0.6 * next(r))
    return ' '.join(crowns), ' '.join(trunks)


PAIR = re.compile(r'(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)')


def shift_d(d, dx):
    """Move absolute path data (or an 'x y' pair) dx to the right."""
    return PAIR.sub(lambda m: f'{float(m.group(1)) + dx:g} {m.group(2)}', d)


def shift_tags(markup, dx):
    """Move every <path> in a chunk of markup: its d, or for clock hands only their pivot."""
    def one(m):
        tag = m.group(0)
        if 'data-pivot' in tag:
            return re.sub(r'data-pivot="([^"]+)"', lambda p: f'data-pivot="{shift_d(p.group(1), dx)}"', tag)
        return re.sub(r' d="([^"]+)"', lambda p: f' d="{shift_d(p.group(1), dx)}"', tag)
    return re.sub(r'<path[^>]*>', one, markup)


def figure(x, y, lean=0):
    """A tiny walker (on the Opera roof)."""
    return (f'M{x} {y} L{x + 0.9 + lean} {y - 3.2} L{x + 1.8} {y} M{x + 0.9 + lean} {y - 3.2} '
            f'L{x + 0.9 + lean} {y - 6} M{x + 0.9 + lean} {y - 7.2} L{x + 0.9 + lean} {y - 7.3}')


# ── FAR: Holmenkollåsen ─────────────────────────
far_d, far_segs = chain((0, 128), ((60, 116), (110, 92), (170, 80)), ((220, 70), (270, 64), (330, 70)),
                        ((390, 76), (440, 92), (520, 110)), ((600, 128), (660, 140), (720, 138)),
                        ((800, 136), (860, 118), (940, 112)), ((1020, 106), (1100, 122), (1200, 134)))
# Seen from the fjord, Holmenkollen and Tryvann lie north-west of City Hall, almost one behind the
# other: the ski jump on the slope facing the city (tower left, inrun running down to the right), and
# the Tryvann tower on the summit a little to the right of it and further back, so it stands higher.
vx = 336                                    # Tryvann tower, on the ridge top
vy = y_at(far_segs, vx)
hx = 230                                    # Holmenkollen: the jump tower's foot, on the slope face
hy = y_at(far_segs, hx) + 24
tx = 296                                    # take-off, further down the slope
tyo = y_at(far_segs, tx) + 40
lx, ly = 372, y_at(far_segs, 372) + 70      # bottom of the landing hill
hatch = []
r = rng(5)
for x in range(14, 1190, 13):
    y = y_at(far_segs, x)
    if 218 < x < 312 or 326 < x < 348:
        continue
    l = 4 + 5 * next(r)
    hatch.append(f'M{x} {y + 5:.1f} L{x - l * 0.55:.1f} {y + 5 + l:.1f}')
inrun_top = f'M{hx + 5} {hy - 56:.1f} C{hx + 18} {hy - 40:.1f}, {tx - 24} {tyo - 22:.1f}, {tx} {tyo - 6:.1f}'
inrun_bot = f'M{hx + 5} {hy - 49:.1f} C{hx + 16} {hy - 34:.1f}, {tx - 26} {tyo - 15:.1f}, {tx - 2} {tyo:.1f}'
landing = f'M{tx + 2} {tyo + 2:.1f} C{tx + 22} {tyo + 14:.1f}, {lx - 36} {ly - 14:.1f}, {lx} {ly:.1f} L{lx + 34} {ly + 3:.1f}'
landing2 = f'M{tx - 4} {tyo + 5:.1f} C{tx + 16} {tyo + 19:.1f}, {lx - 40} {ly - 8:.1f}, {lx - 4} {ly + 6:.1f} L{lx + 34} {ly + 9:.1f}'
supports = ' '.join(f'M{x:.1f} {y0:.1f} L{x:.1f} {y1:.1f}' for x, y0, y1 in (
    (hx + 16, hy - 40, hy + 2), (hx + 29, hy - 29, hy + 8), (hx + 42, hy - 20, hy + 14), (hx + 54, hy - 12, hy + 20)))
far = f"""
        <path class="fill" d="{far_d} L1200 {H} L0 {H} Z"/>
        <path class="ridge-far" d="{far_d}"/>
        <path class="thin hatch" d="{' '.join(hatch)}"/>
        <path class="fill" d="M{vx - 5} {vy:.1f} L{vx - 3.6} 36 L{vx + 3.6} 36 L{vx + 5} {vy:.1f} Z"/>
        <path d="M{vx - 5} {vy:.1f} L{vx - 3.6} 36 M{vx + 5} {vy:.1f} L{vx + 3.6} 36 M{vx - 7} 36 L{vx + 7} 36 L{vx + 7} 30 L{vx - 7} 30 Z M{vx - 5} 30 L{vx - 4} 24 L{vx + 4} 24 L{vx + 5} 30 M{vx} 24 L{vx} 6"/>
        <path class="thin" d="M{vx - 2.6} 44 L{vx + 2.6} 44 M{vx - 2.8} 52 L{vx + 2.8} 52 M{vx - 3} 60 L{vx + 3} 60 M{vx} 12 L{vx + 2.5} 12 M{vx} 17 L{vx - 2.5} 17 M{vx - 4} 33 L{vx + 4} 33"/>
        <path class="fill" d="M{hx - 1} {hy:.1f} L{hx - 1} {hy - 58:.1f} L{hx + 8} {hy - 58:.1f} L{hx + 8} {hy:.1f} Z"/>
        <path d="M{hx - 1} {hy:.1f} L{hx - 1} {hy - 58:.1f} M{hx + 8} {hy:.1f} L{hx + 8} {hy - 58:.1f} M{hx - 4} {hy - 58:.1f} L{hx + 11} {hy - 58:.1f} L{hx + 11} {hy - 64:.1f} L{hx - 4} {hy - 64:.1f} Z M{hx + 3.5} {hy - 64:.1f} L{hx + 3.5} {hy - 70:.1f}"/>
        <path class="fill" d="{inrun_top} L{tx - 2} {tyo:.1f} C{tx - 26} {tyo - 15:.1f}, {hx + 16} {hy - 34:.1f}, {hx + 5} {hy - 49:.1f} Z"/>
        <path d="{inrun_top} {inrun_bot} M{tx} {tyo - 6:.1f} L{tx + 3} {tyo - 4:.1f}"/>
        <path class="thin" d="{supports} M{hx + 16} {hy - 26:.1f} L{hx + 29} {hy - 12:.1f} M{hx + 29} {hy - 16:.1f} L{hx + 42} {hy - 4:.1f} M{hx + 8} {hy:.1f} L{tx - 2} {tyo + 3:.1f}"/>
        <path class="thin" d="{landing} {landing2}"/>
        <path class="thin" d="M{lx + 38} {ly - 2:.1f} L{lx + 58} {ly - 3:.1f} L{lx + 58} {ly + 6:.1f} L{lx + 38} {ly + 8:.1f} Z"/>"""
far_pts = samples(far_segs, 40)
# Snow along the ridge, leaving gaps where the Tryvann tower and the jump tower break the skyline.
far_runs = [[p for p in far_pts if a <= p[0] <= b] for a, b in ((0, 224), (242, 327), (345, 1200))]
far_cover = f"""
        <path class="snow snow-light" d="{' '.join(snow_band(run, 3.2, 3 + i, step=6) for i, run in enumerate(far_runs))}"/>
        <path class="snow snow-deep" d="{' '.join(snow_band(run, 6, 6 + i, step=5) for i, run in enumerate(far_runs))}"/>
        <path class="snow snow-light" d="{inrun_top} L{tx} {tyo - 8:.1f} C{tx - 24} {tyo - 24:.1f}, {hx + 18} {hy - 42.5:.1f}, {hx + 5} {hy - 58:.1f} Z {landing} L{lx + 34} {ly + 9:.1f} L{lx - 4} {ly + 6:.1f} C{lx - 40} {ly - 8:.1f}, {tx + 16} {tyo + 19:.1f}, {tx - 4} {tyo + 5:.1f} Z"/>"""

# ── BACK: the hills far inland, seen between Holmenkollåsen and Ekeberg ──
back_d, back_segs = chain((380, 112), ((470, 100), (560, 96), (640, 102)), ((720, 108), (790, 94), (860, 90)),
                          ((920, 87), (990, 98), (1060, 106)),
                          ((1110, 112), (1160, 126), (1240, 134)))   # runs on behind Ekeberg, so it never just stops
gx = 868                                     # Grefsenkollen's mast
gy = y_at(back_segs, gx)
back = f'''
        <path class="fill" d="{back_d} L1240 {H} L380 {H} Z"/>
        <path d="{back_d}"/>
        <path class="thin" d="M{gx} {gy:.1f} L{gx} {gy - 14:.1f} M{gx - 2} {gy - 4:.1f} L{gx + 2} {gy - 4:.1f}"/>'''
back_cover = f'''
        <path class="snow snow-deep" d="{snow_band(samples(back_segs, 30), 3, 51, step=7)}"/>'''

# ── MID: hills, forest, the city ───────────────
west_d, west_segs = chain((0, 150), ((70, 138), (160, 130), (250, 140)), ((330, 148), (410, 164), (490, 188)))
# Bygdøy: a low, leafy peninsula in front of the west hills, with the Fram museum's A-roof at the water.
byg_d, byg_segs = chain((0, 170), ((50, 160), (120, 158), (190, 166)), ((240, 172), (290, 186), (338, WATER)))
byg_trees = grove(byg_segs, 4, 240, 13, 18, 28, 61, dy=4)
byg_trees2 = grove(byg_segs, 10, 310, 14, 13, 20, 67, dy=15)
fram = 'M246 196 L262 178 L278 196 M252 196 L262 185 L272 196 M282 196 L282 188 L300 188 L300 196 M226 196 L226 192 L246 192'
# Tjuvholmen: the Astrup Fearnley museum's sloping sail roof, then the blocks of Aker Brygge.
tjuv = ('M384 196 L384 186 C404 180, 428 172, 456 166 L458 170 L458 196 M392 196 L392 184 M404 196 L404 180 M418 196 L418 176 '
        'M432 196 L432 172 M446 196 L446 169')
aker = 'M458 196 L458 178 L470 178 L470 174 L486 174 L486 196'
tjuv_fill = 'M384 196 L384 186 C404 180, 428 172, 456 166 L458 170 L458 196 Z M458 196 L458 178 L470 178 L470 174 L486 174 L486 196 Z'
TJ = -54                                     # Tjuvholmen moves with the city (see CITY_DX)
tjuv, aker, tjuv_fill = shift_d(tjuv, TJ), shift_d(aker, TJ), shift_d(tjuv_fill, TJ)
# Ekebergåsen rises steeply behind Bjørvika: Ekebergrestauranten (white, functionalist, ribbon
# windows, half dug into the slope) and, higher up and further south, Sjømannsskolen (long brick
# wings and a central tower).
east_d, east_segs = chain((956, WATER), ((990, 180), (1030, 158), (1070, 144)), ((1110, 132), (1146, 114), (1200, 108)))
rx0, rx1 = 1084, 1116                         # Ekebergrestauranten
ry = y_at(east_segs, rx0) + 1                 # its lower (west) end
sx0, sx1 = 1134, 1190                         # Sjømannsskolen
sy = y_at(east_segs, sx0 + 12) + 2
sc = (sx0 + sx1) / 2 - 2                      # the tower
wf = forest(west_segs, 6, 466, 7, 14, 27, 7)
wf2 = forest(west_segs, 14, 440, 10, 10, 18, 11, dy=15)
ef_a = forest(east_segs, 1120, 1200, 8, 9, 14, 3, dy=18)          # the wooded slope below Sjømannsskolen
ef_b = forest(east_segs, 1060, 1081, 6, 8, 12, 13, dy=6)          # below the restaurant's west end
ef_c = forest(east_segs, 1192, 1200, 5, 8, 12, 23, dy=2)
ef = tuple(' '.join(p) for p in zip(ef_a, ef_b, ef_c))
ef2 = forest(east_segs, 1090, 1200, 12, 9, 15, 31, dy=40)          # lower down, towards Bjørvika
# Sjømannsskolen (Kongshavn videregående) has four towers; seen from the fjord only two show, the near
# one slightly taller. Brick wings run between and beyond them.
sj_towers = ((sx0 + 17, 5.5, 41), (sx1 - 13, 5, 37))     # (centre x, half width, height above sy)
sj_fill = f'M{sx0} {sy:.1f} L{sx0} {sy - 14:.1f}'
sj_ink = f'M{sx0} {sy:.1f} L{sx0} {sy - 12:.1f} L{sx0 + 3} {sy - 15:.1f}'
sj_thin = ''
cur = sx0 + 3
for tx, hw, th in sj_towers:
    sj_fill += f' L{tx - hw} {sy - 14:.1f} L{tx - hw} {sy - th + 11:.1f} L{tx} {sy - th:.1f} L{tx + hw} {sy - th + 11:.1f} L{tx + hw} {sy - 14:.1f}'
    sj_ink += f' L{tx - hw} {sy - 15:.1f} M{tx - hw} {sy - 13:.1f} L{tx - hw} {sy - th + 12:.1f} L{tx + hw} {sy - th + 12:.1f} L{tx + hw} {sy - 13:.1f} M{tx - hw - 1} {sy - th + 12:.1f} L{tx} {sy - th + 1:.1f} L{tx + hw + 1} {sy - th + 12:.1f} M{tx + hw} {sy - 15:.1f}'
    sj_thin += f' M{tx - 2.5} {sy - th + 18:.1f} L{tx + 2.5} {sy - th + 18:.1f} L{tx + 2.5} {sy - th + 24:.1f} L{tx - 2.5} {sy - th + 24:.1f} Z M{tx - 2.5} {sy - th + 30:.1f} L{tx + 2.5} {sy - th + 30:.1f}'
sj_fill += f' L{sx1} {sy - 14:.1f} L{sx1} {sy + 2:.1f} Z'
sj_ink += f' L{sx1 - 3} {sy - 15:.1f} L{sx1} {sy - 12:.1f} L{sx1} {sy + 2:.1f}'
sj_wins = [x for x in range(sx0 + 4, sx1 - 2, 4) if all(abs(x - tx) > hw + 2 for tx, hw, _ in sj_towers)]
sj_thin += ' ' + ' '.join(f'M{x} {sy - 10:.1f} L{x} {sy - 7:.1f} M{x} {sy - 5:.1f} L{x} {sy - 2:.1f}' for x in sj_wins)
ekeberg = f'''
        <path class="fill" d="M{rx0} {ry:.1f} L{rx0} {ry - 12:.1f} C{rx0} {ry - 15:.1f}, {rx0 + 2} {ry - 16:.1f}, {rx0 + 5} {ry - 16:.1f} L{rx1} {ry - 16:.1f} L{rx1} {ry - 8:.1f} Z"/>
        <path d="M{rx0} {ry:.1f} L{rx0} {ry - 12:.1f} C{rx0} {ry - 15:.1f}, {rx0 + 2} {ry - 16:.1f}, {rx0 + 5} {ry - 16:.1f} L{rx1} {ry - 16:.1f} L{rx1} {ry - 9:.1f} M{rx0 - 3} {ry:.1f} L{rx0 + 14} {ry - 2:.1f}"/>
        <path class="thin" d="M{rx0 + 2} {ry - 11:.1f} L{rx1 - 1} {ry - 11:.1f} M{rx0 + 2} {ry - 6:.1f} L{rx0 + 22} {ry - 6:.1f} M{rx0 + 3} {ry - 18:.1f} L{rx1 - 4} {ry - 18:.1f} M{rx0 + 3} {ry - 16:.1f} L{rx0 + 3} {ry - 18:.1f} M{rx1 - 4} {ry - 16:.1f} L{rx1 - 4} {ry - 18:.1f}"/>
        <path class="fill" d="{sj_fill}"/>
        <path d="{sj_ink}"/>
        <path class="thin" d="{sj_thin}"/>'''

# City Hall: west tower 530–566 (top 98), east tower 588–628 (top 88, clock at 608,106)
ch = '''M522 196 L522 160 L530 160 M530 196 L530 98 L566 98 L566 196 M528 98 L568 98 M533 98 L533 92 L563 92 L563 98
           M566 150 L588 150 M588 196 L588 92 L628 92 L628 196 M586 92 L630 92 M592 92 L592 86 L624 86 L624 92 M628 160 L642 160 L642 196'''
ch_thin = ('M535 112 L561 112 M535 128 L561 128 M535 144 L561 144 M535 160 L561 160 M535 176 L561 176 '
           + ' '.join(f'M{x} {y} L{x} {y + 9}' for x in (539, 545.5, 552, 558.5) for y in (101, 115, 131, 147, 163, 179))
           + ' M593 122 L623 122 M593 138 L623 138 M593 154 L623 154 M593 170 L623 170 M593 186 L623 186 '
           + ' '.join(f'M{x} {y} L{x} {y + 9}' for x in (597, 603, 613, 619) for y in (125, 141, 157, 173))
           + ' M570 156 L570 190 M577 156 L577 190 M584 156 L584 190 M524 166 L528 166 M524 176 L528 176 M632 166 L640 166 M632 176 L640 176')
clock = (f'{circle(608, 106, 7)} M608 99.6 L608 100.9 M614.4 106 L613.1 106 M608 112.4 L608 111.1 M601.6 106 L602.9 106')

city_fill = ('M468 196 L470 166 L522 160 L530 98 L566 98 L566 150 L588 150 L588 86 L628 86 L628 160 L642 160 '
             'L650 196 L654 183 L664 172 L684 172 L684 150 L690 136 L694 120 L702 136 L708 140 L716 130 L721 108 '
             'L730 130 L734 150 L742 172 L762 182 L780 178 L800 176 L842 100 L860 100 L862 186 L872 196 '
             'L930 166 L940 152 L966 152 L978 166 L1006 196 L1012 124 L1020 104 L1048 104 L1046 140 L1050 136 '
             'L1060 122 L1072 132 L1084 146 L1086 196 Z')
mid = f'''
        <path class="fill" d="{west_d} L490 {H} L0 {H} Z"/>
        <path d="{west_d}"/>
        <path class="trees" d="{wf[0]}"/>
        <path class="thin trees-trunk" d="{wf[1]}"/>
        <path class="trees trees--near" d="{wf2[0]}"/>
        <path class="fill" d="{byg_d} L338 {H} L0 {H} Z"/>
        <path d="{byg_d}"/>
        <path class="trees" d="{byg_trees[0]}"/>
        <path class="thin trees-trunk" d="{byg_trees[1]}"/>
        <path class="trees trees--near" d="{byg_trees2[0]}"/>
        <path class="fill" d="{fram} L300 196 Z {tjuv_fill}"/>
        <path d="{fram}"/>
        <path d="{tjuv}"/>
        <path class="thin" d="{aker} {shift_d('M462 184 L468 184 M462 190 L468 190 M474 180 L482 180 M474 186 L482 186 M474 192 L482 192', TJ)}"/>
        <path class="fill" d="{east_d} L1200 {H} L962 {H} Z"/>
        <path d="{east_d}"/>
        <path class="thin hatch" d="{' '.join(f'M{x} {y_at(east_segs, x) + 5:.1f} L{x + 4} {y_at(east_segs, x) + 11:.1f}' for x in range(980, 1080, 11))}"/>{ekeberg}
        <path class="trees" d="{ef[0]}"/>
        <path class="trees trees--near" d="{ef2[0]}"/>
        <path class="fill" d="{city_fill}"/>
        <path class="thin" d="M470 196 L470 170 L486 170 L486 164 L506 164 L506 174 L522 174 M474 176 L482 176 M474 184 L482 184 M490 170 L502 170 M490 178 L502 178 M490 186 L502 186 M510 180 L518 180 M510 188 L518 188"/>
        <path d="{ch}"/>
        <path class="thin" d="{ch_thin}"/>
        <path class="thin" d="{clock}"/>
        <path class="hand hand--hour" data-pivot="608 106" d="M0 0 L0 -3.8"/>
        <path class="hand hand--min" data-pivot="608 106" d="M0 0 L0 -5.6"/>
        <path class="thin" d="M608 86 L608 70"/>
        <path d="M650 196 C652 188, 658 184, 664 183 L742 183 C752 185, 758 190, 762 196 M664 183 L664 172 L742 172 L742 183"/>
        <path class="thin" d="M664 172 L664 169 L668 169 L668 172 M674 172 L674 169 L678 169 L678 172 M736 172 L736 169 L740 169 L740 172 M656 190 C664 188, 672 190, 680 188 M720 189 C730 187, 740 190, 752 188"/>
        <path d="M684 172 L684 150 L732 150 L732 172 M682 150 L708 140 L734 150 M690 150 L690 136 L686 136 L694 120 L702 136 L698 136 L698 150 M716 150 L716 130 L712 130 L721 108 L730 130 L726 130 L726 150 M721 108 L721 102"/>
        <path class="thin" d="M694 120 L694 116 M690 158 L690 164 M698 158 L698 164 M706 158 L706 164 M714 158 L714 164 M722 158 L722 164 M719 136 L723 136 M719 142 L723 142"/>
        <path class="thin" d="M762 196 L762 182 L780 182 L780 176 L800 176 L800 186 L822 186 L822 180 L840 180 M766 188 L776 188 M784 182 L796 182 M804 190 L818 190"/>
        <path d="M842 196 L842 100 L860 100 L860 196 M840 100 L862 100"/>
        <path class="thin" d="M846 104 L846 192 M851 104 L851 192 M856 104 L856 192 M842 120 L860 120 M842 140 L860 140 M842 160 L860 160 M842 180 L860 180 M862 196 L862 186 L870 186"/>
        <path d="M872 196 L930 166 L978 166 L1006 196 M940 166 L940 152 L966 152 L966 166"/>
        <path class="thin" d="M898 183 L934 166 M916 196 L950 166 M944 180 L976 180 M944 186 L982 186 M944 174 L974 174 M946 152 L946 166 M952 152 L952 166 M958 152 L958 166 M988 182 L996 192"/>
        <path class="thin people" d="{figure(902, 182.6)} {figure(911, 178.2, 0.3)} {figure(950, 166)}"/>
        <path d="M1012 196 L1012 124 L1020 104 L1048 104 L1040 124 L1040 196 M1012 124 L1040 124"/>
        <path class="thin" d="M1017 130 L1017 192 M1022 130 L1022 192 M1027 130 L1027 192 M1032 130 L1032 192 M1036 130 L1036 192 M1024 108 L1042 108"/>
        <path d="M1046 196 L1046 140 L1054 140 L1054 196 M1056 196 L1056 122 L1066 122 L1066 196 M1068 196 L1068 132 L1078 132 L1078 196"/>
        <path class="thin" d="M1048 148 L1052 148 M1048 158 L1052 158 M1048 168 L1052 168 M1048 178 L1052 178 M1058 130 L1064 130 M1058 142 L1064 142 M1058 154 L1064 154 M1058 166 L1064 166 M1058 178 L1064 178 M1070 140 L1076 140 M1070 152 L1076 152 M1070 164 L1076 164 M1070 176 L1076 176"/>'''

# The city sits a little left of where it was drawn, so the panorama balances between Holmenkollen
# and Ekeberg (everything from City Hall to the Barcode moves together, clock pivots included).
CITY_DX = -40
_cut = mid.index('<path class="fill" d="M468')
mid = mid[:_cut] + shift_tags(mid[_cut:], CITY_DX)
roofs_light = ' '.join(snow_band(p, d, s, step=3) for p, d, s in [
    ([(528, 98), (568, 98)], 2.2, 21), ([(533, 92), (563, 92)], 1.8, 22), ([(586, 92), (630, 92)], 2.2, 23),
    ([(592, 86), (624, 86)], 1.8, 24), ([(566, 150), (588, 150)], 2.4, 25), ([(522, 160), (530, 160)], 1.8, 26),
    ([(628, 160), (642, 160)], 2, 27), ([(682, 150), (708, 140), (734, 150)], 2.4, 28), ([(664, 172), (742, 172)], 1.6, 29),
    ([(840, 100), (862, 100)], 2, 30), ([(940, 152), (966, 152)], 2, 31), ([(1020, 104), (1048, 104)], 2, 32),
    ([(1046, 140), (1054, 140)], 1.6, 33), ([(1056, 122), (1066, 122)], 1.6, 34), ([(1068, 132), (1078, 132)], 1.6, 35),
    ([(470, 170), (486, 170)], 1.6, 36), ([(486, 164), (506, 164)], 1.6, 37), ([(506, 174), (522, 174)], 1.6, 38),
    ([(762, 182), (780, 182)], 1.6, 39), ([(780, 176), (800, 176)], 1.6, 40), ([(800, 186), (822, 186)], 1.6, 41)])
roofs_light = shift_d(roofs_light, CITY_DX) + ' ' + ' '.join(snow_band(p, d, s, step=3) for p, d, s in [
    ([(rx0 + 5, ry - 16), (rx1, ry - 16)], 1.6, 42), ([(sx0 + 3, sy - 15), (sj_towers[0][0] - 5.5, sy - 15)], 1.8, 43),
    ([(sj_towers[0][0] + 5.5, sy - 15), (sj_towers[1][0] - 5, sy - 15)], 1.8, 44),
    ([(sj_towers[1][0] + 5, sy - 15), (sx1 - 3, sy - 15)], 1.8, 45)])
east_pts = samples(east_segs, 40)
byg_snow = snow_band(samples(byg_segs, 30), 2.6, 71, step=5)
east_runs = [[p for p in east_pts if a <= p[0] <= b] for a, b in ((1078, 1083), (1117, 1133), (1191, 1200))]
mid_cover = f'''
        <path class="snow snow-light" d="{roofs_light} {snow_band([(246, 196), (262, 178), (278, 196)], 1.8, 72, step=3)} {shift_d(snow_band([(384, 186), (420, 175), (456, 166)], 1.8, 73, step=4), TJ)}"/>
        <path class="snow snow-deep" d="{byg_snow}"/>
        <path class="snow snow-light" d="{wf[2]} {wf2[2]} {ef[2]} {ef2[2]}"/>
        <path class="snow snow-light" d="{' '.join(snow_band(run, 2.4, 45 + i, step=4) for i, run in enumerate(east_runs) if len(run) > 1)}"/>
        <path class="snow snow-deep" d="{wf[3]} {wf2[3]} {ef[3]} {ef2[3]}"/>
        <path class="snow snow-deep" d="{shift_d('M872 196 L930 166 L978 166 L1006 196 L1003 196 L976 168.5 L932 168.5 L878 196 Z M690 136 L694 120 L698 136 Z M716 130 L721 108 L726 130 Z', CITY_DX)}"/>'''

# ── NEAR: the fjord ─────────────────────────────
# Water lines in perspective: short, faint and close together near the city; longer, darker and
# further apart towards the viewer.
r = rng(17)
water_rows = []
for k in range(7):
    t = k / 6
    y = 201 + 56 * t ** 1.55
    length = 10 + 70 * t
    segs = []
    x = next(r) * 90
    while x < W:
        if not ((1040 < x < 1200 and y > 228) or (x < 236 and y > 226)):   # leave the skerry and the shore clear
            segs.append(f'M{x:.0f} {y:.1f} L{x + length * (0.7 + 0.6 * next(r)):.0f} {y + (next(r) - 0.5) * 0.8:.1f}')
        x += length * 2.2 + 150 * next(r) * (1 - 0.5 * t)
    water_rows.append(f'<path class="thin water" style="stroke-opacity:{0.28 + 0.5 * t:.2f};stroke-width:{0.7 + 0.7 * t:.2f}" d="{" ".join(segs)}"/>')
skerry = 'M1046 260 C1056 248, 1072 240, 1092 241 C1104 236, 1120 236, 1132 240 C1150 234, 1172 236, 1186 243 C1194 247, 1198 252, 1200 254'
seamark = 'M1150 236 L1150 212 M1150 214 L1160 211 M1146 236 L1154 236'
shore = 'M0 232 C24 228, 54 230, 84 236 C110 240, 140 242, 168 248 C190 252, 214 256, 236 260'
# a coastal Scots pine: a crooked trunk and flat, layered crowns (the nearest thing in the picture)
pine_trunk = ('M60 234 C64 212, 56 196, 66 178 C72 166, 80 156, 88 146 M68 234 C72 212, 64 198, 73 182 C78 172, 86 160, 94 150 '
              'M66 192 C54 184, 42 180, 30 178 M78 168 C92 164, 108 160, 124 154 M88 150 C84 142, 80 136, 72 132')
pine_crowns = ' '.join([lumps(8, 180, 50, 17, 81, n=4), lumps(96, 156, 56, 19, 82, n=4), lumps(44, 136, 58, 21, 83, n=4),
                        lumps(70, 120, 44, 16, 84, n=3)])
naust = 'M122 242 L122 228 L134 218 L146 228 L146 245 M128 243 L128 232 L140 232 L140 244'
isl = forest(chain((744, 197), ((768, 188), (830, 186), (872, 197)))[1], 776, 846, 7, 6, 10, 19, dy=1)
near = f'''
        <path class="fill" d="M0 {WATER} L1200 {WATER} L1200 {H} L0 {H} Z"/>
        <path d="M0 196 C200 194, 400 199, 600 196 S1000 194, 1200 197"/>
        <path class="thin" d="M744 197 C768 188, 830 186, 872 197"/>
        <path class="trees" d="{isl[0]}"/>
        {chr(10).join('        ' + w for w in water_rows).strip()}
        <path class="fill" d="{skerry} L1200 {H} L1046 {H} Z"/>
        <path d="{skerry}"/>
        <path class="thin" d="M1070 250 C1080 246, 1090 247, 1098 250 M1124 246 L1134 252 M1164 244 C1172 242, 1180 245, 1186 250 M1040 258 L1030 258 M1060 252 L1052 252"/>
        <path d="{seamark}"/>
        <path class="fill" d="{shore} L236 {H} L0 {H} Z"/>
        <path d="{shore}"/>
        <path class="thin" d="M20 240 C30 238, 40 240, 48 243 M96 246 L104 252 M150 252 C160 252, 170 254, 178 258 M6 248 L16 247"/>
        <path class="fill" d="{naust} Z"/>
        <path d="{naust}"/>
        <path class="thin" d="M126 230 L142 230 M134 218 L134 214"/>
        <path class="fill" d="M139 222.2 L139 215 L143 215 L143 225.5 Z"/>
        <path d="M139 222.2 L139 215 L143 215 L143 225.5"/>
        <path d="{pine_trunk}"/>
        <path class="trees pine" d="{pine_crowns}"/>
        <path class="thin" d="M14 182 L22 178 M24 183 L32 179 M104 158 L112 154 M116 159 L124 155 M130 158 L138 154 M52 138 L60 134 M64 139 L72 135 M78 122 L86 118"/>'''

# Ice on the fjord: edges along the shore (level 1), a wide sheet after a long cold spell (level 2).
ice1 = ('M0 197 L0 206 C40 209, 90 204, 140 208 C180 211, 230 205, 300 204 C340 203, 380 206, 470 200 L470 197 Z '
        'M1006 197 C1030 203, 1080 206, 1130 202 C1160 200, 1185 205, 1200 203 L1200 197 Z')
ice2 = ('M0 197 L0 232 C60 236, 120 226, 190 230 C260 234, 320 224, 400 228 C470 231, 520 222, 560 218 '
        'C600 214, 640 224, 700 222 C760 220, 820 228, 900 224 C980 220, 1060 230, 1130 226 C1160 224, 1185 229, 1200 227 L1200 197 Z')
cracks = ('M60 214 L84 222 L110 218 M180 208 L196 220 M300 214 L336 218 L350 226 M460 210 L492 216 '
          'M640 206 L666 214 L700 210 M820 210 L846 220 M960 214 L990 210 L1004 218 M1100 212 L1128 218')
skate = 'M120 222 C200 214, 280 226, 360 216 C420 210, 470 220, 520 212'
near_cover = f'''
        <path class="ice ice-1" d="{ice1}"/>
        <path class="ice ice-2" d="{ice2}"/>
        <path class="ice-line ice-2" d="{cracks}"/>
        <path class="ice-line ice-2 skate" d="{skate}"/>
        <path class="snow snow-light" d="{snow_band([(0, 232), (40, 229), (84, 236), (140, 242), (236, 260)], 2.8, 91, step=5)} {snow_band([(122, 228), (134, 218), (146, 228)], 1.6, 92, step=3)} {snow_band([(1046, 260), (1092, 241), (1132, 240), (1186, 243), (1200, 254)], 2.6, 93, step=5)}"/>
        <path class="snow snow-deep" d="{snow_band([(14, 168), (52, 168)], 2.4, 94, step=3)} {snow_band([(102, 142), (148, 142)], 2.4, 95, step=3)} {snow_band([(50, 120), (96, 120)], 2.6, 96, step=3)} {snow_band([(76, 106), (110, 106)], 2.2, 97, step=3)}"/>'''

# The Norwegian flag on City Hall's east tower (red, a white-edged blue Nordic cross: 6-1-2-1-12 by
# 6-1-2-1-6). Its own group in the mid layer, so it moves with the city but can wave as one piece.
fx0, fy0, u = 608 + CITY_DX, 70, 0.5         # top-left at the pole; one unit = 0.5
fw, fh = 22 * u, 16 * u
def frect(x, y, w, h):
    return f'M{fx0 + x * u:g} {fy0 + y * u:g} h{w * u:g} v{h * u:g} h{-w * u:g} Z'
flag = f'''
          <g class="flag">
            <path class="nf-red" d="{frect(0, 0, 22, 16)}"/>
            <path class="nf-white" d="{frect(6, 0, 4, 16)} {frect(0, 6, 22, 4)}"/>
            <path class="nf-blue" d="{frect(7, 0, 2, 16)} {frect(0, 7, 22, 2)}"/>
            <path class="nf-edge" d="{frect(0, 0, 22, 16)}"/>
          </g>'''

# ── Night lights ────────────────────────────────
# Windows that glow after dark (main.js sets data-lights="on" in the evening, "late" after
# midnight, when only the l2 windows stay lit). Drawn as small warm rectangles over the ink.
r = rng(101)
def windows(cells, keep=0.55, late=0.35, dx=0):
    lit = []
    for (x, y, w, h) in cells:
        k = next(r)
        if k > keep:
            continue
        cls = 'l2' if next(r) < late else 'l1'
        lit.append((cls, f'M{x + dx:.1f} {y:.1f} h{w} v{h} h{-w} Z'))
    return lit
cells_city = (
    [(x - 1.3, y + 0.5, 2.6, 8) for x in (539, 545.5, 552, 558.5) for y in (101, 115, 131, 147, 163, 179)]
    + [(x - 1.3, y + 0.5, 2.6, 8) for x in (597, 603, 613, 619) for y in (125, 141, 157, 173)]
    + [(x, y, 2.2, 3) for x in (843.2, 847.6, 852.6, 857) for y in range(106, 190, 7)]
    + [(x, y, 2.4, 3) for x in (1013.5, 1018.6, 1023.6, 1028.6, 1033.4, 1037) for y in range(132, 190, 7)]
    + [(1048.6, y, 2.4, 3) for y in range(144, 190, 7)] + [(x, y, 2.4, 3) for x in (1058.4, 1062) for y in range(126, 190, 7)]
    + [(x, y, 2.4, 3) for x in (1070.4, 1074) for y in range(136, 190, 7)]
    + [(x, 159, 2.4, 4.5) for x in (690.8, 696.8, 704.8, 712.8, 720.8)]
    + [(x, y, 3, 3) for x in (474.5, 491, 497) for y in (178, 186)] + [(x, 186, 4, 3) for x in (766, 806, 812)]
    + [(x, 177, 3, 3) for x in (946, 958, 970)])
lit = windows(cells_city, dx=CITY_DX)
lit += windows([(sx - 0.8, sy - 10, 1.6, 3) for sx in sj_wins] + [(sx - 0.8, sy - 5, 1.6, 3) for sx in sj_wins], keep=0.5)
lit.append(('l1', f'M{rx0 + 2} {ry - 12:.1f} h{rx1 - rx0 - 3} v1.8 h{-(rx1 - rx0 - 3)} Z'))   # the restaurant's ribbon window
for tx, hw, th in sj_towers:
    lit.append(('l2', f'M{tx - 2.1:.1f} {sy - th + 18.5:.1f} h4.2 v5 h-4.2 Z'))   # a tower window
lights = ''.join(f'\n        <path class="{c}" d="{d}"/>' for c, d in lit)
# their reflections: short warm strokes in the water under the lit buildings
lights_reflect = shift_d('M541 201 L541 206 M552 202 L552 210 M603 201 L603 207 M613 202 L613 212 M851 201 L851 209 '
                         'M1020 202 L1020 208 M1030 201 L1030 211 M1060 202 L1060 207 M700 201 L700 205', CITY_DX)

# ── Days of the year (main.js sets data-day on .land from the date in Oslo) ──
def mini_flag(x, y, k=0.32):
    """A small Norwegian flag on a short pole whose foot is at (x, y)."""
    w, h = 22 * k, 16 * k
    top = y - 9
    def fr(a, b, c, d):
        return f'M{x + a * k:.2f} {top + b * k:.2f} h{c * k:.2f} v{d * k:.2f} h{-c * k:.2f} Z'
    return (f'<path class="pole" d="M{x} {y} L{x} {top}"/>'
            f'<path class="nf-red" d="{fr(0, 0, 22, 16)}"/>'
            f'<path class="nf-white" d="{fr(6, 0, 4, 16)} {fr(0, 6, 22, 4)}"/>'
            f'<path class="nf-blue" d="{fr(7, 0, 2, 16)} {fr(0, 7, 22, 2)}"/>')
# 17 May: flags on the rooftops (City Hall's own flag grows in CSS)
may17 = ''.join(mini_flag(x + dx, y) for x, y, dx in [
    (548, 92, CITY_DX), (694, 116, CITY_DX), (721, 102, CITY_DX), (851, 100, CITY_DX), (953, 152, CITY_DX),
    (1034, 104, CITY_DX), (1061, 122, CITY_DX), (sj_towers[0][0], sy - sj_towers[0][2] - 4, 0), (rx0 + 6, ry - 18, 0), (472, 170, CITY_DX)])
# Christmas: a tree on Rådhusplassen, in front of City Hall, with lights and a star
tx_ = 577 + CITY_DX
tree = (f'M{tx_} 170 L{tx_ + 5} 178 L{tx_ + 3} 178 L{tx_ + 8} 186 L{tx_ + 5} 186 L{tx_ + 10} 194 L{tx_ + 1.2} 194 '
        f'L{tx_ + 1.2} 197 L{tx_ - 1.2} 197 L{tx_ - 1.2} 194 L{tx_ - 10} 194 L{tx_ - 5} 186 L{tx_ - 8} 186 L{tx_ - 3} 178 L{tx_ - 5} 178 Z')
tree_lights = ' '.join(circle(tx_ + ox, y, 0.7) for ox, y in [(-2, 177), (2.5, 181), (-4, 184), (1, 186), (5, 189), (-6, 191), (-1, 191), (3, 193)])
star = f'M{tx_} 165.5 L{tx_ + 1.1} 168.4 L{tx_ + 3.2} 168.6 L{tx_ + 1.5} 170.2 L{tx_ + 2} 172.6 L{tx_} 171.3 L{tx_ - 2} 172.6 L{tx_ - 1.5} 170.2 L{tx_ - 3.2} 168.6 L{tx_ - 1.1} 168.4 Z'
jul = (f'<path class="tree" d="{tree}"/><path class="thin" d="M{tx_ - 7} 189 C{tx_ - 2} 191, {tx_ + 3} 188, {tx_ + 7} 189 '
       f'M{tx_ - 5} 182 C{tx_ - 1} 184, {tx_ + 2} 181, {tx_ + 5} 182"/><path class="bulbs" d="{tree_lights}"/><path class="star" d="{star}"/>')
# New Year's Eve: fireworks over the fjord
def burst(cx, cy, rr, n, cls):
    rays = ' '.join(f'M{cx + math.cos(a) * rr * 0.35:.1f} {cy + math.sin(a) * rr * 0.35:.1f} L{cx + math.cos(a) * rr:.1f} {cy + math.sin(a) * rr:.1f}'
                    for a in [i * 2 * math.pi / n for i in range(n)])
    return f'<g class="burst {cls}" style="transform-origin: {cx}px {cy}px"><path d="{rays}"/></g>'
fireworks = (burst(330, 58, 22, 14, 'b1') + burst(700, 36, 28, 16, 'b2') + burst(930, 66, 18, 12, 'b3')
             + burst(520, 74, 14, 10, 'b4') + burst(1080, 44, 20, 14, 'b5'))
# Snowy days: a ski jumper leaves the Holmenkollen take-off now and then (main.js-free: CSS only)
jumper = (f'<g class="jumper"><path d="M{tx - 3} {tyo - 6.5:.1f} L{tx + 3.5} {tyo - 8:.1f} M{tx - 2.6} {tyo - 5.6:.1f} L{tx + 4} {tyo - 7.2:.1f} '
          f'M{tx + 0.4} {tyo - 7:.1f} L{tx + 2.4} {tyo - 11:.1f} M{tx + 2.4} {tyo - 11:.1f} L{tx + 3.2} {tyo - 12.4:.1f}"/></g>')
jump_dx, jump_dy = lx - tx - 6, ly - tyo + 4

life = '''
        <g class="ferry"><g transform="translate(0 212)"><path d="M0 0 L46 0 L41 7 L5 7 Z M10 0 L10 -6 L36 -6 L36 0 M14 -3 L16 -3 M20 -3 L22 -3 M26 -3 L28 -3 M26 -6 L26 -11 L31 -11 L31 -6"/><path class="ferry-lit" d="M13 -4.5 h4 v3 h-4 Z M19 -4.5 h4 v3 h-4 Z M25 -4.5 h4 v3 h-4 Z M27.4 -13.2 h2.2 v2.2 h-2.2 Z"/></g></g>
        <g transform="translate(790 208)"><g class="sailboat"><path d="M-20 0 C-12 8, 12 8, 22 0 Z M0 0 L0 -30 M0 -28 L16 -4 L0 -4 Z"/></g></g>
        <g class="gulls"><path d="M0 0 C3 -4, 7 -4, 10 0 C13 -4, 17 -4, 20 0" transform="translate(380 56)"/><path d="M0 0 C2 -3, 5 -3, 7 0 C9 -3, 12 -3, 14 0" transform="translate(410 46)"/></g>'''


# ── weather ─────────────────────────────────────
def cloud_path(w):
    """A lumpy hand-drawn cloud, w wide, sitting on y=0."""
    h = w * 0.38
    return (f'M0 0 C{-w * .06:.1f} {-h * .45:.1f}, {w * .12:.1f} {-h * .62:.1f}, {w * .22:.1f} {-h * .45:.1f} '
            f'C{w * .26:.1f} {-h * 1.05:.1f}, {w * .52:.1f} {-h * 1.12:.1f}, {w * .58:.1f} {-h * .62:.1f} '
            f'C{w * .68:.1f} {-h * .95:.1f}, {w * .9:.1f} {-h * .8:.1f}, {w * .88:.1f} {-h * .38:.1f} '
            f'C{w * 1.02:.1f} {-h * .32:.1f}, {w * 1.03:.1f} {-h * .02:.1f}, {w * .92:.1f} 0 Z')


# Seven clouds: three near and big, four further back (smaller, fainter, slower). data-clouds picks how
# many show (1: one, 2: four, 3: all of them under a low grey deck).
clouds = ''.join(
    f'<g class="cloud c{i}{" far" if i > 3 else ""}" transform="translate({x} {y})"><g class="cloud-drift"><path d="{cloud_path(w)}"/>'
    f'<path class="thin" d="M{w * .18:.1f} {-w * .06:.1f} C{w * .3:.1f} {-w * .1:.1f}, {w * .42:.1f} {-w * .1:.1f}, {w * .5:.1f} {-w * .05:.1f}"/></g></g>'
    for i, (x, y, w) in enumerate([(170, 46, 92), (560, 34, 120), (900, 58, 84),
                                   (372, 70, 62), (748, 76, 56), (1056, 42, 74), (30, 30, 68)], 1))
# The overcast deck: a low, lumpy underside across the whole sky, with a few soft hatch strokes.
r = rng(41)
xs = list(range(-60, 1300, 46))
deck_edge = ' '.join(f'C{x + 12} {30 + next(r) * 10:.1f}, {x + 34} {30 + next(r) * 10:.1f}, {x + 46} {24 + next(r) * 6:.1f}' for x in xs)
deck = (f'<path class="deck-fill" d="M-60 -20 L-60 26 {deck_edge} L{xs[-1] + 46} -20 Z" fill="url(#deck-fade)"/>'
        f'<path class="deck-edge" d="M-60 26 {deck_edge}"/>')
r = rng(43)
deck_hatch = ' '.join(f'M{x:.0f} {y:.0f} l{14 + next(r) * 10:.0f} -4' for x, y in ((next(r) * 1200, 6 + next(r) * 18) for _ in range(22)))
deck += f'<path class="thin" d="{deck_hatch}"/>'
# Rain rings on the fjord, and the smoke from the boathouse chimney on cold days.
r = rng(47)
ripples = ''.join(f'<ellipse cx="{280 + next(r) * 720:.0f}" cy="{204 + next(r) * 44:.0f}" rx="{5 + next(r) * 4:.1f}" ry="1.4" style="--d:{-next(r) * 2.4:.2f}s"/>' for _ in range(18))
smoke = ''.join(f'<path class="puff" d="M141 213 C136 209, 147 206, 142 201 C137 196, 149 193, 145 187 C141 182, 151 179, 149 174" style="--d:{-d}s"/>' for d in (0, 2, 4))
r = rng(11)
rain = ''.join(f'<path d="M{next(r) * 1260:.0f} {next(r) * 60 - 40:.0f} l-2.4 8" style="--d:{-next(r) * 1.2:.2f}s;--t:{0.75 + next(r) * 0.35:.2f}s"/>' for _ in range(80))
r = rng(29)
flakes = ''.join(f'<circle cx="{next(r) * 1220:.0f}" cy="{next(r) * 40 - 30:.0f}" r="{0.9 + next(r) * 1.1:.1f}" style="--d:{-next(r) * 9:.2f}s;--t:{7 + next(r) * 5:.2f}s;--s:{(next(r) - 0.5) * 28:.0f}px"/>' for _ in range(90))
fog = ''.join(f'<path d="M{x} {y} L{x + w} {y}" style="--d:{-d}s"/>' for x, y, w, d in [(-40, 150, 520, 0), (380, 168, 640, 9), (760, 182, 520, 4), (-20, 192, 760, 13)])

# ── the city's reflection ───────────────────────
# The city's paper silhouette, mirrored at the water line and squashed to MIRROR_K of its height, then cut
# into broken horizontal stripes that fade with distance (the #mirror-stripes mask). The mirroring is baked
# into the coordinates (no transform), so the mask lines up in the same user space. It sits in a mid layer
# so it parallaxes with the city, drawn after the near layer so the fjord's paper surface doesn't hide it.
MIRROR_K = 0.8
mirror_d = PAIR.sub(lambda m: f'{float(m.group(1)):g} {WATER * (1 + MIRROR_K) - MIRROR_K * float(m.group(2)):.1f}',
                    shift_d(city_fill, CITY_DX))
r = rng(53)
stripes, y = [], WATER + 3.0
while y < H + 2:
    x = -30 + next(r) * 30
    while x < W + 30:
        ln = 18 + next(r) * 72
        stripes.append(f'M{x:.1f} {y:.1f} L{x + ln:.1f} {y:.1f}')
        x += ln + 1.5 + next(r) * 3.5
    y += 3.3 + (y - WATER) * 0.03
mirror_stripes = ' '.join(stripes)

markup = f'''<!-- LAND -->
    <!-- Hand-drawn Oslo, generated by assets-src/make_skyline.py. The sky follows the time of day in
         Oslo (main.js), the weather follows the current weather there; the layers parallax on scroll
         and draw themselves in on load (style.css). -->
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
      <svg class="afterglow" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="glow-sun">
            <stop offset="0" stop-color="oklch(0.86 0.13 75)" stop-opacity="0.7"/>
            <stop offset="0.45" stop-color="oklch(0.8 0.11 45)" stop-opacity="0.35"/>
            <stop offset="1" stop-color="oklch(0.78 0.09 15)" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="glow-band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="oklch(0.85 0.08 50)" stop-opacity="0"/>
            <stop offset="1" stop-color="oklch(0.84 0.1 50)" stop-opacity="0.5"/>
          </linearGradient>
        </defs>
        <g class="layer layer--sky">
          <rect class="glow-band" x="-200" y="80" width="1600" height="120" fill="url(#glow-band)"/>
          <g class="glow-sun"><ellipse rx="360" ry="90" fill="url(#glow-sun)"/></g>
        </g>
      </svg>
      <svg class="fjord" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">
        <defs>
          <!-- a haze over the horizon, coloured by the weather (style.css sets --wash) -->
          <linearGradient id="wash" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" class="wash-stop" stop-opacity="0"/>
            <stop offset="0.55" class="wash-stop" stop-opacity="1"/>
            <stop offset="1" class="wash-stop" stop-opacity="0.6"/>
          </linearGradient>
          <!-- the overcast deck fades out upwards, so it has no hard top edge -->
          <linearGradient id="deck-fade" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="4" y2="36">
            <stop offset="0" class="deck-stop" stop-opacity="0"/>
            <stop offset="1" class="deck-stop" stop-opacity="0.7"/>
          </linearGradient>
          <!-- the city's reflection: broken stripes, fading away from the shore -->
          <linearGradient id="mirror-fade" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="{WATER}" y2="{H + 2}">
            <stop offset="0" stop-color="#fff" stop-opacity="1"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0.25"/>
          </linearGradient>
          <mask id="mirror-stripes" maskUnits="userSpaceOnUse" x="0" y="{WATER}" width="{W}" height="{H - WATER + 10}">
            <path d="{mirror_stripes}" fill="none" stroke="url(#mirror-fade)" stroke-width="2.1"/>
          </mask>
        </defs>
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
            <!-- main.js draws the real phase into .lit and tilts .moon-face (astro.js) -->
            <g class="moon-face"><circle class="earth" r="16"/><path class="lit" d=""/></g>
          </g>
        </g>
        <g class="layer layer--sky day day-nyttar">{fireworks}
        </g>
        <g class="layer layer--sky wx-wash"><rect x="-200" y="0" width="1600" height="200" fill="url(#wash)"/>
        </g>
        <g class="layer layer--sky wx-clouds">
          <g class="deck">{deck}</g>{clouds}
        </g>
        <g class="layer layer--back ink">{back}
        </g>
        <g class="layer layer--back cover">{back_cover}
        </g>
        <g class="layer layer--far ink">{far}
        </g>
        <g class="layer layer--far cover">{far_cover}
        </g>
        <g class="layer layer--far beacon-layer">
          <circle class="beacon-halo" cx="{vx + 0.3}" cy="5" r="5"/><circle class="beacon" cx="{vx + 0.3}" cy="5" r="1.5"/>
        </g>
        <g class="layer layer--far jumper-layer" style="--jx: {jump_dx:.0f}px; --jy: {jump_dy:.0f}px">{jumper}
        </g>
        <g class="layer layer--mid ink">{mid}
        </g>
        <g class="layer layer--mid cover">{mid_cover}
        </g>
        <g class="layer layer--mid lights">{lights}
        </g>
        <g class="layer layer--near lights lights-reflect"><path d="{lights_reflect}"/>
        </g>
        <g class="layer layer--mid flagpole">{flag}
        </g>
        <g class="layer layer--mid day day-17mai">{may17}
        </g>
        <g class="layer layer--mid day day-jul">{jul}
        </g>
        <g class="layer layer--near ink">{near}
        </g>
        <g class="layer layer--mid mirror"><path d="{mirror_d}" mask="url(#mirror-stripes)"/>
        </g>
        <g class="layer layer--near cover">{near_cover}
        </g>
        <g class="layer layer--near chimney">{smoke}
        </g>
        <g class="layer layer--near wx-ripple">{ripples}
        </g>
        <g class="layer layer--near life">{life}
          <g class="glint"><path d="M-14 0h28M-8 7h16M-4 14h8"/></g>
        </g>
        <g class="wx-front">
          <g class="wx-fog">{fog}</g>
          <g class="wx-rain">{rain}</g>
          <g class="wx-snow">{flakes}</g>
          <path class="bolt" d="M842 26 L828 72 L844 68 L826 122"/>
        </g>
      </svg>
    </div>
    <!-- /LAND -->'''

html = open('index.html').read()
html = re.sub(r'<!-- LAND -->.*?<!-- /LAND -->', lambda m: markup, html, flags=re.S)
open('index.html', 'w').write(html)
print('skyline written')
