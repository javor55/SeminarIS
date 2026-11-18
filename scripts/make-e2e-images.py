#!/usr/bin/env python3
"""Vygeneruje testovací obrázky pro E2E (e2e/fixtures/). Bez stahování, výstup je deterministický.

  python3 scripts/make-e2e-images.py

- foto-telefon.jpg: velké JPEG 3200×2400 jako z telefonu, s EXIF otočením (orientace 6),
  tedy zobrazené na výšku 2400×3200; plynulý přechod s tvary, takže je soubor malý.
- maly.png: 400×225 s průhledností.
"""
import os
from PIL import Image, ImageDraw

out = os.path.join(os.path.dirname(__file__), "..", "e2e", "fixtures")
os.makedirs(out, exist_ok=True)

W, H = 3200, 2400
img = Image.new("RGB", (W, H))
px = img.load()
for y in range(0, H):
    for x in range(0, W, 4):
        c = (int(255 * x / W), int(255 * y / H), 160)
        for dx in range(4):
            px[x + dx, y] = c
d = ImageDraw.Draw(img)
d.ellipse((W * 0.30, H * 0.25, W * 0.70, H * 0.75), fill=(250, 220, 40), outline=(20, 20, 20), width=24)
d.rectangle((80, 80, 700, 400), fill=(30, 60, 160))
exif = Image.Exif()
exif[0x0112] = 6  # otočit o 90° po směru hodinových ručiček při zobrazení
img.save(os.path.join(out, "foto-telefon.jpg"), "JPEG", quality=72, exif=exif)

png = Image.new("RGBA", (400, 225), (0, 0, 0, 0))
pd = ImageDraw.Draw(png)
pd.rectangle((0, 0, 399, 224), fill=(40, 120, 200, 255))
pd.ellipse((150, 50, 250, 175), fill=(255, 255, 255, 255))
png.save(os.path.join(out, "maly.png"), "PNG", optimize=True)
