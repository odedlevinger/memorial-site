#!/usr/bin/env python3
"""Generate original black-and-white placeholder photographs for the Memory gallery.

Every image is drawn procedurally (shapes, light, shadow, film grain) from a fixed
seed, so re-running produces identical files. They are stand-ins until real
photographs are uploaded.

Usage: python3 tools/generate_placeholders.py [output_dir]
Default output: apps/web/public/gallery
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1200, 900
PER_GALLERY = 6

Scene = Callable[[random.Random], Image.Image]


def _canvas(tone: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("L", (W, H), tone)
    return img, ImageDraw.Draw(img)


def _vertical_gradient(top: int, bottom: int) -> Image.Image:
    col = np.linspace(top, bottom, H, dtype=np.float32)[:, None]
    return Image.fromarray(np.repeat(col, W, axis=1).astype(np.uint8))


def _figure(d: ImageDraw.ImageDraw, x: float, ground: float, height: float, tone: int,
            rng: random.Random) -> None:
    """A simple standing silhouette: head, coat, legs."""
    head = height * 0.13
    body_w = height * rng.uniform(0.22, 0.3)
    top = ground - height
    d.ellipse([x - head / 2, top, x + head / 2, top + head], fill=tone)
    if rng.random() < 0.4:  # hat brim
        d.rectangle([x - head * 0.75, top + head * 0.15, x + head * 0.75, top + head * 0.28], fill=tone)
    coat_bottom = top + height * 0.68
    d.polygon([(x - body_w * 0.35, top + head), (x + body_w * 0.35, top + head),
               (x + body_w / 2, coat_bottom), (x - body_w / 2, coat_bottom)], fill=tone)
    leg = body_w * 0.12
    stride = rng.uniform(-0.12, 0.12) * height
    d.line([(x - leg, coat_bottom), (x - leg - stride, ground)], fill=tone, width=max(2, int(leg)))
    d.line([(x + leg, coat_bottom), (x + leg + stride, ground)], fill=tone, width=max(2, int(leg)))


def street(rng: random.Random) -> Image.Image:
    img = _vertical_gradient(rng.randint(170, 215), rng.randint(110, 150))
    d = ImageDraw.Draw(img)
    ground = H * rng.uniform(0.66, 0.74)
    x = -rng.randint(0, 80)
    while x < W:  # facades with windows
        bw = rng.randint(120, 260)
        top = rng.randint(40, int(ground * 0.55))
        tone = rng.randint(40, 120)
        d.rectangle([x, top, x + bw, ground], fill=tone)
        for wy in range(top + 25, int(ground) - 60, rng.randint(55, 80)):
            for wx in range(x + 15, x + bw - 30, rng.randint(35, 55)):
                d.rectangle([wx, wy, wx + 18, wy + 30], fill=min(255, tone + rng.randint(30, 90)))
        x += bw + rng.randint(0, 12)
    d.rectangle([0, ground, W, H], fill=rng.randint(120, 160))
    sun = rng.choice([-1, 1])
    for _ in range(rng.randint(2, 6)):
        fx = rng.uniform(80, W - 80)
        fh = rng.uniform(170, 330)
        _figure(d, fx, ground + rng.uniform(10, 120), fh, rng.randint(10, 40), rng)
        # long shadow on the pavement
        gy = ground + rng.uniform(10, 120)
        d.polygon([(fx - 8, gy), (fx + 8, gy), (fx + sun * fh * 1.3 + 20, gy + 40),
                   (fx + sun * fh * 1.3, gy + 46)], fill=60)
    return img


def portrait(rng: random.Random) -> Image.Image:
    img, d = _canvas(rng.randint(15, 45))
    cx, cy = W / 2 + rng.uniform(-150, 150), H * 0.42
    r = rng.uniform(150, 200)
    light = rng.choice([-1, 1])
    shoulders = [(cx - r * 2.4, H), (cx - r * 1.9, cy + r * 1.5), (cx - r * 0.5, cy + r * 1.05),
                 (cx + r * 0.5, cy + r * 1.05), (cx + r * 1.9, cy + r * 1.5), (cx + r * 2.4, H)]
    d.polygon(shoulders, fill=rng.randint(55, 80))
    d.ellipse([cx - r * 0.82, cy - r, cx + r * 0.82, cy + r * 1.05], fill=rng.randint(150, 190))
    d.chord([cx - r * 0.9, cy - r * 1.15, cx + r * 0.9, cy + r * 0.2], 180, 360, fill=rng.randint(20, 50))
    # side lighting: darken the far half of the face
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.rectangle([cx if light > 0 else 0, 0, W if light > 0 else cx, H], fill=110)
    img.paste(Image.new("L", (W, H), 25), mask=mask.filter(ImageFilter.GaussianBlur(70)))
    return img


def light_and_shadow(rng: random.Random) -> Image.Image:
    img, d = _canvas(rng.randint(30, 60))
    cols, rows = rng.randint(2, 4), rng.randint(2, 3)
    skew = rng.uniform(-260, 260)
    x0, y0 = rng.uniform(100, 400), rng.uniform(60, 200)
    pw, ph = rng.uniform(110, 170), rng.uniform(150, 210)
    for c in range(cols):  # window light falling on a wall
        for r_ in range(rows):
            x, y = x0 + c * (pw + 22), y0 + r_ * (ph + 22)
            d.polygon([(x, y), (x + pw, y), (x + pw + skew, y + ph), (x + skew, y + ph)],
                      fill=rng.randint(200, 235))
    if rng.random() < 0.7:
        _figure(d, rng.uniform(300, 900), H * 0.95, rng.uniform(380, 520), 15, rng)
    return img.filter(ImageFilter.GaussianBlur(1.2))


def seaside(rng: random.Random) -> Image.Image:
    horizon = int(H * rng.uniform(0.4, 0.55))
    sky = _vertical_gradient(rng.randint(200, 235), rng.randint(140, 175))
    sea = _vertical_gradient(rng.randint(70, 100), rng.randint(20, 45))
    img = sky.copy()
    img.paste(sea.crop((0, 0, W, H - horizon)), (0, horizon))
    d = ImageDraw.Draw(img)
    for i in range(70):  # wave glints
        y = horizon + (i / 70) ** 1.6 * (H - horizon)
        x = rng.uniform(0, W)
        d.line([(x, y), (x + rng.uniform(20, 120) * (1 + y / H), y)], fill=rng.randint(110, 180), width=2)
    if rng.random() < 0.6:
        _figure(d, rng.uniform(200, 1000), H * 0.93, rng.uniform(200, 300), 12, rng)
    return img


def still_life(rng: random.Random) -> Image.Image:
    img = _vertical_gradient(rng.randint(70, 110), rng.randint(25, 50))
    d = ImageDraw.Draw(img)
    table = H * rng.uniform(0.62, 0.7)
    d.rectangle([0, table, W, H], fill=rng.randint(40, 70))
    x = rng.uniform(200, 330)
    for _ in range(rng.randint(3, 5)):
        kind = rng.choice(["jar", "ball", "cup"])
        tone = rng.randint(120, 220)
        if kind == "jar":
            w, h = rng.uniform(90, 140), rng.uniform(180, 300)
            d.rounded_rectangle([x, table - h, x + w, table], radius=20, fill=tone)
            d.rectangle([x + w * 0.65, table - h + 15, x + w * 0.8, table - 15], fill=min(255, tone + 30))
        elif kind == "ball":
            w = rng.uniform(90, 150)
            d.ellipse([x, table - w, x + w, table], fill=tone)
        else:
            w = rng.uniform(100, 130)
            d.rectangle([x, table - w * 0.8, x + w, table], fill=tone)
            d.arc([x + w * 0.85, table - w * 0.65, x + w * 1.25, table - w * 0.2], 270, 90, fill=tone, width=12)
        d.ellipse([x - 10, table - 8, x + w * 1.4, table + 16], fill=25)
        x += w + rng.uniform(40, 110)
    return img


def family(rng: random.Random) -> Image.Image:
    img = _vertical_gradient(rng.randint(185, 225), rng.randint(130, 165))
    d = ImageDraw.Draw(img)
    ground = H * 0.9
    d.rectangle([0, H * 0.72, W, H], fill=rng.randint(95, 130))
    n = rng.randint(3, 6)
    span = rng.uniform(450, 750)
    start = (W - span) / 2
    for i in range(n):
        h = rng.choice([rng.uniform(380, 470), rng.uniform(220, 300)])
        _figure(d, start + span * i / max(1, n - 1), ground + rng.uniform(-10, 10), h,
                rng.randint(15, 45), rng)
    return img


def _develop(img: Image.Image, rng: random.Random) -> Image.Image:
    """Film look: soften, contrast, vignette, grain."""
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    a = np.asarray(img, dtype=np.float32) / 255.0
    a = np.clip((a - 0.5) * rng.uniform(1.1, 1.35) + 0.5, 0, 1)
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    a *= np.clip(1.05 - 0.45 * dist ** 2, 0.35, 1)
    noise = np.random.default_rng(rng.randint(0, 2**31)).normal(0, 0.045, a.shape)
    a = np.clip(a + noise, 0, 1)
    return Image.fromarray((a * 255).astype(np.uint8))


GALLERIES: list[tuple[str, str, Scene]] = [
    ("streets", "Streets", street),
    ("faces", "Faces", portrait),
    ("light-and-shadow", "Light & Shadow", light_and_shadow),
    ("seaside", "Seaside", seaside),
    ("still-life", "Still Life", still_life),
    ("family", "Family", family),
]


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "apps/web/public/gallery"
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for gi, (slug, title, scene) in enumerate(GALLERIES):
        images = []
        for i in range(PER_GALLERY):
            rng = random.Random(1000 * gi + i)
            img = _develop(scene(rng), rng)
            name = f"{slug}-{i + 1}.jpg"
            img.resize((960, 720), Image.LANCZOS).save(out / name, quality=74, optimize=True, progressive=True)
            images.append(name)
        manifest.append({"slug": slug, "title": title, "images": images})
    (out / "galleries.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {sum(len(g['images']) for g in manifest)} images to {out}")


if __name__ == "__main__":
    main()
