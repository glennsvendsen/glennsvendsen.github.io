"""Trace a signature image to centreline SVG strokes (for a pen write-on animation).

usage: python3 assets-src/trace_signature.py assets-src/signature.jpg /tmp/sig.svg /tmp/preview.png
(writes /tmp/sig.json: the filled outline + the pen strokes used to animate the writing)
"""
import sys, math, json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC, OUT, PREVIEW = sys.argv[1:4]
S = 8  # upscale factor

im = Image.open(SRC).convert('L')
W0, H0 = im.size
im = im.resize((W0 * S, H0 * S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(S * 0.45))
a = np.array(im)
b = (a < 150).astype(np.uint8)
# pad
b = np.pad(b, 2)

# ── Zhang-Suen thinning ──
def neighbours(x):
    P2 = np.roll(x, 1, 0); P4 = np.roll(x, -1, 1); P6 = np.roll(x, -1, 0); P8 = np.roll(x, 1, 1)
    P3 = np.roll(P2, -1, 1); P5 = np.roll(P6, -1, 1); P7 = np.roll(P6, 1, 1); P9 = np.roll(P2, 1, 1)
    return [P2, P3, P4, P5, P6, P7, P8, P9]

img = b.copy()
changed = True
while changed:
    changed = False
    for step in (0, 1):
        P = neighbours(img)
        Bn = sum(P)
        seq = P + [P[0]]
        An = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
        P2, P3, P4, P5, P6, P7, P8, P9 = P
        if step == 0:
            c1 = P2 * P4 * P6; c2 = P4 * P6 * P8
        else:
            c1 = P2 * P4 * P8; c2 = P2 * P6 * P8
        m = (img == 1) & (Bn >= 2) & (Bn <= 6) & (An == 1) & (c1 == 0) & (c2 == 0)
        if m.any():
            img[m] = 0
            changed = True

sk = img
H, W = sk.shape
OFF = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
pts = set(zip(*np.nonzero(sk)))

def nbrs(p):
    y, x = p
    return [(y + dy, x + dx) for dy, dx in OFF if (y + dy, x + dx) in pts]

RING = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
def crossings(p):
    y, x = p
    v = [1 if (y + dy, x + dx) in pts else 0 for dy, dx in RING]
    return sum(1 for i in range(8) if v[i] == 0 and v[(i + 1) % 8] == 1)
cnt = {p: len(nbrs(p)) for p in pts}
junc = {p for p in pts if crossings(p) >= 3}
endp = {p for p in pts if cnt[p] <= 1 or crossings(p) == 1 and cnt[p] <= 2 and p not in junc}
# cluster junction pixels -> one node id each
comp = {}
for p in junc:
    if p in comp: continue
    stack = [p]; comp[p] = p; members = []
    while stack:
        c = stack.pop(); members.append(c)
        for q in nbrs(c):
            if q in junc and q not in comp: comp[q] = p; stack.append(q)
    cy = sum(m[0] for m in members) / len(members); cx = sum(m[1] for m in members) / len(members)
    for m in members: comp[m] = (cy, cx)
nodes = junc | endp
visited = set()
edges = []
def walk(start, first):
    path = [start, first]
    prev, cur = start, first
    if cur in nodes: return path
    visited.add(cur)
    while True:
        cand = [r for r in nbrs(cur) if r != prev and r not in visited and not (r in nodes and r == start and len(path) < 4)]
        if not cand: return path
        # prefer node, then 4-neighbour
        cand.sort(key=lambda r: (r not in nodes, abs(r[0] - cur[0]) + abs(r[1] - cur[1])))
        r = cand[0]
        path.append(r); prev, cur = cur, r
        if r in nodes: return path
        visited.add(r)
done_pairs = set()
for n in nodes:
    for q in nbrs(n):
        if q in junc and n in junc: continue  # inside a junction cluster
        if q in visited: continue
        if q in nodes:
            k = tuple(sorted([n, q]))
            if k in done_pairs: continue
            done_pairs.add(k)
        edges.append(walk(n, q))
# loops with no nodes
for p in pts:
    if p in visited or p in nodes: continue
    visited.add(p); loop = [p]; prev = None; cur = p
    while True:
        cand = [r for r in nbrs(cur) if r != prev and r not in visited]
        if not cand: break
        prev, cur = cur, cand[0]; visited.add(cur); loop.append(cur)
    loop.append(p); edges.append(loop)
# replace junction pixels at ends with cluster centroids
edges = [[comp.get(e[0], e[0])] + e[1:-1] + [comp.get(e[-1], e[-1])] for e in edges if len(e) >= 2]

def plen(e): return sum(math.dist(e[i], e[i + 1]) for i in range(len(e) - 1))

# prune short spurs (edges with a free end, short)
def prune(edges, minlen):
    while True:
        cnt = {}
        for e in edges:
            for end in (e[0], e[-1]): cnt[end] = cnt.get(end, 0) + 1
        keep = []; removed = False
        for e in edges:
            free = cnt[e[0]] == 1 or cnt[e[-1]] == 1
            if free and plen(e) < minlen and not (cnt[e[0]] == 1 and cnt[e[-1]] == 1):
                removed = True; continue
            keep.append(e)
        edges = keep
        if not removed: return edges
edges = prune(edges, S * 3.5)
# drop tiny isolated specks
edges = [e for e in edges if plen(e) > S * 2]

# merge clusters of nearby junction nodes into one point
def snap(edges, r):
    ends = [e[0] for e in edges] + [e[-1] for e in edges]
    rep = {}
    for p in ends:
        for q in rep.values():
            if math.dist(p, q) <= r: rep[p] = q; break
        else: rep[p] = p
    out = []
    for e in edges:
        e = list(e); e[0] = rep[e[0]]; e[-1] = rep[e[-1]]; out.append(e)
    return out
edges = snap(edges, S * 1.6)

# chain edges through junctions by direction continuity
def direction(e, at_start, k=int(S * 3)):
    if at_start:
        a, b = e[min(k, len(e) - 1)], e[0]
    else:
        a, b = e[-1 - min(k, len(e) - 1)], e[-1]
    return math.atan2(b[0] - a[0], b[1] - a[1])  # direction moving *into* the endpoint

strokes = []
pool = [list(e) for e in edges]
def pop_leftmost():
    i = min(range(len(pool)), key=lambda i: min(min(p[1] for p in (pool[i][0], pool[i][-1])), 1e9))
    e = pool.pop(i)
    if e[-1][1] < e[0][1]: e.reverse()
    return e
while pool:
    cur = pop_leftmost()
    while True:
        end = cur[-1]
        din = direction(cur, False)
        best, bi, brev = None, None, False
        for i, e in enumerate(pool):
            for rev in (False, True):
                ee = e[::-1] if rev else e
                if math.dist(ee[0], end) > S * 1.7: continue
                dout = direction(ee, True) + math.pi  # leaving direction
                turn = abs((dout - din + math.pi) % (2 * math.pi) - math.pi)
                if best is None or turn < best: best, bi, brev = turn, i, rev
        if best is None or best > math.radians(75): break
        e = pool.pop(bi); e = e[::-1] if brev else e
        cur = cur + e[1:]
    strokes.append(cur)

# smooth + simplify
def smooth(p, n=3, it=2):
    p = np.array(p, float)
    for _ in range(it):
        q = p.copy()
        for i in range(1, len(p) - 1):
            lo, hi = max(0, i - n), min(len(p), i + n + 1)
            q[i] = p[lo:hi].mean(0)
        p = q
    return p
def rdp(p, eps):
    if len(p) < 3: return p
    a, b = p[0], p[-1]
    d = b - a; L = np.hypot(*d) or 1e-9
    dist = np.abs(d[1] * (p[:, 0] - a[0]) - d[0] * (p[:, 1] - a[1])) / L if L > 1e-6 else np.hypot(*(p - a).T)
    i = int(np.argmax(dist))
    if dist[i] > eps:
        return np.vstack([rdp(p[:i + 1], eps)[:-1], rdp(p[i:], eps)])
    return np.vstack([a, b])

scale = 1.0 / S
out = []
for s in strokes:
    if plen(s) < S * 4: continue
    p = smooth(s)
    p = rdp(p, S * 0.35)
    p = (p - 2) * scale  # remove pad, back to source px
    out.append(p[:, ::-1])  # (x,y)
out.sort(key=lambda p: p[:, 0].min())

def catmull(p):
    d = f"M{p[0][0]:.2f} {p[0][1]:.2f}"
    if len(p) == 2:
        return d + f"L{p[1][0]:.2f} {p[1][1]:.2f}"
    pp = np.vstack([p[0], p, p[-1]])
    for i in range(1, len(pp) - 2):
        p0, p1, p2, p3 = pp[i - 1], pp[i], pp[i + 1], pp[i + 2]
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d += f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d

allp = np.vstack(out)
minx, miny = allp.min(0) - 2; maxx, maxy = allp.max(0) + 2
paths = [catmull(p - [minx, miny]) for p in out]
vw, vh = maxx - minx, maxy - miny
# estimate stroke width from ink area / skeleton length
ink = b.sum() / (S * S); length = sum(plen(s) for s in strokes) / S
sw = max(1.2, min(3.0, ink / max(length, 1)))
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.1f} {vh:.1f}" fill="none" stroke="currentColor" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">']
for d in paths:
    svg.append(f'  <path d="{d}"/>')
