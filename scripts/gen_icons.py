#!/usr/bin/env python3
"""Generate favicon.png, og-image.png for Faktox."""
from PIL import Image, ImageDraw, ImageFont

# Colors
BG = (10, 10, 10)
FG = (245, 245, 245)
ACCENT = (232, 164, 140)
GRAY = (112, 112, 112)
GRAY2 = (176, 176, 176)

# ── Favicon 32x32 ──────────────────────────────────────
fav = Image.new("RGB", (64, 64), BG)
d = ImageDraw.Draw(fav)
# Document outline
d.rectangle([14, 8, 50, 56], outline=ACCENT, width=3)
# Lines
d.line([20, 18, 44, 18], fill=ACCENT, width=2)
d.line([20, 26, 44, 26], fill=ACCENT, width=2)
d.line([20, 34, 38, 34], fill=ACCENT, width=2)
# Checkmark
d.line([(22, 48), (28, 54)], fill=ACCENT, width=3)
d.line([(28, 54), (44, 38)], fill=ACCENT, width=3)
fav.save("/opt/data/rechnung-saas/public/favicon.png")
print("favicon.png saved (64x64)")

# ── OG-Image 1200x630 ──────────────────────────────────
og = Image.new("RGB", (1200, 630), BG)
d = ImageDraw.Draw(og)

# Top accent line
d.rectangle([0, 0, 1200, 4], fill=ACCENT)

# Document icon (simplified)
icon_x, icon_y = 100, 170
d.rectangle([icon_x, icon_y, icon_x+80, icon_y+100], outline=ACCENT, width=3)
d.line([icon_x+14, icon_y+22, icon_x+66, icon_y+22], fill=ACCENT, width=2)
d.line([icon_x+14, icon_y+38, icon_x+66, icon_y+38], fill=ACCENT, width=2)
d.line([icon_x+14, icon_y+54, icon_x+50, icon_y+54], fill=ACCENT, width=2)
d.line([(icon_x+16, icon_y+78), (icon_x+30, icon_y+92)], fill=ACCENT, width=4)
d.line([(icon_x+30, icon_y+92), (icon_x+54, icon_y+68)], fill=ACCENT, width=4)

# Brand text — "Faktox." in large mono
try:
    font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 64)
    font_mid = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 28)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
    font_stat = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 32)
    font_label = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 18)
    font_footer = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 16)
except:
    font_big = ImageFont.load_default()
    font_mid = ImageFont.load_default()
    font_small = ImageFont.load_default()
    font_stat = ImageFont.load_default()
    font_label = ImageFont.load_default()
    font_footer = ImageFont.load_default()

# Faktox.
d.text((210, 175), "Faktox", fill=FG, font=font_big)
# Measure "Faktox" width to place the dot
bbox = d.textbbox((210, 175), "Faktox", font=font_big)
dot_x = bbox[2] + 2
d.text((dot_x, 175), ".", fill=ACCENT, font=font_big)

# Tagline
d.text((210, 260), "Rechnungen + Buchhaltung mit KI", fill=GRAY, font=font_mid)
d.text((210, 305), "DACH-konform. Foto machen, fertig.", fill=GRAY2, font=font_small)

# Accent line
d.rectangle([100, 390, 300, 392], fill=ACCENT)

# Stats
d.text((100, 430), "30 Sek.", fill=ACCENT, font=font_stat)
d.text((260, 442), "BIS ZUR FERTIGEN RECHNUNG", fill=GRAY, font=font_label)

d.text((100, 480), "100%", fill=ACCENT, font=font_stat)
d.text((220, 492), "AT & DE KONFORM (USTG)", fill=GRAY, font=font_label)

# Footer
d.text((100, 570), "faktox.online", fill=(64, 64, 64), font=font_footer)

og.save("/opt/data/rechnung-saas/public/og-image.png", "PNG")
print("og-image.png saved (1200x630)")

# ── Favicon 16x16 (smaller variant) ────────────────────
fav16 = fav.resize((16, 16), Image.Resampling.LANCZOS)
fav16.save("/opt/data/rechnung-saas/public/favicon-16.png")
print("favicon-16.png saved (16x16)")

fav32 = fav.resize((32, 32), Image.Resampling.LANCZOS)
fav32.save("/opt/data/rechnung-saas/public/favicon-32.png")
print("favicon-32.png saved (32x32)")

fav180 = fav.resize((180, 180), Image.Resampling.LANCZOS)
fav180.save("/opt/data/rechnung-saas/public/apple-touch-icon.png")
print("apple-touch-icon.png saved (180x180)")
