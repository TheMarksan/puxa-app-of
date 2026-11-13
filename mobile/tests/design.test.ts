import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { COLORS } from '../src/playlist/colors';
import { control, gutter, radius, space } from '../src/theme/layout';
import { dark, light, type Palette } from '../src/theme/palette';
import { text } from '../src/theme/typography';

/**
 * O sistema de design, conferido no código: nenhuma tela pode usar letra, espaço, canto, cor ou
 * sombra que não venha de src/theme. As regras estão em DESIGN.md.
 */

const SRC = join(__dirname, '..', 'src');

/** Desenho feito com conta (a capa da playlist) e o texto da legenda do vídeo: é conteúdo, não interface. */
const ART = new Set(['components/music/Cover.tsx', 'editor/ui/CaptionLayer.tsx', 'editor/ui/TextVisual.tsx']);
/** Onde as cores moram além do tema: a paleta das playlists e a do editor (sempre escuro). */
const COLOR_HOMES = new Set(['playlist/colors.ts', 'editor/ui/palette.ts']);

function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'theme') files(p, out);
    } else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const SOURCES = files(SRC).map((path) => ({ rel: relative(SRC, path), lines: readFileSync(path, 'utf8').split('\n') }));
const UI = SOURCES.filter((f) => !ART.has(f.rel));

/**
 * Linhas que casam com [re] e não passam em [ok]; comentários ficam de fora. Uma linha que
 * desenha conteúdo (a forma de uma figurinha, que sai de uma conta) pode se isentar dizendo o
 * motivo num comentário na própria linha: `// arte: o canto vem da escolha da pessoa`.
 */
function escapes(list: typeof SOURCES, re: RegExp, ok: (m: RegExpExecArray, line: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const f of list) {
    f.lines.forEach((line, i) => {
      if (/(?:\/\/|\/\*) arte: \S/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const g = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = g.exec(code))) if (!ok(m, code)) out.push(`${f.rel}:${i + 1}  ${m[0].trim()}`);
    });
  }
  return out;
}

const none = (found: string[], what: string) => assert.equal(found.length, 0, `${what}:\n  ${found.slice(0, 40).join('\n  ')}${found.length > 40 ? `\n  … e mais ${found.length - 40}` : ''}`);

test('letra: quatro tamanhos e dois pesos, definidos uma vez só', () => {
  const styles = Object.values(text);
  assert.deepEqual([...new Set(styles.map((s) => s.fontSize))].sort((a, b) => a - b), [13, 16, 22, 40]);
  // Duas famílias (leitura e pôster); a de leitura em dois pesos
  assert.deepEqual([...new Set(styles.map((s) => s.fontFamily))].sort(), ['Anton_400Regular', 'Archivo_400Regular', 'Archivo_700Bold']);
  for (const s of styles) assert.equal(s.lineHeight % 4, 0, `altura de linha fora da grade: ${s.lineHeight}`);
});

