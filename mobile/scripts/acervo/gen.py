"""
Arte de teste do acervo do Puxa: pacotes de figurinhas originais desenhados por código
(texto, bolinhas, gatinhos, nordeste, bom dia, amor, trabalho, festa, Puxa e animadas),
avatares e capas de perfil. Tudo dentro das regras do WhatsApp: 512x512, WebP, até 100 KB
(parada) e 500 KB (animada), margem de 16.

Uso: python3 scripts/acervo/gen.py .   (na pasta do app)
Saída: assets/acervo/... e src/community/art.ts (o mapa de require para o Metro).
"""
import io
import math
import os
import random
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

APP = sys.argv[1]
OUT = os.path.join(APP, 'assets', 'acervo')
FONTS = os.path.join(APP, 'node_modules', '@expo-google-fonts')
MARK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mark-path.txt')).read().strip()

S = 1024  # desenha em dobro e reduz: bordas lisas
INK = (21, 22, 26, 255)
WHITE = (255, 255, 255, 255)


def font(pkg, weight, name, size):
    return ImageFont.truetype(os.path.join(FONTS, pkg, weight, name), size)


F = {
    'anton': lambda s: font('anton', '400Regular', 'Anton_400Regular.ttf', s),
    'bangers': lambda s: font('bangers', '400Regular', 'Bangers_400Regular.ttf', s),
    'pacifico': lambda s: font('pacifico', '400Regular', 'Pacifico_400Regular.ttf', s),
    'marker': lambda s: font('permanent-marker', '400Regular', 'PermanentMarker_400Regular.ttf', s),
    'fredoka': lambda s: font('fredoka', '700Bold', 'Fredoka_700Bold.ttf', s),
    'archivo': lambda s: font('archivo', '800ExtraBold', 'Archivo_800ExtraBold.ttf', s),
    'caveat': lambda s: font('caveat', '700Bold', 'Caveat_700Bold.ttf', s),
}


def hexa(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def darker(c, f=0.72):
    return tuple(int(v * f) for v in c[:3]) + (255,)


def lighter(c, f=0.35):
    return tuple(int(v + (255 - v) * f) for v in c[:3]) + (255,)


def canvas():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


# ---------- Borda de recorte (o "adesivo") ----------

def diecut(layer, border=26, shadow=True):
    """Borda branca em volta do desenho, com uma sombra leve: o jeito de figurinha recortada."""
    a = layer.getchannel('A')
    grown = a.filter(ImageFilter.GaussianBlur(border * 0.55)).point(lambda v: 255 if v > 10 else 0)
    grown = grown.filter(ImageFilter.GaussianBlur(1.6))
    base = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    if shadow:
        sh = Image.new('RGBA', layer.size, (0, 0, 0, 0))
        sh.putalpha(grown.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * 0.28)))
        base.alpha_composite(sh, (0, 8))
    white = Image.new('RGBA', layer.size, WHITE)
    white.putalpha(grown)
    base.alpha_composite(white)
    base.alpha_composite(layer)
    return base


def fit(img, margin=32):
    """Encaixa o desenho no quadro de 512 com a margem do WhatsApp (16 em 512)."""
    box = img.getchannel('A').point(lambda v: 255 if v > 4 else 0).getbbox()
    if box:
        img = img.crop(box)
    w, h = img.size
    k = min((S - 2 * margin) / w, (S - 2 * margin) / h, 1.6)
    img = img.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    out = canvas()
    out.alpha_composite(img, ((S - img.width) // 2, (S - img.height) // 2))
    return out.resize((512, 512), Image.LANCZOS)


# ---------- Formas ----------

def heart_points(cx, cy, r, steps=120):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * r / 17, cy - y * r / 17))
    return pts


def star_points(cx, cy, r, inner=0.45, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        rr = r if i % 2 == 0 else r * inner
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def heart(d, cx, cy, r, fill, outline=INK, width=18):
    pts = heart_points(cx, cy, r)
    d.polygon(pts, fill=fill)
    if outline:
        d.line(pts + [pts[0]], fill=outline, width=width, joint='curve')


def thick_arc(d, box, start, end, fill, width):
    d.arc(box, start, end, fill=fill, width=width)
    # Pontas arredondadas
    (x0, y0, x1, y1) = box
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - width / 2, (y1 - y0) / 2 - width / 2
    for a in (start, end):
        px, py = cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a))
        d.ellipse((px - width / 2, py - width / 2, px + width / 2, py + width / 2), fill=fill)


def rounded_line(d, pts, fill, width):
    d.line(pts, fill=fill, width=width, joint='curve')
    for p in (pts[0], pts[-1]):
        d.ellipse((p[0] - width / 2, p[1] - width / 2, p[0] + width / 2, p[1] + width / 2), fill=fill)


# ---------- Texto ----------

def text_layer(lines, face, fill, stroke=INK, max_w=900, max_size=330, stroke_k=0.075, gap=0.02, rotate=0, shadow_color=None):
    """Linhas centralizadas, do maior tamanho que cabe, com contorno grosso."""
    size = max_size
    while size > 40:
        f = F[face](size)
        sw = max(6, int(size * stroke_k))
        boxes = [f.getbbox(l, stroke_width=sw) for l in lines]
        widths = [b[2] - b[0] for b in boxes]
        heights = [b[3] - b[1] for b in boxes]
        total = sum(heights) + gap * size * (len(lines) - 1)
        if max(widths) <= max_w and total <= 860:
            break
        size -= 8
    img = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = S - total / 2
    for l, b, h in zip(lines, boxes, heights):
        w = b[2] - b[0]
        x = S - w / 2 - b[0]
        fills = fill if isinstance(fill, list) else [fill]
        fc = fills[lines.index(l) % len(fills)]
        if shadow_color:
            d.text((x + sw * 0.9, y - b[1] + sw * 0.9), l, font=f, fill=shadow_color, stroke_width=sw, stroke_fill=shadow_color)
        d.text((x, y - b[1]), l, font=f, fill=fc, stroke_width=sw, stroke_fill=stroke)
        y += h + gap * size
    if rotate:
        img = img.rotate(rotate, resample=Image.BICUBIC)
    box = img.getbbox()
    return img.crop(box)


