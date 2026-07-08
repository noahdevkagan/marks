#!/usr/bin/env python3
"""Generate captioned App Store screenshots from raw simulator captures.

Reads raw captures from ios/fastlane/screenshots-src/, writes framed
1320x2868 marketing screenshots to ios/fastlane/screenshots/en-US/.

Usage: python3 scripts/frame-screenshots.py
Requires: pip install pillow
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "ios/fastlane/screenshots-src")
OUT = os.path.join(ROOT, "ios/fastlane/screenshots/en-US")

W, H = 1320, 2868  # 6.9" display size, must match the raw captures
GRAD_TOP = (77, 159, 255)   # brand blues (globals.css --accent family)
GRAD_BOTTOM = (0, 82, 163)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# (source file, output name, caption lines, pixels to crop off the top)
SHOTS = [
    (
        "Simulator Screenshot - iPhone 17 Pro Max - 2026-03-12 at 15.33.20.png",
        "01_library.png",
        ["All your bookmarks,", "one private library"],
        0,
    ),
    (
        "Simulator Screenshot - iPhone 17 Pro Max - 2026-03-12 at 15.34.14.png",
        "02_reader.png",
        ["A clean reader view.", "No ads, no popups"],
        0,
    ),
    (
        "Simulator Screenshot - iPhone 17 Pro Max - 2026-03-12 at 15.34.44.png",
        "03_save.png",
        ["Save from any app", "in two taps"],
        0,
    ),
    (
        "Simulator Screenshot - iPhone 17 Pro Max - 2026-03-12 at 15.33.40.png",
        "04_tags.png",
        ["Tags keep thousands", "of saves findable"],
        # Crop the overscrolled rows at the top (real user data)
        330,
    ),
]

CAPTION_TOP = 130
CAPTION_SIZE = 96
CAPTION_LINE_GAP = 28
SHOT_TOP = 470  # where the device screenshot starts; it bleeds off the bottom
CORNER_RADIUS = 70


def gradient_bg() -> Image.Image:
    grad = Image.new("RGB", (2, 2))
    def lerp(t):
        return tuple(round(a + (b - a) * t) for a, b in zip(GRAD_TOP, GRAD_BOTTOM))
    grad.putpixel((0, 0), lerp(0.0))
    grad.putpixel((1, 0), lerp(0.25))
    grad.putpixel((0, 1), lerp(0.75))
    grad.putpixel((1, 1), lerp(1.0))
    return grad.resize((W, H), Image.BILINEAR)


def frame(src_name, out_name, caption, crop_top):
    shot = Image.open(os.path.join(SRC, src_name)).convert("RGB")
    if crop_top:
        shot = shot.crop((0, crop_top, shot.width, shot.height))

    canvas = gradient_bg()
    draw = ImageDraw.Draw(canvas)

    font = ImageFont.truetype(FONT, CAPTION_SIZE)
    y = CAPTION_TOP
    for line in caption:
        w = draw.textlength(line, font=font)
        draw.text(((W - w) / 2, y), line, font=font, fill=(255, 255, 255))
        y += CAPTION_SIZE + CAPTION_LINE_GAP

    # Scale the shot to fill the remaining height, bleeding off the bottom
    scale = (W * 0.86) / shot.width
    sw, sh = round(shot.width * scale), round(shot.height * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    x = (W - sw) // 2

    # Rounded corners via mask, plus a soft shadow
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, sw, sh], radius=CORNER_RADIUS, fill=255
    )

    shadow = Image.new("L", (W, H), 0)
    shadow.paste(mask, (x, SHOT_TOP + 14))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas = Image.composite(Image.new("RGB", (W, H), (0, 30, 70)), canvas,
                             shadow.point(lambda v: v * 0.45))

    canvas.paste(shot, (x, SHOT_TOP), mask)
    canvas.save(os.path.join(OUT, out_name), "PNG")
    print(f"{out_name}: {canvas.size}")


os.makedirs(OUT, exist_ok=True)
for args in SHOTS:
    frame(*args)
