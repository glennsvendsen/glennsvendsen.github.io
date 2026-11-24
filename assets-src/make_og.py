"""Render og-image.png (1200x630): the signature on paper above the hand-drawn Oslo skyline.

Reads the outline from signature.svg and the skyline paths from index.html, so the
preview image stays in step with the page. Run from the repo root:  python3 assets-src/make_og.py
Needs Pillow + numpy.
"""
import re
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, SS = 1200, 630, 3  # supersample for smooth strokes
PAPER = (248, 245, 239)
INK = (52, 46, 42)
FAINT = (150, 142, 134)
ACCENT = (190, 62, 102)


def parse(d):
    """Absolute M/L/C/S/Z path data -> list of polylines."""
    toks = re.findall(r'[MLCSZ]|-?\d*\.?\d+', d)
    lines, cur, pos, start, last_c2 = [], [], None, None, None
    i, cmd = 0, None
    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v
    def bez(p0, p1, p2, p3, n=24):
        t = np.linspace(0, 1, n)[1:, None]
        return list(map(tuple, (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3))
    while i < len(toks):
        if re.match(r'[MLCSZ]', toks[i]):
            cmd = toks[i]; i += 1
        if cmd == 'M':
            if len(cur) > 1: lines.append(cur)
            pos = np.array([num(), num()]); start = pos; cur = [tuple(pos)]; last_c2 = None; cmd = 'L'
        elif cmd == 'L':
            pos = np.array([num(), num()]); cur.append(tuple(pos)); last_c2 = None
        elif cmd == 'C':
            c1 = np.array([num(), num()]); c2 = np.array([num(), num()]); p = np.array([num(), num()])
            cur += bez(pos, c1, c2, p); pos = p; last_c2 = c2
        elif cmd == 'S':
            c1 = 2 * pos - last_c2 if last_c2 is not None else pos
            c2 = np.array([num(), num()]); p = np.array([num(), num()])
            cur += bez(pos, c1, c2, p); pos = p; last_c2 = c2
        elif cmd == 'Z':
            cur.append(tuple(start)); pos = start
    if len(cur) > 1: lines.append(cur)
    return lines


def stroke(draw, lines, xf, colour, width):
    for ln in lines:
        pts = [xf(p) for p in ln]
        draw.line(pts, fill=colour, width=int(width * SS), joint='curve')
        r = width * SS / 2
        for x, y in (pts[0], pts[-1]):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=colour)


img = Image.new('RGB', (W * SS, H * SS), PAPER)
# paper fibre: faint noise, blurred
rng = np.random.default_rng(4)
noise = Image.fromarray((rng.normal(0, 7, (H, W)) + 128).clip(0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))
noise = noise.resize((W * SS, H * SS))
img = Image.blend(img, Image.merge('RGB', [noise] * 3), 0.05)
draw = ImageDraw.Draw(img)

# Oslo skyline: every path of the hero panorama's ink layers, in document order (viewBox 1200x260)
html = open('index.html').read()
land = html[html.index('<svg class="fjord"'):html.index('<!-- /LAND -->')]
fy = H - 262
fx = lambda p: (p[0] * SS, (p[1] + fy) * SS)
cx, cy, r = 330 * SS, (fy + 62) * SS, 16 * SS
draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(245, 222, 226), outline=ACCENT, width=2 * SS)
for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
    draw.line([(cx + np.cos(a) * 26 * SS, cy + np.sin(a) * 26 * SS), (cx + np.cos(a) * 34 * SS, cy + np.sin(a) * 34 * SS)], fill=ACCENT, width=int(1.4 * SS))
for layer in re.findall(r'<g class="layer layer--(?:far|mid|near) ink">(.*?)</g>', land, re.S):
    for cls, d in re.findall(r'<path(?: class="([^"]*)")? d="([^"]+)"', layer):
        lines = parse(d)
        if 'fill' in cls.split() or 'trees' in cls.split():
            for ln in lines:
                if len(ln) > 2: draw.polygon([fx(p) for p in ln], fill=PAPER)
            if 'fill' in cls.split(): continue
        colour = ACCENT if 'accent' in cls else (FAINT if 'thin' in cls else INK)
        stroke(draw, lines, fx, colour, 1.3 if 'thin' in cls else 1.9)
boat = re.search(r'<g class="sailboat"><path d="([^"]+)"', land).group(1)
stroke(draw, parse(boat), lambda p: ((p[0] + 790) * SS, (p[1] + 208 + fy) * SS), INK, 1.6)

# signature, centred in the upper part
svg = open('signature.svg').read()
vw, vh = map(float, re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg).group(1, 2))
sw = 760 / vw
ox, oy = (W - vw * sw) / 2, 90
sx = lambda p: ((ox + p[0] * sw) * SS, (oy + p[1] * sw) * SS)
outline = re.search(r'<path fill="currentColor" fill-rule="evenodd" d="([^"]+)"', svg).group(1)
mask = Image.new('L', img.size, 0)
mdraw = ImageDraw.Draw(mask)
for ln in parse(outline):  # even-odd: XOR each loop into the mask
    loop = Image.new('L', img.size, 0)
    ImageDraw.Draw(loop).polygon([sx(p) for p in ln], fill=255)
    mask = Image.fromarray(np.bitwise_xor(np.array(mask), np.array(loop)))
img.paste(Image.new('RGB', img.size, INK), (0, 0), mask)

img.resize((W, H), Image.LANCZOS).save('og-image.png', optimize=True)
print('og-image.png written')
