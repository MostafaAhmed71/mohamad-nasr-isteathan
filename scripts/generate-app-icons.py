#!/usr/bin/env python3
"""Generate Android mipmap + PWA icons from resources/icon.png (or a given source)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "resources" / "icon.png"

ANDROID_DENSITIES = {
    "mipmap-mdpi": {"launcher": 48, "foreground": 108},
    "mipmap-hdpi": {"launcher": 72, "foreground": 162},
    "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
    "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}


def fit_square(img: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    target = max(1, int(size * scale))
    resized = img.resize((target, target), Image.Resampling.LANCZOS)
    offset = (size - target) // 2
    canvas.paste(resized, (offset, offset), resized if resized.mode == "RGBA" else None)
    return canvas.convert("RGB")


def save_png(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        print(f"Source icon not found: {source}", file=sys.stderr)
        return 1

    img = Image.open(source).convert("RGBA")
    resources = ROOT / "resources"
    resources.mkdir(parents=True, exist_ok=True)
    save_png(resources / "icon.png", fit_square(img, 1024))

    android_res = ROOT / "android" / "app" / "src" / "main" / "res"
    for folder, sizes in ANDROID_DENSITIES.items():
        out_dir = android_res / folder
        launcher = fit_square(img, sizes["launcher"])
        foreground = fit_square(img, sizes["foreground"], scale=0.92)
        save_png(out_dir / "ic_launcher.png", launcher)
        save_png(out_dir / "ic_launcher_round.png", launcher)
        save_png(out_dir / "ic_launcher_foreground.png", foreground)

    public = ROOT / "public"
    icons = public / "icons"
    save_png(icons / "icon-192.png", fit_square(img, 192))
    save_png(icons / "icon-512.png", fit_square(img, 512))
    save_png(icons / "icon-maskable-512.png", fit_square(img, 512, scale=0.8))
    save_png(public / "apple-touch-icon.png", fit_square(img, 180))
    save_png(public / "favicon-32.png", fit_square(img, 32))
    save_png(public / "favicon-16.png", fit_square(img, 16))
    fit_square(img, 32).save(public / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)])

    print(f"Generated icons from {source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
