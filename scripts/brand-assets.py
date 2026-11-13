"""Generate PathFinder brand assets from the Edutainal Ventures logo.

Usage:  python scripts/brand-assets.py path/to/logo.png      (requires Pillow)

Outputs
  apps/web/public/brand/ev-mark.png            two-square mark (light & dark backgrounds)
  apps/web/public/brand/ev-lockup-white.png    mark + white wordmark (for dark/blue backgrounds)
  apps/web/public/brand/ev-lockup-navy.png     mark + navy wordmark (for light backgrounds)
  apps/web/public/favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
  apps/mobile/assets/icon.png, android-icon-*.png, splash-icon.png, favicon.png
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web/public"
MOBILE = ROOT / "apps/mobile/assets"
NAVY = (11, 27, 51)


def main(src: str) -> None:
    logo = Image.open(src).convert("RGBA")
    alpha_box = logo.getchannel("A").getbbox()  # mark + wordmark
    # The squares end where the first fully transparent row appears below them.
    left, top, right, bottom = alpha_box
    mark_bottom = top
    for y in range(top, bottom):
        if any(logo.getpixel((x, y))[3] > 10 for x in range(left, right, 3)):
            mark_bottom = y
        elif y > top + 50:
            break
    mark = logo.crop((left, top, right, mark_bottom + 1))
    lockup_white = logo.crop(alpha_box)

    # Navy wordmark variant: recolour opaque white pixels below the squares.
    lockup_navy = lockup_white.copy()
    px = lockup_navy.load()
    w, h = lockup_navy.size
    for y in range(mark.size[1], h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                px[x, y] = (*NAVY, a)

    brand = WEB / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    fit(mark, height=96).save(brand / "ev-mark.png", optimize=True)
    fit(lockup_white, height=160).save(brand / "ev-lockup-white.png", optimize=True)
    fit(lockup_navy, height=160).save(brand / "ev-lockup-navy.png", optimize=True)

    for name, size, bg in [("favicon-32.png", 32, None), ("icon-192.png", 192, None), ("icon-512.png", 512, None),
                           ("apple-touch-icon.png", 180, (255, 255, 255, 255))]:
        square(mark, size, pad=0.06 if size <= 32 else 0.14, bg=bg).save(WEB / name, optimize=True)

    MOBILE.mkdir(parents=True, exist_ok=True)
    square(mark, 1024, pad=0.16, bg=(255, 255, 255, 255)).save(MOBILE / "icon.png", optimize=True)
    square(mark, 1024, pad=0.28).save(MOBILE / "android-icon-foreground.png", optimize=True)
    Image.new("RGBA", (1024, 1024), (255, 255, 255, 255)).save(MOBILE / "android-icon-background.png")
    mono = square(mark, 1024, pad=0.28)
    mono.putdata([(255, 255, 255, a) for (_, _, _, a) in mono.getdata()])
    mono.save(MOBILE / "android-icon-monochrome.png", optimize=True)
    square(lockup_navy, 1024, pad=0.18).save(MOBILE / "splash-icon.png", optimize=True)
    square(mark, 48, pad=0.06).save(MOBILE / "favicon.png", optimize=True)
    print("brand assets written:", mark.size, lockup_white.size)


def fit(img: Image.Image, height: int) -> Image.Image:
    w = round(img.size[0] * height / img.size[1])
    return img.resize((w, height), Image.LANCZOS)


def square(img: Image.Image, size: int, pad: float, bg=None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    inner = int(size * (1 - 2 * pad))
    scale = inner / max(img.size)
    resized = img.resize((max(1, round(img.size[0] * scale)), max(1, round(img.size[1] * scale))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.size[0]) // 2, (size - resized.size[1]) // 2))
    return canvas


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT.parent / "logo.png"))