def compose(*parts):
    """Junta camadas (imagem, x, y) num quadro grande e devolve recortado."""
    big = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))
    for img, x, y in parts:
        big.alpha_composite(img, (int(x), int(y)))
    box = big.getbbox()
    return big.crop(box)


def text_sticker(lines, face='anton', fill=WHITE, rotate=0, **kw):
    return fit(diecut(pad(text_layer(lines, face, fill, rotate=rotate, **kw))))


def pad(img, p=80):
    out = Image.new('RGBA', (img.width + 2 * p, img.height + 2 * p), (0, 0, 0, 0))
    out.alpha_composite(img, (p, p))
    return out


# ---------- Bolinhas (rostos) ----------

def blob_body(color, squash=1.0, cx=512, cy=540, r=360):
    img = canvas()
    d = ImageDraw.Draw(img)
    rx, ry = r * (2 - squash) ** 0.5, r * squash ** 0.5
    box = (cx - rx, cy - ry, cx + rx, cy + ry)
    d.ellipse(box, fill=color)
    # Sombra embaixo e brilho em cima: volume sem gradiente
    shade = canvas()
    ImageDraw.Draw(shade).ellipse((cx - rx + 70, cy - ry + 110, cx + rx + 90, cy + ry + 90), fill=darker(color, 0.86))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    inv = canvas()
    inv.paste(shade, (0, 0), ImageChops.multiply(mask, shade.getchannel('A')))
    body = canvas()
    ImageDraw.Draw(body).ellipse(box, fill=color)
    hl = canvas()
    ImageDraw.Draw(hl).ellipse((cx - rx * 0.62, cy - ry * 0.78, cx - rx * 0.12, cy - ry * 0.42), fill=(255, 255, 255, 90))
    out = canvas()
    out.alpha_composite(body)
    # A sombra entra por fora da parte de cima: lado de baixo mais escuro
    crescent = canvas()
    cm = ImageChops.subtract(mask, _ellipse_mask((cx - rx - 40, cy - ry - 70, cx + rx - 50, cy + ry - 60)))
    crescent.paste(Image.new('RGBA', (S, S), darker(color, 0.85)), (0, 0), cm)
    out.alpha_composite(crescent)
    out.alpha_composite(hl)
    ImageDraw.Draw(out).ellipse(box, outline=darker(color, 0.45), width=22)
    return out, (cx, cy, rx, ry)


def _ellipse_mask(box):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m


FACE = (52, 36, 30, 255)


def eyes_dots(d, cx, cy, rx, ry, dy=-60, sp=0.36, r=42, look=(0, 0)):
    for s in (-1, 1):
        x, y = cx + s * rx * sp + look[0], cy + dy + look[1]
        d.ellipse((x - r * 0.8, y - r, x + r * 0.8, y + r), fill=FACE)
        d.ellipse((x - r * 0.32 + 10, y - r * 0.62, x + r * 0.12 + 10, y - r * 0.18), fill=WHITE)


def blob_face(color, mood, squash=1.0, blink=False):
    img, (cx, cy, rx, ry) = blob_body(color, squash)
    d = ImageDraw.Draw(img)
    cheek = (255, 120, 120, 110)
    if mood in ('feliz', 'apaixonado', 'piscando', 'rindo'):
        for s in (-1, 1):
            x = cx + s * rx * 0.58
            d.ellipse((x - 54, cy + 30, x + 54, cy + 76), fill=cheek)
    if blink or mood == 'sono':
        for s in (-1, 1):
            x = cx + s * rx * 0.36
            thick_arc(d, (x - 52, cy - 100, x + 52, cy - 20), 20, 160, FACE, 20)
    elif mood == 'feliz':
        eyes_dots(d, cx, cy, rx, ry)
    elif mood == 'rindo':
        for s in (-1, 1):
            x = cx + s * rx * 0.36
            thick_arc(d, (x - 56, cy - 120, x + 56, cy - 30), 200, 340, FACE, 22)
        for s in (-1, 1):  # lágrimas de rir
            x = cx + s * rx * 0.62
            d.ellipse((x - 26, cy - 50, x + 26, cy + 10), fill=(110, 190, 255, 255))
            d.polygon([(x - 24, cy - 34), (x + 24, cy - 34), (x, cy - 92)], fill=(110, 190, 255, 255))
    elif mood == 'chorando':
        for s in (-1, 1):
            x = cx + s * rx * 0.36
            thick_arc(d, (x - 50, cy - 70, x + 50, cy + 10), 200, 340, FACE, 20)
            d.rounded_rectangle((x - 22, cy - 20, x + 22, cy + 210), radius=22, fill=(110, 190, 255, 230))
            rounded_line(d, [(x - s * 60, cy - 150), (x + s * 40, cy - 120)], FACE, 18)
    elif mood == 'bravo':
        eyes_dots(d, cx, cy, rx, ry, dy=-40, r=36)
        for s in (-1, 1):
            x = cx + s * rx * 0.36
            rounded_line(d, [(x - s * 70, cy - 150), (x + s * 60, cy - 100)], FACE, 24)
    elif mood == 'apaixonado':
        for s in (-1, 1):
            heart(d, cx + s * rx * 0.36, cy - 60, 70, (234, 51, 80, 255), outline=None)
    elif mood == 'chocado':
        for s in (-1, 1):
            x = cx + s * rx * 0.36
            d.ellipse((x - 62, cy - 140, x + 62, cy - 16), fill=WHITE, outline=FACE, width=14)
            d.ellipse((x - 24, cy - 96, x + 24, cy - 48), fill=FACE)
    elif mood == 'descolado':
        d.rounded_rectangle((cx - rx * 0.78, cy - 130, cx - 30, cy - 20), radius=40, fill=INK)
        d.rounded_rectangle((cx + 30, cy - 130, cx + rx * 0.78, cy - 20), radius=40, fill=INK)
        d.rectangle((cx - 40, cy - 110, cx + 40, cy - 90), fill=INK)
        d.line((cx - rx * 0.6, cy - 110, cx - rx * 0.45, cy - 60), fill=(255, 255, 255, 150), width=14)
    elif mood == 'pensando':
        eyes_dots(d, cx, cy, rx, ry, look=(26, -24))
    elif mood == 'piscando':
        x = cx - rx * 0.36
        thick_arc(d, (x - 52, cy - 100, x + 52, cy - 20), 200, 340, FACE, 20)
        eyes_dots_one(d, cx + rx * 0.36, cy - 60)
    # Boca
    if mood in ('feliz', 'piscando', 'descolado', 'apaixonado'):
        w = 120 if mood != 'descolado' else 90
        thick_arc(d, (cx - w, cy - 10 if mood != 'descolado' else cy + 10, cx + w if mood != 'descolado' else cx + w + 40, cy + 150), 20, 160, FACE, 22)
    elif mood == 'rindo':
        d.chord((cx - 150, cy - 30, cx + 150, cy + 230), 0, 180, fill=FACE)
        d.chord((cx - 80, cy + 120, cx + 80, cy + 230), 0, 180, fill=(234, 90, 110, 255))
    elif mood in ('chorando', 'bravo'):
        thick_arc(d, (cx - 100, cy + 70, cx + 100, cy + 230), 200, 340, FACE, 22)
    elif mood == 'chocado':
        d.ellipse((cx - 56, cy + 60, cx + 56, cy + 190), fill=FACE)
    elif mood == 'sono':
        d.ellipse((cx - 34, cy + 80, cx + 34, cy + 140), fill=FACE)
    elif mood == 'pensando':
        rounded_line(d, [(cx - 60, cy + 110), (cx + 70, cy + 90)], FACE, 22)
    return img


