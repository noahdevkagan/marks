#!/usr/bin/env python3
"""Generate the iOS app icon (1024x1024, no alpha).

Renders at 4x and downsamples with Lanczos for crisp edges.
Usage: python3 scripts/generate-app-icon.py
Requires: pip install pillow
"""
from PIL import Image, ImageDraw, ImageFilter
import os

OUT = os.path.join(
    os.path.dirname(__file__),
    "../ios/Marks/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
)

FINAL = 1024
SS = 4  # supersample factor
S = FINAL * SS

# Brand blues (globals.css --accent family)
GRAD_TOP = (77, 159, 255)   # #4d9fff
GRAD_BOTTOM = (0, 82, 163)  # #0052a3

# Full-bleed diagonal gradient: the ramp is a linear plane, so bilinear
# interpolation of a 2x2 image reproduces it exactly (no banding blocks)
def lerp(t):
    return tuple(round(a + (b - a) * t) for a, b in zip(GRAD_TOP, GRAD_BOTTOM))

grad = Image.new("RGB", (2, 2))
grad.putpixel((0, 0), lerp(0.0))
grad.putpixel((1, 0), lerp(0.25))
grad.putpixel((0, 1), lerp(0.75))
grad.putpixel((1, 1), lerp(1.0))
bg = grad.resize((S, S), Image.BILINEAR)

# Soft radial highlight in the upper area for depth
highlight = Image.new("L", (S, S), 0)
hd = ImageDraw.Draw(highlight)
hd.ellipse([-S * 0.35, -S * 0.55, S * 1.05, S * 0.55], fill=60)
highlight = highlight.filter(ImageFilter.GaussianBlur(S * 0.10))
bg = Image.composite(Image.new("RGB", (S, S), (255, 255, 255)), bg, highlight)

# Bookmark mask: rounded-top rectangle with a notch cut from the bottom
w = 0.46 * S
h = 0.56 * S
cx = S / 2
x0, x1 = cx - w / 2, cx + w / 2
y0 = (S - h) / 2 - 0.01 * S
y1 = y0 + h
r = 0.055 * S
notch = 0.115 * S

mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255,
                     corners=(True, True, False, False))
# extend the notch cut below y1 so the rectangle's bottom row is fully erased
md.polygon([(x0, y1 + SS * 2), (x0, y1), (cx, y1 - notch),
            (x1, y1), (x1, y1 + SS * 2)], fill=0)

# Subtle drop shadow for pop
shadow = mask.filter(ImageFilter.GaussianBlur(S * 0.012))
shadow_layer = Image.new("RGB", (S, S), (0, 40, 90))
offset = Image.new("L", (S, S), 0)
offset.paste(shadow, (0, int(S * 0.012)))
bg = Image.composite(shadow_layer, bg, offset.point(lambda v: v * 0.35))

# White glyph
bg = Image.composite(Image.new("RGB", (S, S), (255, 255, 255)), bg, mask)

icon = bg.resize((FINAL, FINAL), Image.LANCZOS)
icon.save(OUT, "PNG")
print(f"Wrote {os.path.normpath(OUT)} ({FINAL}x{FINAL}, mode={icon.mode})")