svg.append('</svg>')
open(OUT, 'w').write('\n'.join(svg) + '\n')
print(json.dumps({"strokes": len(paths), "viewBox": [round(vw, 1), round(vh, 1)], "stroke_width": round(sw, 2),
                  "lengths": [round(plen(s) / S) for s in strokes if plen(s) >= S * 4]}))

# preview: original (top) vs polylines (bottom), numbered stroke order
Z = 4
pv = Image.new('RGB', (int(W0 * Z), int(H0 * Z * 2)), 'white')
pv.paste(Image.open(SRC).convert('RGB').resize((W0 * Z, H0 * Z)), (0, 0))
dr = ImageDraw.Draw(pv)
cols = [(200, 30, 60), (30, 90, 200), (20, 150, 60), (180, 120, 0), (120, 40, 170), (0, 140, 140)]
for i, p in enumerate(out):
    q = [(x * Z, y * Z + H0 * Z) for x, y in p]
    dr.line(q, fill=cols[i % len(cols)], width=int(sw * Z), joint='curve')
    dr.text((q[0][0] + 3, q[0][1] - 12), str(i + 1), fill=cols[i % len(cols)])
pv.save(PREVIEW)


# ── OUTLINE: marching squares on the smooth upscaled image, for a faithful filled shape ──
LEVEL = 150.0
g = a.astype(float)
Hh, Ww = g.shape
g = np.pad(g, 1, constant_values=255.0)  # close contours at the border
inside = g < LEVEL
case = (inside[:-1, :-1] * 8 + inside[:-1, 1:] * 4 + inside[1:, 1:] * 2 + inside[1:, :-1] * 1)
def interp(v0, v1):
    return (LEVEL - v0) / (v1 - v0) if v1 != v0 else 0.5
