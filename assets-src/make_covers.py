"""Render the project cards' still covers that are composed rather than grabbed from a clip:
Equity and Everleaf get three real app screens peeking up from warm paper (no App Store slogans), and
Coin Toss is normalised to 720x450. Run from the repo root:  python3 assets-src/make_covers.py
Needs Pillow. Sources live in ~/Projects (outside this repo); the rendered covers are committed.

  equity    equity-time-web/public/screenshots/{1-balance,3-score,6-trend}.png   (inner screen cropped out
            of the App Store poster's phone frame)
  everleaf  Mybooks-web/public/shots/en-{01-reading,02-library,04-stats}.jpg      (plain screens)
"""
import os
import random
from PIL import Image, ImageDraw, ImageFilter

HOME = os.path.expanduser('~/Projects')
W, H = 720, 450
SS = 2                                    # supersample, then scale down for clean edges


def paper(tone):
    """Warm paper with a faint grain, so the cover sits on the page like a print."""
    img = Image.new('RGB', (W * SS, H * SS), tone)
    rnd = random.Random(7)
    grain = Image.new('L', (W // 2, H // 2))
    grain.putdata([128 + int(rnd.gauss(0, 9)) for _ in range(grain.width * grain.height)])
    grain = grain.resize(img.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2))
    return Image.composite(Image.new('RGB', img.size, tuple(max(0, c - 10) for c in tone)), img,
                           grain.point(lambda v: max(0, 128 - v) * 3))


def phone(screen, width, radius, bezel=(28, 26, 24)):
    """A screen inside a thin dark bezel with rounded corners (RGBA)."""
    sw = width - 2 * 7 * SS
    sh = int(screen.height * sw / screen.width)
    screen = screen.resize((sw, sh), Image.LANCZOS)
    b = 7 * SS
    out = Image.new('RGBA', (width, sh + 2 * b), (0, 0, 0, 0))
    ImageDraw.Draw(out).rounded_rectangle((0, 0, out.width - 1, out.height - 1), radius + b, fill=bezel + (255,))
    mask = Image.new('L', screen.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius, fill=255)
    out.paste(screen, (b, b), mask)
    return out


def place(canvas, ph, cx, top, angle):
    """Rotate a phone, drop a soft shadow under it and paste it with its top-centre near (cx, top)."""
    rot = ph.rotate(angle, resample=Image.BICUBIC, expand=True)
    x, y = int(cx - rot.width / 2), int(top)
    alpha = rot.getchannel('A')
    shadow = Image.new('RGBA', rot.size, (60, 45, 30, 0))
    shadow.putalpha(alpha.point(lambda a: a * 0.32).filter(ImageFilter.GaussianBlur(14 * SS)))
    canvas.paste(shadow, (x + 4 * SS, y + 16 * SS), shadow)
    canvas.paste(rot, (x, y), rot)


def cover(name, screens, tone, radius):
    canvas = paper(tone).convert('RGBA')
    pw = 196 * SS
    # side phones lean out and sit lower; the middle one stands tallest and in front
    for (cx, top, angle), scr in zip([(W * SS * 0.24, 118 * SS, 7), (W * SS * 0.76, 118 * SS, -7)], (screens[0], screens[2])):
        place(canvas, phone(scr, pw, radius), cx, top, angle)
    place(canvas, phone(screens[1], pw, radius), W * SS * 0.5, 52 * SS, 0)
    out = canvas.convert('RGB').resize((W, H), Image.LANCZOS)
    out.save(f'{name}-cover.jpg', quality=84, optimize=True, progressive=True)
    print(f'{name}-cover.jpg', os.path.getsize(f'{name}-cover.jpg') // 1024, 'KB')


if __name__ == '__main__':
    eq = f'{HOME}/equity-time-web/public/screenshots'
    inner = (93, 489, 627, 1564)          # the screen inside the poster's phone frame
    cover('equity', [Image.open(f'{eq}/{n}.png').convert('RGB').crop(inner) for n in ('1-balance', '3-score', '6-trend')],
          tone=(240, 236, 226), radius=30 * SS)

    el = f'{HOME}/Mybooks-web/public/shots'
    cover('everleaf', [Image.open(f'{el}/en-{n}.jpg').convert('RGB') for n in ('01-reading', '02-library', '04-stats')],
          tone=(238, 228, 214), radius=30 * SS)

    ct = Image.open('cointoss-cover.jpg').convert('RGB')
    if ct.size != (W, H):
        cw = min(ct.width, ct.height * W / H)          # centre 16:10 window
        ct.resize((W, H), Image.LANCZOS, box=((ct.width - cw) / 2, 0, (ct.width + cw) / 2, cw * H / W)).save('cointoss-cover.jpg', quality=82, optimize=True, progressive=True)
    print('cointoss-cover.jpg', os.path.getsize('cointoss-cover.jpg') // 1024, 'KB')
