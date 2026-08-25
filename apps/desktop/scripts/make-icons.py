#!/usr/bin/env python3
"""Build Dock and tray marks from the peach-hug master.

Dock uses the original Xiaotaozi crop: peach in the bottom-right,
leaves in the upper-left. macOS applies its own squircle; we only
punch the baked black corners to transparent so they do not show
as a dark frame.

Tray is not that same full orange plate. A filled 18pt square reads
huge next to menu-bar extras, so we crop into the peach and pad the
PNG. tray-icon on macOS always scales height to 18pt.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "src-tauri" / "icons" / "brand" / "peach-hug-ds-icon.png"
OUT = ROOT / "src-tauri" / "icons"

MAC_TRAY_FILL = 0.88
WIN_TRAY_FILL = 0.88
MAC_TRAY_PX = 88
WIN_TRAY_PX = 32
# Fraction of the Dock canvas to drop from the left/top so the tray
# mark is the peach, not the empty orange field.
TRAY_CROP_LEFT = 0.20
TRAY_CROP_TOP = 0.16


def punch_black_corners(im: Image.Image, thresh: int = 40) -> Image.Image:
    pix = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if r + g + b < thresh:
                pix[x, y] = (0, 0, 0, 0)
    return im


def squircle_mask(size: int, n: float = 5.0) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    pix = mask.load()
    rad = (size - 1) / 2.0
    for y in range(size):
        any_n = abs((y - rad) / rad) ** n
        for x in range(size):
            v = abs((x - rad) / rad) ** n + any_n
            if v <= 1.0:
                pix[x, y] = 255
            elif v < 1.06:
                pix[x, y] = int(max(0.0, (1.06 - v) / 0.06) * 255)
    return mask.filter(ImageFilter.GaussianBlur(radius=0.4))


def padded_tray(src: Image.Image, canvas: int, fill: float) -> Image.Image:
    inner = max(1, int(round(canvas * fill)))
    mark = src.resize((inner, inner), Image.Resampling.LANCZOS).convert("RGBA")
    r, g, b, a = mark.split()
    mark = Image.merge("RGBA", (r, g, b, ImageChops.multiply(a, squircle_mask(inner))))
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    origin = (canvas - inner) // 2
    out.paste(mark, (origin, origin), mark)
    return out


def tray_source(dock: Image.Image) -> Image.Image:
    w, h = dock.size
    crop = dock.crop((int(w * TRAY_CROP_LEFT), int(h * TRAY_CROP_TOP), w, h))
    cw, ch = crop.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(crop, (side - cw, side - ch), crop)
    return square


def main() -> None:
    im = Image.open(MASTER).convert("RGBA")
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.Resampling.LANCZOS)
    im = punch_black_corners(im)
    im.save(OUT / "app-icon-1024.png")
    src = tray_source(im)
    padded_tray(src, MAC_TRAY_PX, MAC_TRAY_FILL).save(OUT / "tray-macos.png")
    padded_tray(src, WIN_TRAY_PX, WIN_TRAY_FILL).save(OUT / "tray-win.png")
    print(
        "wrote",
        OUT / "app-icon-1024.png",
        f"tray-macos {MAC_TRAY_PX}@{MAC_TRAY_FILL:.0%}",
        f"tray-win {WIN_TRAY_PX}@{WIN_TRAY_FILL:.0%}",
    )


if __name__ == "__main__":
    main()