def edge_pt(e):
    kind, y, x = e
    if kind == 'h':   # between (y,x) and (y,x+1)
        return (y, x + interp(g[y, x], g[y, x + 1]))
    return (y + interp(g[y, x], g[y + 1, x]), x)  # 'v': between (y,x) and (y+1,x)
# edges of cell (y,x): top=('h',y,x) right=('v',y,x+1) bottom=('h',y+1,x) left=('v',y,x)
SEG = {1: [('l', 'b')], 2: [('b', 'r')], 3: [('l', 'r')], 4: [('t', 'r')], 6: [('t', 'b')], 7: [('l', 't')],
       8: [('l', 't')], 9: [('t', 'b')], 11: [('t', 'r')], 12: [('l', 'r')], 13: [('b', 'r')], 14: [('l', 'b')]}
adj = {}
ys, xs = np.nonzero((case > 0) & (case < 15))
for y, x in zip(ys, xs):
    c = int(case[y, x])
    E = {'t': ('h', y, x), 'r': ('v', y, x + 1), 'b': ('h', y + 1, x), 'l': ('v', y, x)}
    if c in (5, 10):
        centre = g[y:y + 2, x:x + 2].mean() < LEVEL
        pairs = {5: [('l', 't'), ('b', 'r')] if not centre else [('l', 'b'), ('t', 'r')],
                 10: [('t', 'r'), ('l', 'b')] if not centre else [('l', 't'), ('b', 'r')]}[c]
    else:
        pairs = SEG[c]
    for p, q in pairs:
        adj.setdefault(E[p], []).append(E[q]); adj.setdefault(E[q], []).append(E[p])
loops, seen_e = [], set()
for e0 in adj:
    if e0 in seen_e: continue
    loop = [e0]; seen_e.add(e0); prev, cur = None, e0
    while True:
        nx = [n for n in adj[cur] if n != prev and n not in seen_e]
        if not nx: break
        prev, cur = cur, nx[0]; seen_e.add(cur); loop.append(cur)
    if len(loop) > 6: loops.append(np.array([edge_pt(e) for e in loop]) - 1)  # undo pad
def rdp_closed(p, eps):
    return rdp(np.vstack([p, p[:1]]), eps)[:-1]
def catmull_closed(p):
    n = len(p)
    d = f"M{p[0][0]:.2f} {p[0][1]:.2f}"
    for i in range(n):
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d += f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d + 'Z'
outline = []
for L in loops:
    q = rdp_closed(L, S * 0.12)
    if len(q) < 3: continue
    q = q[:, ::-1] / S - [minx, miny]  # (x,y) in source px, same frame as the strokes
    outline.append(catmull_closed(q))
json.dump({'viewBox': [round(vw, 1), round(vh, 1)], 'outline': ' '.join(outline), 'strokes': paths,
           'stroke_width': round(sw, 2)}, open(OUT.replace('.svg', '.json'), 'w'))
print('outline loops', len(outline), 'chars', sum(map(len, outline)))
