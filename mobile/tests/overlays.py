"""
Substituto do Render.overlays (Kotlin) para os testes no computador: mesmos tipos de camada,
mesmas regras de tamanho e posição, desenhados com o Pillow. O emoji vira um círculo colorido
(não há fonte de emoji colorida aqui).
uso: python3 overlays.py specs.json pasta_saida  → imprime JSON com path/width/height
"""
import json, math, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

specs = json.load(open(sys.argv[1])); out_dir = sys.argv[2]; os.makedirs(out_dir, exist_ok=True)
FALLBACK = "/home/claude/puxa-app/node_modules/@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf"

def rgba(h, d=(255,255,255,255)):
    if not isinstance(h, str): return d
    h = h.lstrip('#')
    if len(h) == 6: return tuple(int(h[i:i+2],16) for i in (0,2,4)) + (255,)
    if len(h) == 8: return tuple(int(h[i:i+2],16) for i in (0,2,4,6))
    return d

def font(path, size):
    p = (path or FALLBACK).replace('file://','')
    try: return ImageFont.truetype(p if os.path.exists(p) else FALLBACK, max(6, int(size)))
    except Exception: return ImageFont.truetype(FALLBACK, max(6, int(size)))

def wrap(text, f, maxw):
    """Linhas com o deslocamento de cada uma no texto original (para a palavra em destaque)."""
    lines, pos = [], 0
    for para in text.split('\n'):
        cur, cur_start, i = '', pos, pos
        for w in para.split(' '):
            t = (cur + ' ' + w) if cur else w
            if f.getlength(t) <= maxw or not cur: cur = t
            else: lines.append((cur, cur_start)); cur, cur_start = w, i
            i += len(w) + 1
        lines.append((cur, cur_start)); pos += len(para) + 1
    return lines

PADS = {'box': (0.38, 0.2), 'line': (0.38, 0.2), 'pill': (0.62, 0.2), 'glow': (0.3, 0.24)}

def styled(spec, maxw, size=None):
    size = float(size if size is not None else spec.get('size', 48)); f = font(spec.get('font'), size)
    bg = spec.get('background', 'none')
    px, py = PADS.get(bg, (0.16, 0.12)); padx, pady = size*px, size*py
    lines = wrap(spec.get('text') or ' ', f, maxw - 2*padx)
    lh = size*1.08*1.2
    w = max(f.getlength(l) for l, _ in lines); h = lh*len(lines)
    return f, lines, w, h, padx, pady, lh, size, bg

def draw_styled(im, spec, st, left, top):
    f, lines, w, h, padx, pady, lh, size, bg = st
    d = ImageDraw.Draw(im); col = rgba(spec.get('color')); bgc = rgba(spec.get('bgColor'), (0,0,0,200))
    if bg == 'box': d.rounded_rectangle([left, top, left+w+2*padx, top+h+2*pady], radius=size*0.28, fill=bgc)
    if bg == 'pill':
        bw, bh = w+2*padx, h+2*pady
        d.rounded_rectangle([left, top, left+bw, top+bh], radius=min(bw, bh)/2, fill=bgc)
    hs, he = int(spec.get('hlStart', -1) if spec.get('hlStart') is not None else -1), int(spec.get('hlEnd', -1) if spec.get('hlEnd') is not None else -1)
    hcol = rgba(spec.get('highlight'), (255, 214, 10, 255))
    for i, (l, off) in enumerate(lines):
        lw = f.getlength(l); x = left + padx + (w - lw)/2; y = top + pady + i*lh
        if bg == 'line': d.rounded_rectangle([x-padx*0.7, y-pady*0.35, x+lw+padx*0.7, y+lh+pady*0.35], radius=size*0.28, fill=bgc)
        if bg in ('shadow', 'glow'):
            sh = Image.new('RGBA', im.size, (0,0,0,0)); sd = ImageDraw.Draw(sh)
            if bg == 'shadow':
                sd.text((x, y+size*0.06), l, font=f, fill=(0,0,0,170)); layers = [sh.filter(ImageFilter.GaussianBlur(size*0.09))]
            else:
                g = (bgc[0], bgc[1], bgc[2], 255); sd.text((x, y), l, font=f, fill=g)
                layers = [sh.filter(ImageFilter.GaussianBlur(size*0.25)), sh.filter(ImageFilter.GaussianBlur(size*0.25)), sh.filter(ImageFilter.GaussianBlur(size*0.08))]
            for layer in layers: im.alpha_composite(layer)
            d = ImageDraw.Draw(im)
        stroke = int(size*0.14) if bg == 'outline' else 0
        d.text((x, y), l, font=f, fill=col, stroke_width=stroke, stroke_fill=(bgc[0],bgc[1],bgc[2],255))
        # Palavra em destaque por cima, na mesma posição
        a, b = max(hs, off), min(he, off + len(l))
        if hs >= 0 and b > a:
            hx = x + f.getlength(l[:a-off])
            d.text((hx, y), l[a-off:b-off], font=f, fill=hcol)

