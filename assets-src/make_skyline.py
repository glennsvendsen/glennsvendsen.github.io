"""Generate the hero's hand-drawn Oslo panorama and write it into index.html (between the
<!-- LAND --> markers). Edit this script, not the generated markup. Run from the repo root:

  python3 assets-src/make_skyline.py

Coordinates: viewBox 1200x260, the water line at y=196. main.js places the sun/moon on arcs above it.

Layers, back to front. Each is a <g class="layer layer--*"> so CSS can parallax it on scroll:
  sky   sun / moon / stars (placed by main.js from the time in Oslo), clouds
  far   Holmenkollåsen: the ridge, the Tryvann tower and the Holmenkollen ski jump
  mid   forested hills, City Hall (Rådhuset), Akershus, Oslo Plaza, the Opera, Munch, the Barcode
  near  the fjord: water, Hovedøya, reflections, and the living bits (ferry, sailboat, gulls)

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

# ── MID: hills, forest, the city ───────────────
west_d, west_segs = chain((0, 150), ((70, 138), (160, 130), (250, 140)), ((330, 148), (410, 164), (490, 188)))
east_d, east_segs = chain((1030, WATER), ((1070, 172), (1120, 154), (1200, 148)))
wf = forest(west_segs, 6, 466, 7, 14, 27, 7)
wf2 = forest(west_segs, 14, 440, 10, 10, 18, 11, dy=15)
ef = forest(east_segs, 1084, 1198, 7, 11, 21, 3)

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
        <path class="fill" d="{east_d} L1200 {H} L1030 {H} Z"/>
        <path d="{east_d}"/>
        <path class="trees" d="{ef[0]}"/>
        <path class="fill" d="{city_fill}"/>
        <path class="thin" d="M470 196 L470 170 L486 170 L486 164 L506 164 L506 174 L522 174 M474 176 L482 176 M474 184 L482 184 M490 170 L502 170 M490 178 L502 178 M490 186 L502 186 M510 180 L518 180 M510 188 L518 188"/>
        <path d="{ch}"/>
        <path class="thin" d="{ch_thin}"/>
        <path class="thin" d="{clock}"/>
        <path class="hand hand--hour" data-pivot="608 106" d="M0 0 L0 -3.8"/>
        <path class="hand hand--min" data-pivot="608 106" d="M0 0 L0 -5.6"/>
        <path class="thin" d="M608 86 L608 70"/>
        <path class="accent flag" d="M608 70 L621 73 L608 77"/>
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

roofs_light = ' '.join(snow_band(p, d, s, step=3) for p, d, s in [
    ([(528, 98), (568, 98)], 2.2, 21), ([(533, 92), (563, 92)], 1.8, 22), ([(586, 92), (630, 92)], 2.2, 23),
    ([(592, 86), (624, 86)], 1.8, 24), ([(566, 150), (588, 150)], 2.4, 25), ([(522, 160), (530, 160)], 1.8, 26),
    ([(628, 160), (642, 160)], 2, 27), ([(682, 150), (708, 140), (734, 150)], 2.4, 28), ([(664, 172), (742, 172)], 1.6, 29),
    ([(840, 100), (862, 100)], 2, 30), ([(940, 152), (966, 152)], 2, 31), ([(1020, 104), (1048, 104)], 2, 32),
    ([(1046, 140), (1054, 140)], 1.6, 33), ([(1056, 122), (1066, 122)], 1.6, 34), ([(1068, 132), (1078, 132)], 1.6, 35),
    ([(470, 170), (486, 170)], 1.6, 36), ([(486, 164), (506, 164)], 1.6, 37), ([(506, 174), (522, 174)], 1.6, 38),
    ([(762, 182), (780, 182)], 1.6, 39), ([(780, 176), (800, 176)], 1.6, 40), ([(800, 186), (822, 186)], 1.6, 41)])
mid_cover = f'''
        <path class="snow snow-light" d="{roofs_light}"/>
        <path class="snow snow-light" d="{wf[2]} {wf2[2]} {ef[2]}"/>
        <path class="snow snow-deep" d="{wf[3]} {wf2[3]} {ef[3]}"/>
        <path class="snow snow-deep" d="M872 196 L930 166 L978 166 L1006 196 L1003 196 L976 168.5 L932 168.5 L878 196 Z M690 136 L694 120 L698 136 Z M716 130 L721 108 L726 130 Z"/>'''

# ── NEAR: the fjord ─────────────────────────────
water_hatch = ('M70 212 L140 212 M220 222 L320 222 M410 210 L460 210 M640 226 L760 226 M820 212 L900 212 '
               'M980 222 L1060 222 M110 238 L180 238 M350 244 L430 244 M690 246 L770 246 M1000 240 L1080 240 M520 234 L580 234')
r = rng(17)
isl = forest(chain((232, 197), ((262, 186), (330, 184), (368, 197)))[1], 268, 338, 7, 7, 12, 19, dy=1)
near = f'''
        <path class="fill" d="M0 {WATER} L1200 {WATER} L1200 {H} L0 {H} Z"/>
        <path d="M0 196 C200 194, 400 199, 600 196 S1000 194, 1200 197"/>
        <path class="thin" d="M232 197 C262 186, 330 184, 368 197"/>
        <path class="trees" d="{isl[0]}"/>
        <path class="thin reflect" d="M548 202 C550 206, 546 210, 548 214 M541 202 L541 206 M608 202 C610 207, 606 212, 608 218 M615 202 L615 207 M721 200 L721 205 M851 202 C853 208, 849 214, 851 220 M953 202 L953 206 M1026 202 C1028 206, 1024 210, 1026 213"/>
        <path class="thin water" d="{water_hatch}"/>'''

# Ice on the fjord: edges along the shore (level 1), a wide sheet after a long cold spell (level 2).
ice1 = ('M0 197 L0 206 C40 209, 90 204, 140 208 C180 211, 210 205, 236 203 L232 197 Z '
        'M368 197 C380 202, 420 204, 470 200 L470 197 Z '
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
        <path class="ice-line ice-2 skate" d="{skate}"/>'''

life = '''
        <g class="ferry"><g transform="translate(0 212)"><path d="M0 0 L46 0 L41 7 L5 7 Z M10 0 L10 -6 L36 -6 L36 0 M14 -3 L16 -3 M20 -3 L22 -3 M26 -3 L28 -3 M26 -6 L26 -11 L31 -11 L31 -6"/></g></g>
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


clouds = ''.join(
    f'<g class="cloud c{i}" transform="translate({x} {y})"><g class="cloud-drift"><path d="{cloud_path(w)}"/>'
    f'<path class="thin" d="M{w * .18:.1f} {-w * .06:.1f} C{w * .3:.1f} {-w * .1:.1f}, {w * .42:.1f} {-w * .1:.1f}, {w * .5:.1f} {-w * .05:.1f}"/></g></g>'
    for i, (x, y, w) in enumerate([(170, 46, 92), (560, 34, 120), (900, 58, 84)], 1))
r = rng(11)
rain = ''.join(f'<path d="M{next(r) * 1260:.0f} {next(r) * 60 - 40:.0f} l-2.4 8" style="--d:{-next(r) * 1.2:.2f}s;--t:{0.75 + next(r) * 0.35:.2f}s"/>' for _ in range(80))
r = rng(29)
flakes = ''.join(f'<circle cx="{next(r) * 1220:.0f}" cy="{next(r) * 40 - 30:.0f}" r="{0.9 + next(r) * 1.1:.1f}" style="--d:{-next(r) * 9:.2f}s;--t:{7 + next(r) * 5:.2f}s;--s:{(next(r) - 0.5) * 28:.0f}px"/>' for _ in range(90))
fog = ''.join(f'<path d="M{x} {y} L{x + w} {y}" style="--d:{-d}s"/>' for x, y, w, d in [(-40, 150, 520, 0), (380, 168, 640, 9), (760, 182, 520, 4), (-20, 192, 760, 13)])

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
        <g class="layer layer--sky wx-clouds">{clouds}
        </g>
        <g class="layer layer--far ink">{far}
        </g>
        <g class="layer layer--far cover">{far_cover}
        </g>
        <g class="layer layer--mid ink">{mid}
        </g>
        <g class="layer layer--mid cover">{mid_cover}
        </g>
        <g class="layer layer--near ink">{near}
        </g>
        <g class="layer layer--near cover">{near_cover}
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