test('letra: nenhuma tela escolhe tamanho, peso ou família por conta própria', () => {
  none(escapes(UI, /\bfontSize\s*:/), 'fontSize fora do tema (use ...text.x)');
  none(escapes(UI, /\bfontWeight\s*:/), 'fontWeight fora do tema');
  none(escapes(UI, /\bletterSpacing\s*:/), 'letterSpacing fora do tema');
  none(escapes(UI, /\bfontFamily\s*:\s*['"`][^'"`]*['"`]/), 'fontFamily escrita à mão');
  none(
    escapes(UI, /\blineHeight\s*:\s*([^,}\n]+)/, (m) => /^\d+$/.test(m[1].trim()) && Number(m[1]) % 4 === 0),
    'lineHeight fora da grade de 4',
  );
});

test('espaço: tudo sai da escala (4, 8, 12, 16, 24, 32, 48, 64)', () => {
  assert.deepEqual(Object.values(space), [0, 4, 8, 12, 16, 24, 32, 48, 64]);
  assert.equal(gutter, 24);
  // O valor é 0 ou vem de space[n] e gutter (podendo somar a área segura); número solto não passa
  const clean = (v: string) => v.replace(/space\[\d+\]/g, '').replace(/\b(gutter|insets\.\w+)\b/g, '');
  none(
    escapes(UI, /\b(?:(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap|rowGap|columnGap)\s*:\s*([^,}\n]+)/, (m) => {
      const v = m[1].trim();
      return v === '0' || !/\d/.test(clean(v));
    }),
    'espaço fora da escala (use space[n])',
  );
});

test('tamanho: larguras e alturas na grade de 4', () => {
  none(
    escapes(UI, /\b(?:height|width|minHeight|minWidth|maxHeight|maxWidth)\s*:\s*(\d+(?:\.\d+)?)\b(?!\s*[*+/%.\w])/, (m) => {
      const v = Number(m[1]);
      return v <= 2 || v % 4 === 0;
    }),
    'tamanho fora da grade de 4',
  );
  for (const v of Object.values(control)) assert.equal(v % 8, 0);
});

test('canto: só os raios do tema', () => {
  assert.deepEqual(Object.values(radius), [4, 8, 12, 16, 24, 999]);
  none(
    escapes(UI, /\bborder(?:TopLeft|TopRight|BottomLeft|BottomRight|Top|Bottom)?Radius\s*:\s*([^,}\n]+)/, (m) => /^radius\.(xs|sm|md|lg|xl|full)$/.test(m[1].trim())),
    'raio fora do tema (use radius.x)',
  );
});

test('cor e sombra: nada escrito à mão fora do tema', () => {
  const colored = SOURCES.filter((f) => !COLOR_HOMES.has(f.rel) && !ART.has(f.rel));
  none(escapes(colored, /#[0-9a-fA-F]{3,8}\b/), 'cor em hexadecimal fora do tema');
  none(escapes(colored, /\brgba?\(/), 'cor rgb() fora do tema');
  none(escapes(SOURCES, /\b(?:shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation)\s*:/), 'sombra antiga (use boxShadow: c.shadowN)');
});

test('ícones: 12, 16, 20, 24 ou 32', () => {
  none(
    escapes(UI, /<(?:Feather|FontAwesome)\b[^>]*?\bsize=\{([^}]+)\}/, (m) => [12, 16, 20, 24, 32].includes(Number(m[1])) || !/^\d+$/.test(m[1].trim())),
    'ícone fora dos tamanhos do tema',
  );
});

// ---------- Contraste ----------

function rgbOf(color: string, over: [number, number, number]): [number, number, number] {
  const m = /^rgba?\(([^)]+)\)$/.exec(color);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
    const al = Number(a);
    return [Number(r), Number(g), Number(b)].map((v, i) => v * al + over[i] * (1 - al)) as [number, number, number];
  }
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG de [fg] sobre [bg]; os dois podem ser translúcidos (o fundo assenta em [base]). */
function contrast(fg: string, bg: string, base: string): number {
  const b0 = rgbOf(base, [255, 255, 255]);
  const b = rgbOf(bg, b0);
  const f = rgbOf(fg, b);
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('contraste: todo texto passa de 4,5:1 no claro e no escuro', () => {
  const check = (name: string, c: Palette) => {
    const bases = [c.bg, c.surface, c.raised];
    for (const base of bases) {
      for (const ink of ['ink', 'body', 'muted', 'accentInk', 'successInk', 'danger'] as const) {
        assert.ok(contrast(c[ink], base, base) >= 4.5, `${name}: ${ink} sobre ${base} = ${contrast(c[ink], base, base).toFixed(2)}`);
      }
      // Texto nos poços e nas peças de azul claro
      assert.ok(contrast(c.ink, c.sunken, base) >= 4.5, `${name}: ink no poço`);
      assert.ok(contrast(c.muted, c.sunken, base) >= 4.5, `${name}: muted no poço (${contrast(c.muted, c.sunken, base).toFixed(2)})`);
      assert.ok(contrast(c.accentInk, c.accentSoft, base) >= 4.5, `${name}: azul sobre azul claro (${contrast(c.accentInk, c.accentSoft, base).toFixed(2)})`);
      assert.ok(contrast(c.danger, c.dangerSoft, base) >= 4.5, `${name}: erro sobre fundo de erro`);
      assert.ok(contrast(c.successInk, c.successSoft, base) >= 4.5, `${name}: sucesso sobre fundo de sucesso`);
    }
    assert.ok(contrast(c.onAccent, c.accent, c.bg) >= 4.5, `${name}: texto do botão principal`);
    assert.ok(contrast(c.onAccent, c.accentPressed, c.bg) >= 3, `${name}: botão principal apertado`);
    assert.ok(contrast(c.onInverse, c.inverse, c.bg) >= 4.5, `${name}: texto da peça escura`);
    assert.ok(contrast(c.onAccent, c.success, c.bg) >= 4.5, `${name}: texto sobre o verde`);
    // O botão principal se destaca do fundo (3:1 para peças de interface)
    assert.ok(contrast(c.accent, c.bg, c.bg) >= 3, `${name}: botão principal contra o fundo`);
  };
  check('claro', light);
  check('escuro', dark);
});

test('contraste: a letra sobre cada cor de playlist passa de 4,5:1', () => {
  for (const [id, k] of Object.entries(COLORS)) {
    assert.ok(contrast(k.ink, k.bg, k.bg) >= 4.5, `${id}: ${contrast(k.ink, k.bg, k.bg).toFixed(2)}`);
    assert.ok(contrast('#FFFFFF', k.deep, k.deep) >= 7, `${id}: branco sobre o fundo do player`);
    // A cor da playlist como texto sobre o fundo do app, no claro e no escuro
    for (const base of [light.bg, light.surface]) assert.ok(contrast(k.onLight, base, base) >= 4.5, `${id}: cor da playlist sobre ${base}`);
    for (const base of [dark.bg, dark.surface, dark.raised]) assert.ok(contrast(k.onDark, base, base) >= 4.5, `${id}: cor da playlist sobre ${base}`);
    for (const base of [light.bg, dark.bg]) {
      const p = base === light.bg ? light : dark;
      const ink = base === light.bg ? k.onLight : k.onDark;
      assert.ok(contrast(ink, p.sunken, base) >= 4.5, `${id}: cor da playlist no poço`);
    }
  }
});

test('imagem: toda <Image> diz como decodificar (em geral, do tamanho da peça)', () => {
  // Sem resizeMethod="resize", o Android decodifica a imagem inteira (uma figurinha de 512x512 ocupa 1 MB
  // na memória mesmo mostrada com 48): com dezenas na tela, a rolagem trava. "scale" (inteira) só onde a
  // imagem é aproximada com os dedos, com um comentário dizendo isso
  const found: string[] = [];
  for (const f of SOURCES) {
    const all = f.lines.join('\n');
    for (const m of all.matchAll(/<Image\b[\s\S]*?\/>/g)) if (!/resizeMethod="(resize|scale)"/.test(m[0])) found.push(`${f.rel}:${all.slice(0, m.index).split('\n').length}`);
  }
  none(found, 'Image sem resizeMethod="resize"');
});