def even(im):
    w, h = im.size
    if w % 2 == 0 and h % 2 == 0: return im
    o = Image.new('RGBA', (w + w%2, h + h%2), (0,0,0,0)); o.paste(im, (0,0)); return o

def fitted_size(s, text, maxw, room):
    size = float(s.get('size', 48))
    for _ in range(8):
        st = styled({**s, 'text': text}, maxw, size)
        if st[3] + 2*st[5] <= room*0.96: break
        size *= 0.88
    return size

def caption(s):
    W, H = int(s['width']), int(s['height']); margin = float(s.get('margin', 0)); maxw = float(s.get('maxWidth', W*0.88))
    im = Image.new('RGBA', (W, H), (0,0,0,0))
    op = float(s.get('opacity', 1))
    if op < 0.01: return im
    size = fitted_size(s, s.get('fitText') or s.get('text') or ' ', maxw, H - 2*margin)
    st = styled(s, maxw, size)
    bw, bh = st[2]+2*st[4], st[3]+2*st[5]; left = (W-bw)/2; v = s.get('valign')
    top = margin if v == 'top' else ((H-bh)/2 if v == 'center' else H-margin-bh)
    # Desenha a caixa sozinha e aplica escala, deslocamento e opacidade ao colar
    m = int(size*0.7); box = Image.new('RGBA', (int(bw)+2*m, int(bh)+2*m), (0,0,0,0)); draw_styled(box, s, st, m, m)
    sc = float(s.get('scale', 1)); dy = float(s.get('dy', 0))
    if abs(sc-1) > 0.001: box = box.resize((max(2, int(box.size[0]*sc)), max(2, int(box.size[1]*sc))), Image.BICUBIC)
    if op < 0.995: box.putalpha(box.getchannel('A').point(lambda a: int(a*op)))
    cx, cy = left + bw/2, top + bh/2 + dy
    layer = Image.new('RGBA', (W, H), (0,0,0,0))
    layer.paste(box, (int(round(cx - box.size[0]/2)), int(round(cy - box.size[1]/2))))
    im.alpha_composite(layer)
    return im

res = []
for i, s in enumerate(specs):
    k = s['kind']
    if k == 'text':
        st = styled(s, float(s.get('maxWidth', 1000))); m = int(st[7]*(0.7 if s.get('background') == 'glow' else 0.3))
        im = Image.new('RGBA', (int(st[2]+2*st[4])+2*m, int(st[3]+2*st[5])+2*m), (0,0,0,0)); draw_styled(im, s, st, m, m)
    elif k == 'emoji':
        size = int(float(s['size'])); im = Image.new('RGBA', (int(size*1.3), int(size*1.3)), (0,0,0,0))
        ImageDraw.Draw(im).ellipse([size*0.15, size*0.15, size*1.15, size*1.15], fill=(255,200,40,255), outline=(120,60,0,255), width=max(2,size//20))
    elif k == 'caption':
        im = caption(s)
    elif k == 'image':
        w, h = int(s['width']), int(s['height']); src = Image.open(s['src']).convert('RGBA').resize((w, h))
        mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle([0,0,w-1,h-1], radius=float(s.get('radius',0)), fill=255)
        im = Image.new('RGBA', (w, h), (0,0,0,0)); im.paste(src, (0,0), mask)
        if float(s.get('border',0)) > 0: ImageDraw.Draw(im).rounded_rectangle([0,0,w-1,h-1], radius=float(s.get('radius',0)), outline=(255,255,255,255), width=int(float(s['border'])))
    elif k == 'mask':
        w, h = int(s['width']), int(s['height']); im = Image.new('RGBA', (w, h), (0,0,0,255)); d = ImageDraw.Draw(im)
        (d.ellipse if s.get('shape') == 'circle' else d.rounded_rectangle)([0,0,w-1,h-1], fill=(255,255,255,255), **({} if s.get('shape') == 'circle' else {'radius': min(w,h)*0.18}))
    elif k == 'ring':
        w, h = int(s['width']), int(s['height']); b = int(float(s.get('border', 6))); im = Image.new('RGBA', (w, h), (0,0,0,0)); d = ImageDraw.Draw(im)
        args = dict(outline=rgba(s.get('color')), width=b)
        if s.get('shape') == 'circle': d.ellipse([b/2, b/2, w-b/2, h-b/2], **args)
        else: d.rounded_rectangle([b/2, b/2, w-b/2, h-b/2], radius=min(w,h)*0.18, **args)
    else:
        im = Image.new('RGBA', (int(s.get('width', 2)), int(s.get('height', 2))), (0,0,0,0))
    rot = float(s.get('rotation', 0) or 0)
    if abs(rot) > 0.01: im = im.rotate(-rot, expand=True, resample=Image.BICUBIC)
    im = even(im); p = os.path.join(out_dir, s['name']); im.save(p)
    res.append({'path': p, 'width': im.size[0], 'height': im.size[1]})
print(json.dumps(res))
