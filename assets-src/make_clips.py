"""Render the short, silent loops that play on the project cards into clips/*.mp4 (720x450, 16:10, the
shape of a card's plate). Run from the repo root:  python3 assets-src/make_clips.py
Needs ffmpeg + Pillow. The sources live in ~/Projects (outside this repo), so re-run only when a clip
should change; the rendered clips are committed.

  lastsignal  top-down gameplay with the HUD         last-signal-media/deliverables/appstore/preview-1920x886.mp4
  greenland   golf-cart mode (portrait phone footage), cropped to the road band where the action is
              ~/Downloads/3-golf-cart-mode.MP4
  everleaf    top of the App Store video             ~/Downloads/everleaf-2-private-by-design.MP4
  cointoss    phone screen recording, cropped to a 16:10 window that glides up with the first throw
              ~/Downloads/ScreenRecording_11-24-2026 15-55-39_1.mov
  equity      slideshow of App Store posters, panning down from headline to app
  soriamoria  slideshow (soft push-in + crossfades) of App Store screens

To add a clip for another card: render it to clips/<name>.mp4 and add data-src="clips/<name>.mp4" to
that card's <video class="clip"> in index.html.
"""
import math
import os
import subprocess
from PIL import Image

HOME = os.path.expanduser('~/Projects')
OUT = 'clips'
W, H, FPS = 720, 450, 24
ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '31', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an']


def run(cmd):
    subprocess.run(cmd, check=True)


def from_video(name, src, ss, t, crop, crf=31):
    """Trim [ss, ss+t] of a video, crop to 16:10 ("w:h:x:y") and scale to 720x450."""
    run(['ffmpeg', '-v', 'error', '-y', '-ss', str(ss), '-t', str(t), '-i', src,
         '-vf', f'crop={crop},scale={W}:{H}:flags=lanczos,fps={FPS}', *ENC, '-crf', str(crf), f'{OUT}/{name}.mp4'])


def cointoss(src):
    """The recording is portrait (1206x2622, Safari bars and all). Crop a full-width 16:10 window inside the
    game: it starts low, where the coin waits, and glides up to the meter as the first coin is thrown."""
    cy = "(0.66-0.20*(clip((t-0.6)/1.6,0,1)*clip((t-0.6)/1.6,0,1)*(3-2*clip((t-0.6)/1.6,0,1))))"
    run(['ffmpeg', '-v', 'error', '-y', '-ss', '0.5', '-t', '6.5', '-i', src,
         '-vf', f"crop=1206:754:0:'{cy}*ih-oh/2',scale={W}:{H}:flags=lanczos,fps={FPS}", *ENC, f'{OUT}/cointoss.mp4'])


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def slideshow(name, slides, hold, fade):
    """slides: list of render(u) -> RGB image (u runs 0..1 while the slide is on screen). The slides
    cross-fade in a ring, so the last one blends into the first and the loop has no seam."""
    n = len(slides)
    total = n * hold
    frames = int(round(total * FPS))
    proc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
         '-i', '-', *ENC, f'{OUT}/{name}.mp4'], stdin=subprocess.PIPE)
    for f in range(frames):
        t = f / FPS
        live = []
        for i in range(n):
            d = (t - i * hold + fade) % total          # time since slide i started fading in
            if d <= hold + fade:
                live.append((d, i))
        live.sort(reverse=True)                        # oldest first, newest on top
        canvas = None
        for d, i in live:
            img = slides[i](d / (hold + fade))
            if canvas is None:
                canvas = img
            else:
                canvas = Image.blend(canvas, img, min(1.0, d / fade))
        proc.stdin.write(canvas.tobytes())
    proc.stdin.close()
    proc.wait()


def pan_slide(path, y0, y1):
    """A tall poster: hold on the headline, then glide down to the app, in a 16:10 window."""
    img = Image.open(path).convert('RGB')
    w, h = img.size
    ww, wh = w, w * H / W

    def render(u):
        y = y0 + (y1 - y0) * smooth((u - 0.2) / 0.6)
        return img.resize((W, H), Image.LANCZOS, box=(0, y, ww, y + wh))
    return render


def push_slide(path, region, zoom=0.07):
    """A wide screenshot: take the 16:10 centre of `region` (fractions x0, y0, x1, y1) with a slow push-in."""
    img = Image.open(path).convert('RGB')
    w, h = img.size
    rx0, ry0, rx1, ry1 = region
    top, rh = ry0 * h, (ry1 - ry0) * h
    cw = rh * W / H
    cx, cy = (rx0 + rx1) / 2 * w, top + rh / 2

    def render(u):
        s = 1 + zoom * smooth(u)
        bw, bh = cw / s, rh / s
        return img.resize((W, H), Image.LANCZOS, box=(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))
    return render


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)

    from_video('lastsignal', f'{HOME}/last-signal-media/deliverables/appstore/preview-1920x886.mp4', 19.4, 4.2, '1418:886:251:0')
    from_video('greenland', os.path.expanduser('~/Downloads/3-golf-cart-mode.MP4'), 1.2, 9, '1080:675:0:1123', crf=35)
    from_video('everleaf', os.path.expanduser('~/Downloads/everleaf-2-private-by-design.MP4'), 0, 8, '1080:675:0:70')

    cointoss(os.path.expanduser('~/Downloads/ScreenRecording_11-24-2026 15-55-39_1.mov'))

    eq = f'{HOME}/equity-time-web/public/screenshots'
    slideshow('equity', [pan_slide(f'{eq}/{n}.png', 60, 640) for n in ('1-balance', '3-score', '6-trend', '8-dark')], hold=2.6, fade=0.5)

    sm = f'{HOME}/soria-moria/Docs/AppStore/screenshots/iphone_6.3'
    scene = (0.125, 0.31, 0.88, 1.0)      # the game scene inside the gold frame, without the headline
    slideshow('soriamoria', [push_slide(f'{sm}/{n}.png', scene) for n in ('01_hero', '02_read', '03_troll', '05_bridge', '06_duel')], hold=2.2, fade=0.6)

    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')