def eyes_dots_one(d, x, y, r=42):
    d.ellipse((x - r * 0.8, y - r, x + r * 0.8, y + r), fill=FACE)
    d.ellipse((x - r * 0.32 + 10, y - r * 0.62, x + r * 0.12 + 10, y - r * 0.18), fill=WHITE)


def with_extra(img, extra):
    """Coloca um enfeite (Zzz, ?, corações) por cima, fora do rosto."""
    d = ImageDraw.Draw(img)
    if extra == 'zzz':
        f = F['bangers'](150)
        for i, (x, y, k) in enumerate([(700, 220, 1), (800, 110, 0.75), (880, 30, 0.55)]):
            ff = F['bangers'](int(150 * k))
            d.text((x, y), 'Z', font=ff, fill=WHITE, stroke_width=int(14 * k), stroke_fill=INK)
    if extra == '?':
        f = F['bangers'](300)
        d.text((760, 40), '?', font=f, fill=(255, 214, 10, 255), stroke_width=20, stroke_fill=INK)
    if extra == 'hearts':
        heart(d, 830, 170, 70, (234, 51, 80, 255), width=12)
        heart(d, 160, 230, 50, (255, 120, 150, 255), width=10)
    return img


def blob_sticker(color, mood, extra=None):
    big = Image.new('RGBA', (S + 200, S + 200), (0, 0, 0, 0))
    face = with_extra(blob_face(color, mood), extra)
    big.alpha_composite(face, (100, 100))
    return fit(diecut(big))


# ---------- Gatinhos ----------

def cat(color, mood, muzzle=None):
    img = canvas()
    d = ImageDraw.Draw(img)
    dark = darker(color, 0.5)
    pink = (255, 150, 170, 255)
    cx, cy = 512, 580
    for s in (-1, 1):  # orelhas
        outer = [(cx + s * 330, cy - 100), (cx + s * 300, cy - 420), (cx + s * 100, cy - 250)]
        inner = [(cx + s * 290, cy - 150), (cx + s * 280, cy - 340), (cx + s * 150, cy - 240)]
        d.polygon(outer, fill=color)
        d.line(outer + [outer[0]], fill=dark, width=20, joint='curve')
        d.polygon(inner, fill=pink)
    d.ellipse((cx - 380, cy - 320, cx + 380, cy + 300), fill=color, outline=dark, width=22)
    if muzzle:
        d.ellipse((cx - 170, cy + 10, cx + 170, cy + 250), fill=muzzle)
    # olhos
    if mood in ('feliz', 'apaixonado_n'):
        for s in (-1, 1):
            x = cx + s * 150
            d.ellipse((x - 46, cy - 120, x + 46, cy - 10), fill=FACE)
            d.ellipse((x - 16, cy - 100, x + 8, cy - 74), fill=WHITE)
    elif mood == 'dormindo':
        for s in (-1, 1):
            x = cx + s * 150
            thick_arc(d, (x - 60, cy - 110, x + 60, cy - 20), 20, 160, FACE, 18)
    elif mood == 'bravo':
        for s in (-1, 1):
            x = cx + s * 150
            d.ellipse((x - 40, cy - 90, x + 40, cy - 20), fill=FACE)
            rounded_line(d, [(x - s * 80, cy - 170), (x + s * 50, cy - 110)], FACE, 22)
    elif mood == 'surpreso':
        for s in (-1, 1):
            x = cx + s * 150
            d.ellipse((x - 70, cy - 150, x + 70, cy + 10), fill=(250, 220, 90, 255), outline=FACE, width=14)
            d.ellipse((x - 16, cy - 120, x + 16, cy - 20), fill=FACE)
    elif mood == 'apaixonado':
        for s in (-1, 1):
            heart(d, cx + s * 150, cy - 60, 70, (234, 51, 80, 255), outline=None)
    elif mood == 'piscando':
        thick_arc(d, (cx - 210, cy - 110, cx - 90, cy - 20), 200, 340, FACE, 18)
        d.ellipse((cx + 104, cy - 120, cx + 196, cy - 10), fill=FACE)
    # nariz e boca
    d.polygon([(cx - 34, cy + 40), (cx + 34, cy + 40), (cx, cy + 80)], fill=pink)
    if mood == 'surpreso':
        d.ellipse((cx - 36, cy + 100, cx + 36, cy + 180), fill=FACE)
    elif mood == 'bravo':
        thick_arc(d, (cx - 80, cy + 110, cx + 80, cy + 220), 200, 340, FACE, 16)
    else:
        thick_arc(d, (cx - 80, cy + 50, cx, cy + 130), 10, 170, FACE, 16)
        thick_arc(d, (cx, cy + 50, cx + 80, cy + 130), 10, 170, FACE, 16)
    for s in (-1, 1):  # bigodes
        for k, dy in enumerate((-10, 30, 70)):
            rounded_line(d, [(cx + s * 230, cy + 60 + dy * 0.6), (cx + s * 420, cy + 20 + dy * 1.3)], dark, 10)
    return img


def cat_sticker(color, mood, muzzle=None, extra=None, label=None):
    big = Image.new('RGBA', (S + 300, S + 520), (0, 0, 0, 0))
    big.alpha_composite(with_extra(cat(color, mood, muzzle), extra), (150, 60))
    if label:
        t = text_layer([label], 'bangers', WHITE, max_w=900, max_size=340, shadow_color=INK)
        big.alpha_composite(t, ((big.width - t.width) // 2, 60 + 880 - 60))
    return fit(diecut(big))


# ---------- Desenhos de apoio ----------

def sun(d, cx, cy, r, color=(255, 196, 0, 255)):
    for i in range(12):
        a = math.radians(i * 30)
        p = [(cx + math.cos(a - 0.12) * r * 1.15, cy + math.sin(a - 0.12) * r * 1.15),
             (cx + math.cos(a) * r * 1.7, cy + math.sin(a) * r * 1.7),
             (cx + math.cos(a + 0.12) * r * 1.15, cy + math.sin(a + 0.12) * r * 1.15)]
        d.polygon(p, fill=(255, 150, 0, 255))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color, outline=(230, 120, 0, 255), width=14)


def moon(img, cx, cy, r, color=(255, 230, 120, 255)):
    m = _ellipse_mask((cx - r, cy - r, cx + r, cy + r))
    cut = _ellipse_mask((cx - r + r * 0.55, cy - r - r * 0.2, cx + r + r * 0.55, cy + r - r * 0.2))
    cres = ImageChops.subtract(m, cut)
    layer = Image.new('RGBA', (S, S), color)
    img.paste(layer, (0, 0), cres)


def cup(d, cx, cy):
    brown = (120, 72, 40, 255)
    d.rounded_rectangle((cx - 170, cy - 120, cx + 140, cy + 170), radius=60, fill=WHITE, outline=INK, width=18)
    d.ellipse((cx + 90, cy - 50, cx + 250, cy + 100), outline=INK, width=26)
    d.ellipse((cx - 150, cy - 140, cx + 120, cy - 90), fill=brown, outline=INK, width=14)
    for i, x in enumerate((cx - 80, cx, cx + 80)):
        pts = [(x, cy - 170 - k * 26 + (12 if (k + i) % 2 else -12)) for k in range(6)]
        pts = [(x + 26 * math.sin(k * 1.2 + i), cy - 180 - k * 26) for k in range(7)]
        rounded_line(d, pts, (190, 190, 200, 255), 14)


def balloon(d, cx, cy, r, color):
    d.line([(cx, cy + r * 1.2), (cx - 30, cy + r * 1.8), (cx + 20, cy + r * 2.4)], fill=INK, width=8, joint='curve')
    d.polygon([(cx - 22, cy + r * 1.22), (cx + 22, cy + r * 1.22), (cx, cy + r * 1.08)], fill=darker(color, 0.8))
    d.ellipse((cx - r, cy - r * 1.2, cx + r, cy + r * 1.2), fill=color, outline=darker(color, 0.55), width=12)
    d.ellipse((cx - r * 0.55, cy - r * 0.9, cx - r * 0.2, cy - r * 0.35), fill=(255, 255, 255, 110))


def confetti(d, seed, n=40, area=(80, 80, 944, 944)):
    rnd = random.Random(seed)
    cols = [(255, 214, 10, 255), (43, 75, 255, 255), (234, 51, 80, 255), (13, 134, 88, 255), (109, 53, 224, 255)]
    for _ in range(n):
        x, y = rnd.uniform(area[0], area[2]), rnd.uniform(area[1], area[3])
        w, h, a = rnd.uniform(16, 34), rnd.uniform(36, 60), rnd.uniform(0, math.pi)
        pts = [(x + math.cos(a) * dx - math.sin(a) * dy, y + math.sin(a) * dx + math.cos(a) * dy) for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        d.polygon(pts, fill=rnd.choice(cols))


def check(d, cx, cy, r, color=(13, 134, 88, 255)):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color, outline=darker(color, 0.6), width=16)
    rounded_line(d, [(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.36)], WHITE, int(r * 0.2))


def drawing_with_text(draw_fn, lines, face='anton', fill=WHITE, text_k=0.5, above=False, size=(S, S), **kw):
    art = Image.new('RGBA', size, (0, 0, 0, 0))
    draw_fn(art, ImageDraw.Draw(art))
    art = art.crop(art.getbbox())
    t = text_layer(lines, face, fill, **kw)
    k = max((art.width * 1.1) / max(t.width, 1), (art.height * 0.42) / max(t.height, 1))
    k = min(k, (art.width * 1.5) / max(t.width, 1))
    t = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS)
    w = max(art.width, t.width)
    h = art.height + t.height - 60
    big = Image.new('RGBA', (w + 200, h + 200), (0, 0, 0, 0))
    if above:
        big.alpha_composite(t, ((big.width - t.width) // 2, 100))
        big.alpha_composite(art, ((big.width - art.width) // 2, 100 + t.height - 60))
    else:
        big.alpha_composite(art, ((big.width - art.width) // 2, 100))
        big.alpha_composite(t, ((big.width - t.width) // 2, 100 + art.height - 60))
    return fit(diecut(big))


# ---------- O símbolo do Puxa ----------

def mark_layer(color, height=700):
    """O P do Puxa desenhado a partir do contorno da fonte (unidades da fonte, y para cima)."""
    subpaths, cur, pt = [], [], (0, 0)
    tokens = re.findall(r'[MLHVQZ]|-?\d+(?:\.\d+)?', MARK)
    i, cmd = 0, None
    def num():
        nonlocal i
        v = float(tokens[i]); i += 1
        return v
    while i < len(tokens):
        t = tokens[i]
        if re.match(r'[MLHVQZ]', t):
            cmd = t; i += 1
            if cmd == 'Z':
                subpaths.append(cur); cur = []
                continue
        if cmd == 'M':
            pt = (num(), num()); cur = [pt]
        elif cmd == 'L':
            pt = (num(), num()); cur.append(pt)
        elif cmd == 'H':
            pt = (num(), pt[1]); cur.append(pt)
        elif cmd == 'V':
            pt = (pt[0], num()); cur.append(pt)
        elif cmd == 'Q':
            c1 = (num(), num()); p2 = (num(), num())
            for k in range(1, 13):
                u = k / 12
                cur.append(((1 - u) ** 2 * pt[0] + 2 * (1 - u) * u * c1[0] + u * u * p2[0], (1 - u) ** 2 * pt[1] + 2 * (1 - u) * u * c1[1] + u * u * p2[1]))
            pt = p2
    x0, x1, y1 = -232, 934, 1760
    k = height / y1
    w = int((x1 - x0) * k) + 40
    mask = Image.new('L', (w, height + 40), 0)
    for sp in subpaths:
        m = Image.new('L', mask.size, 0)
        ImageDraw.Draw(m).polygon([((x - x0) * k + 20, (y1 - y) * k + 20) for x, y in sp], fill=255)
        mask = ImageChops.logical_xor(mask.convert('1'), m.convert('1')).convert('L')
    layer = Image.new('RGBA', mask.size, color)
    layer.putalpha(mask)
    return layer


def puxa_sticker(color, lines=None, face='anton', fill=WHITE):
    m = mark_layer(color, 620 if lines else 820)
    plate = Image.new('RGBA', (m.width + 120, m.height + 120), (0, 0, 0, 0))
    plate.alpha_composite(m, (60, 60))
    if not lines:
        return fit(diecut(plate))
    t = text_layer(lines, face, fill, max_w=900)
    big = Image.new('RGBA', (max(plate.width, t.width) + 160, plate.height + t.height + 80), (0, 0, 0, 0))
    big.alpha_composite(plate, ((big.width - plate.width) // 2, 40))
    big.alpha_composite(t, ((big.width - t.width) // 2, plate.height - 20))
    return fit(diecut(big))


# ---------- Saída ----------

PALETA = {
    'amarelo': hexa('#FFC93C'), 'rosa': hexa('#FF7EB3'), 'azul': hexa('#5B8CFF'), 'verde': hexa('#4CD08A'),
    'laranja': hexa('#FF9F43'), 'roxo': hexa('#A47BFF'), 'menta': hexa('#5CE1C6'), 'coral': hexa('#FF6B6B'),
}

written = []  # (chave, caminho relativo a assets)


def save_still(img, pack, name):
    d = os.path.join(OUT, pack)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f'{name}.webp')
    for q in (88, 80, 72, 64, 56):
        img.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) < 96_000:
            break
    assert img.size == (512, 512)
    written.append((f'{pack}/{name}', f'acervo/{pack}/{name}.webp'))


def fit_frames(bigs, margin=32):
    """Encaixa quadros grandes no 512 com a mesma escala e posição (sem a figura pular de tamanho)."""
    box = None
    for b in bigs:
        bb = b.getchannel('A').point(lambda v: 255 if v > 4 else 0).getbbox()
        box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    w, h = box[2] - box[0], box[3] - box[1]
    k = min((S - 2 * margin) / w, (S - 2 * margin) / h)
    out = []
    for b in bigs:
        c = b.crop(box).resize((int(w * k), int(h * k)), Image.LANCZOS)
        f = canvas()
        f.alpha_composite(c, ((S - c.width) // 2, (S - c.height) // 2))
        out.append(f.resize((512, 512), Image.LANCZOS))
    return out


def save_animated(frames, durations, pack, name):
    d = os.path.join(OUT, pack)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f'{name}.webp')
    for q in (75, 65, 55, 45):
        frames[0].save(path, 'WEBP', save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=q, method=4)
        if os.path.getsize(path) < 480_000:
            break
    assert os.path.getsize(path) < 500_000, (name, os.path.getsize(path))
    assert sum(durations if isinstance(durations, list) else [durations] * len(frames)) <= 10_000
    # Primeiro quadro em PNG: vira o ícone do pacote na bandeja do WhatsApp
    # (outro nome: no Android, o .webp e o .png com o mesmo nome viram o mesmo recurso)
    frames[0].save(os.path.join(d, f'{name}-quadro.png'))
    written.append((f'{pack}/{name}', f'acervo/{pack}/{name}.webp'))
    written.append((f'{pack}/{name}#quadro', f'acervo/{pack}/{name}-quadro.png'))


# ---------- Pacotes ----------

def bolinhas():
    for name, color, mood, extra in [
        ('feliz', PALETA['amarelo'], 'feliz', None), ('rindo', PALETA['amarelo'], 'rindo', None),
        ('chorando', PALETA['azul'], 'chorando', None), ('bravo', PALETA['coral'], 'bravo', None),
        ('apaixonado', PALETA['rosa'], 'apaixonado', 'hearts'), ('chocado', PALETA['menta'], 'chocado', None),
        ('sono', PALETA['roxo'], 'sono', 'zzz'), ('descolado', PALETA['laranja'], 'descolado', None),
        ('pensando', PALETA['verde'], 'pensando', '?'), ('piscando', PALETA['amarelo'], 'piscando', None),
    ]:
        save_still(blob_sticker(color, mood, extra), 'bolinhas', name)


def gatinhos():
    laranja, cinza, creme, preto = hexa('#F2994A'), hexa('#A3A8B0'), hexa('#F3E2C3'), hexa('#3B3B42')
    for name, color, mood, muzzle, extra, label in [
        ('oi', laranja, 'feliz', creme, None, 'OI!'), ('dormindo', cinza, 'dormindo', WHITE, 'zzz', None),
        ('bravo', preto, 'bravo', None, None, 'HUMPF'), ('surpreso', creme, 'surpreso', WHITE, None, None),
        ('apaixonado', laranja, 'apaixonado', creme, 'hearts', None), ('piscando', cinza, 'piscando', WHITE, None, None),
        ('miau', preto, 'feliz', None, None, 'MIAU'), ('fome', creme, 'surpreso', WHITE, None, 'FOME'),
    ]:
        save_still(cat_sticker(color, mood, muzzle, extra, label), 'gatinhos', name)


def nordeste():
    cols = [hexa('#FFC93C'), hexa('#FF6B3D'), hexa('#3DC1FF'), hexa('#4CD08A'), hexa('#FF5FA2'), hexa('#A47BFF')]
    words = [('oxe', ['OXE!']), ('vixe', ['VIXE', 'MARIA']), ('arretado', ['ARRETADO']), ('oxente', ['OXENTE']),
             ('eita', ['EITA!']), ('massa', ['MASSA']), ('avie', ['AVIE,', 'MULESTA']), ('visse', ['BORA,', 'VISSE?'])]
    for i, (name, lines) in enumerate(words):
        save_still(text_sticker(lines, 'bangers', cols[i % len(cols)], rotate=(-6 if i % 2 else 5), shadow_color=INK), 'nordeste', name)


def bomdia():
    def sol(img, d):
        sun(d, 512, 512, 230)
    def lua(img, d):
        moon(img, 470, 512, 300)
        for x, y, r in ((760, 260, 60), (820, 520, 40), (680, 760, 46)):
            d.polygon(star_points(x, y, r), fill=(255, 230, 120, 255))
    def cafe(img, d):
        cup(d, 500, 560)
    save_still(drawing_with_text(sol, ['Bom dia!'], 'pacifico', hexa('#FF8A00'), stroke_k=0.06), 'bomdia', 'bom-dia')
    save_still(drawing_with_text(lua, ['Boa noite'], 'pacifico', hexa('#5B6CFF'), stroke_k=0.06), 'bomdia', 'boa-noite')
    save_still(drawing_with_text(cafe, ['Café?'], 'pacifico', hexa('#B86B3A'), stroke_k=0.06), 'bomdia', 'cafe')
    save_still(text_sticker(['Boa', 'tarde!'], 'pacifico', hexa('#FF6B6B'), stroke_k=0.06, rotate=-4), 'bomdia', 'boa-tarde')
    save_still(text_sticker(['SEXTOU!'], 'anton', [hexa('#FFC93C')], rotate=6), 'bomdia', 'sextou')
    save_still(text_sticker(['Bom fim', 'de semana'], 'pacifico', hexa('#0DA678'), stroke_k=0.06), 'bomdia', 'fim-de-semana')
    save_still(text_sticker(['Bença,', 'mainha'], 'caveat', hexa('#FF5FA2'), stroke_k=0.07, max_size=360), 'bomdia', 'benca')


def amor():
    def coracao(img, d):
        heart(d, 512, 512, 380, (234, 51, 80, 255), width=22)
        d.ellipse((300, 300, 420, 400), fill=(255, 255, 255, 120))
    def dois(img, d):
        heart(d, 400, 520, 280, (255, 120, 150, 255), width=18)
        heart(d, 660, 440, 220, (234, 51, 80, 255), width=18)
    save_still(fit(diecut(pad(_draw(coracao)))), 'amor', 'coracao')
    save_still(fit(diecut(pad(_draw(dois)))), 'amor', 'dois-coracoes')
    save_still(drawing_with_text(coracao, ['Te amo'], 'pacifico', hexa('#EA3350'), stroke_k=0.06), 'amor', 'te-amo')
    save_still(text_sticker(['Saudade'], 'pacifico', hexa('#FF7EB3'), stroke_k=0.06, rotate=-5), 'amor', 'saudade')
    save_still(text_sticker(['MEU', 'BEM'], 'anton', [hexa('#FF5FA2'), hexa('#FFFFFF')]), 'amor', 'meu-bem')
    save_still(text_sticker(['Amo', 'muito!'], 'marker', hexa('#EA3350'), stroke_k=0.07), 'amor', 'amo-muito')


def _draw(fn):
    img = canvas()
    fn(img, ImageDraw.Draw(img))
    return img


def trabalho():
    def ok(img, d):
        check(d, 512, 512, 360)
    save_still(fit(diecut(pad(_draw(ok)))), 'trabalho', 'ok')
    save_still(drawing_with_text(ok, ['FEITO!'], 'anton', WHITE), 'trabalho', 'feito')
    save_still(text_sticker(['REUNIÃO?'], 'anton', hexa('#5B8CFF'), rotate=-4), 'trabalho', 'reuniao')
    save_still(text_sticker(['CIENTE'], 'anton', WHITE), 'trabalho', 'ciente')
    save_still(text_sticker(['JÁ', 'VOLTO'], 'archivo', hexa('#FFC93C')), 'trabalho', 'ja-volto')
    save_still(text_sticker(['Pode', 'ser'], 'marker', hexa('#4CD08A'), stroke_k=0.07), 'trabalho', 'pode-ser')
    save_still(text_sticker(['SEGUE', 'O BAILE'], 'anton', [WHITE, hexa('#FF6B3D')], rotate=4), 'trabalho', 'segue')


def festa():
    def baloes(img, d):
        balloon(d, 380, 420, 170, hexa('#EA3350'))
        balloon(d, 640, 360, 190, hexa('#2B4BFF'))
        balloon(d, 520, 520, 150, hexa('#FFC93C'))
    def confete(img, d):
        confetti(d, 7, 90, area=(220, 160, 804, 640))
    save_still(fit(diecut(pad(_draw(baloes)))), 'festa', 'baloes')
    save_still(drawing_with_text(confete, ['PARABÉNS!'], 'bangers', hexa('#FFC93C'), shadow_color=INK), 'festa', 'parabens')
    save_still(text_sticker(['UHUL!'], 'bangers', hexa('#FF5FA2'), rotate=-7, shadow_color=INK), 'festa', 'uhul')
    save_still(text_sticker(['PARTIU'], 'anton', hexa('#4CD08A'), rotate=5), 'festa', 'partiu')
    save_still(text_sticker(['Feliz', 'aniversário'], 'pacifico', hexa('#A47BFF'), stroke_k=0.06), 'festa', 'aniversario')
    save_still(drawing_with_text(baloes, ['BORA', 'COMEMORAR'], 'anton', WHITE), 'festa', 'comemorar')


def puxa():
    azul, nanquim = hexa('#2B4BFF'), hexa('#15161A')
    save_still(puxa_sticker(azul), 'puxa', 'simbolo')
    save_still(puxa_sticker(azul, ['PUXA!']), 'puxa', 'puxa')
    save_still(puxa_sticker(nanquim, ['MANDA', 'O LINK'], fill=hexa('#FFC93C')), 'puxa', 'manda-o-link')
    save_still(text_sticker(['BAIXEI!'], 'anton', hexa('#2B4BFF')), 'puxa', 'baixei')
    save_still(text_sticker(['TÁ NA', 'PLAYLIST'], 'anton', [WHITE, hexa('#FFC93C')], rotate=-4), 'puxa', 'playlist')


def pessoais():
    # Do Marcos (conta de teste): Maceió e UFAL
    def mar(img, d):
        sun(d, 512, 380, 180)
        for k in range(3):
            y = 640 + k * 70
            pts = [(120 + x, y + 26 * math.sin(x / 60 + k)) for x in range(0, 800, 20)]
            rounded_line(d, pts, (40 + k * 20, 150 + k * 20, 255, 255), 34)
    save_still(drawing_with_text(mar, ['PARTIU', 'PRAIA'], 'anton', WHITE), 'marcos', 'partiu-praia')
    save_still(text_sticker(['CALOR DE', 'MACEIÓ'], 'anton', [WHITE, hexa('#FF6B3D')], rotate=-5), 'marcos', 'calor')
    save_still(text_sticker(['Tô no', 'busão'], 'marker', hexa('#FFC93C'), stroke_k=0.07), 'marcos', 'busao')
    save_still(text_sticker(['CÓDIGO', 'RODOU'], 'archivo', hexa('#4CD08A')), 'marcos', 'codigo-rodou')
    # Da Ana (conta de teste): reações
    save_still(blob_sticker(PALETA['rosa'], 'feliz'), 'ana', 'oi')
    save_still(text_sticker(['ama', 'mos'], 'pacifico', hexa('#FF5FA2'), stroke_k=0.06), 'ana', 'amamos')
    save_still(text_sticker(['NÃO', 'ACREDITO'], 'anton', WHITE, rotate=5), 'ana', 'nao-acredito')
    save_still(blob_sticker(PALETA['menta'], 'chocado'), 'ana', 'chocada')


def animadas():
    # Bolinha pulando: amassa ao tocar o chão, estica no ar
    frames, durs = [], []
    for k in range(20):
        t = k / 20
        h = abs(math.sin(math.pi * t))
        squash = 1.0 - 0.22 * (1 - h) ** 3 + 0.08 * h
        face = blob_face(PALETA['amarelo'], 'feliz', squash=squash)
        big = Image.new('RGBA', (S, S + 260), (0, 0, 0, 0))
        big.alpha_composite(face, (0, int(260 - h * 240)))
        frames.append(diecut(big)); durs.append(45)
    save_animated(fit_frames(frames), durs, 'animadas', 'pulando')

    # Bolinha piscando
    frames, durs = [], []
    for k in range(10):
        face = blob_face(PALETA['menta'], 'feliz', blink=k in (6, 7))
        frames.append(fit(diecut(pad(face)))); durs.append(90 if k not in (6, 7) else 60)
    save_animated(frames, durs, 'animadas', 'piscando')

    # KKKK tremendo
    frames, durs = [], []
    rnd = random.Random(3)
    for k in range(12):
        t = text_layer(['KKKK', 'KKKK'], 'bangers', [hexa('#FFC93C') if k % 2 else hexa('#FF6B3D')], rotate=rnd.uniform(-7, 7), shadow_color=INK)
        img = diecut(pad(t))
        big = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))
        big.alpha_composite(img, ((big.width - img.width) // 2 + rnd.randint(-20, 20), (big.height - img.height) // 2 + rnd.randint(-20, 20)))
        frames.append(big); durs.append(70)
    save_animated(fit_frames(frames), durs, 'animadas', 'kkkk')

    # Coração batendo
    frames, durs = [], []
    for k in range(14):
        beat = max(math.sin(math.pi * k / 7), 0) if k < 7 else 0
        r = 320 * (1 + 0.14 * beat)
        img = canvas()
        heart(ImageDraw.Draw(img), 512, 512, r, (234, 51, 80, 255), width=22)
        ImageDraw.Draw(img).ellipse((512 - r * 0.6, 512 - r * 0.62, 512 - r * 0.28, 512 - r * 0.3), fill=(255, 255, 255, 120))
        frames.append(diecut(pad(img))); durs.append(60)
    save_animated(fit_frames(frames), durs, 'animadas', 'coracao')

    # SEXTOU piscando em cores
    frames, durs = [], []
    for k, col in enumerate(['#FFC93C', '#FF5FA2', '#3DC1FF', '#4CD08A']):
        frames.append(text_sticker(['SEXTOU!'], 'anton', hexa(col), rotate=-6 if k % 2 else 6)); durs.append(160)
    save_animated(frames, durs, 'animadas', 'sextou')

    # Gato dormindo: os Z sobem
    frames, durs = [], []
    base = cat(hexa('#A3A8B0'), 'dormindo', WHITE)
    for k in range(16):
        big = Image.new('RGBA', (S + 300, S + 300), (0, 0, 0, 0))
        big.alpha_composite(base, (150, 260))
        d = ImageDraw.Draw(big)
        for j in range(3):
            ph = (k / 16 + j / 3) % 1
            size = int(70 + 90 * ph)
            ff = F['bangers'](size)
            d.text((820 + 60 * ph, 300 - 260 * ph), 'Z', font=ff, fill=(255, 255, 255, int(255 * (1 - ph * 0.6))), stroke_width=int(size * 0.1), stroke_fill=INK)
        frames.append(diecut(big)); durs.append(90)
    save_animated(fit_frames(frames), durs, 'animadas', 'gato-dormindo')


# ---------- Pessoas: avatares e capas ----------

PEOPLE = {
    'marcos': ('M', '#2B4BFF', 'rings'), 'ana': ('A', '#D4357D', 'dots'), 'puxa': (None, '#2B4BFF', 'stripes'),
    'oxente': ('O', '#D8371F', 'stripes'), 'bolinhas': ('B', '#F5C518', 'dots'), 'gatices': ('G', '#0D8658', 'rings'),
    'bia': ('B', '#6D35E0', 'dots'), 'firma': ('F', '#2B2F36', 'stripes'), 'festaja': ('F', '#D4357D', 'rings'),
}


def avatar(key, letter, color):
    img = Image.new('RGB', (384, 384), hexa(color)[:3])
    d = ImageDraw.Draw(img)
    ink = (27, 22, 0) if color in ('#F5C518',) else (255, 255, 255)
    if letter is None:
        m = mark_layer((255, 255, 255, 255), 250)
        img.paste(m, ((384 - m.width) // 2, (384 - m.height) // 2), m)
    else:
        f = F['anton'](230)
        b = d.textbbox((0, 0), letter, font=f)
        d.text(((384 - (b[2] - b[0])) / 2 - b[0], (384 - (b[3] - b[1])) / 2 - b[1]), letter, font=f, fill=ink)
    os.makedirs(os.path.join(OUT, 'pessoas'), exist_ok=True)
    img.save(os.path.join(OUT, 'pessoas', f'{key}.jpg'), quality=86)
    written.append((f'pessoas/{key}', f'acervo/pessoas/{key}.jpg'))


def cover(key, color, motif):
    W, H = 960, 384
    img = Image.new('RGB', (W, H), hexa(color)[:3])
    over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    ink = (255, 255, 255, 34)
    if motif == 'rings':
        for f in (1.1, 0.8, 0.5):
            r = H * f
            d.ellipse((W - r * 0.9 - r, -r * 0.4 - r * 0.2, W - r * 0.9 + r, -r * 0.4 + r * 1.8), outline=ink, width=36)
    elif motif == 'stripes':
        for i in range(-2, 12):
            x = i * 110
            d.polygon([(x, H), (x + 50, H), (x + 50 + H * 0.6, 0), (x + H * 0.6, 0)], fill=ink)
    else:
        for i in range(10):
            for j in range(4):
                d.ellipse((W - 80 - i * 64, 40 + j * 84, W - 52 - i * 64, 68 + j * 84), fill=ink)
    img.paste(over, (0, 0), over)
    os.makedirs(os.path.join(OUT, 'capas'), exist_ok=True)
    img.save(os.path.join(OUT, 'capas', f'{key}.jpg'), quality=84)
    written.append((f'capas/{key}', f'acervo/capas/{key}.jpg'))


def main():
    bolinhas(); gatinhos(); nordeste(); bomdia(); amor(); trabalho(); festa(); puxa(); pessoais(); animadas()
    for key, (letter, color, motif) in PEOPLE.items():
        avatar(key, letter, color)
        cover(key, color, motif)
    lines = ['// Gerado por scripts/acervo/gen.py: a arte de teste do acervo (pacotes, avatares e capas).', '// Não edite à mão: rode o gerador de novo.', '', 'export const ART = {']
    for key, rel in written:
        lines.append(f"  '{key}': require('../../assets/{rel}'),")
    lines += ['} as const;', '', 'export type ArtKey = keyof typeof ART;', '']
    with open(os.path.join(APP, 'src', 'community', 'art.ts'), 'w') as fh:
        fh.write('\n'.join(lines))
    total = sum(os.path.getsize(os.path.join(APP, 'assets', rel)) for _, rel in written)
    print(len(written), 'arquivos,', total // 1024, 'KB')


main()
