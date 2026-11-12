/**
 * Arte da notificação do player, sem nada do aparelho (testada no computador): um quadro na
 * cor da playlist com a capa da música no meio, de cantos arredondados. No Android 11 ou mais
 * novo o player da notificação pinta o fundo a partir da arte, então ele fica com a cor da
 * playlist, como as telas do app.
 */

const n = (v: number) => Number(v.toFixed(2));

/** Canto arredondado (branco dentro, transparente fora) para o geq, com as vírgulas escapadas. */
function rounded(side: number, r: number): string {
  const c = n((side - 1) / 2);
  const h = n(side / 2 - r);
  return `255*clip(${n(r)}+0.5-hypot(max(abs(X-${c})-${h}\\,0)\\,max(abs(Y-${c})-${h}\\,0))\\,0\\,1)`;
}

/**
 * Argumentos do ffmpeg para a arte: [color] em #RRGGBB, [art] a capa da música (ou da playlist)
 * ou null para só a cor. Miniaturas 4:3 do YouTube (com faixas pretas em cima e embaixo) são
 * cortadas para 16:9 antes do recorte quadrado.
 */
export function artworkArgs(o: { color: string; art: string | null; out: string; size?: number; mark?: string | null; darkMark?: boolean }): string[] {
  const size = o.size ?? 720;
  const bg = `color=c=0x${o.color.replace('#', '')}:s=${size}x${size}:d=1`;
  if (!o.art) {
    // Sem capa: a cor da playlist com a seta do Puxa no meio (o desenho do ícone do app)
    if (!o.mark) return ['-y', '-v', 'error', '-f', 'lavfi', '-i', bg, '-frames:v', '1', '-q:v', '3', o.out];
    const graph = `[1:v]scale=${size}:${size},format=rgba${o.darkMark ? ',lutrgb=r=negval:g=negval:b=negval' : ''}[m];[0:v][m]overlay=0:0:format=auto,format=yuvj420p[out]`;
    return ['-y', '-v', 'error', '-f', 'lavfi', '-i', bg, '-i', o.mark, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-q:v', '3', o.out];
  }
  const inner = Math.round(size * 0.84);
  const at = Math.round((size - inner) / 2);
  const r = Math.round(inner * 0.06);
  const graph = [
    `[1:v]crop=w=iw:h=if(between(iw/ih\\,1.30\\,1.36)\\,iw*9/16\\,ih)`,
    `scale=${inner}:${inner}:force_original_aspect_ratio=increase`,
    `crop=${inner}:${inner}`,
    'format=rgba',
    `geq=r=r(X\\,Y):g=g(X\\,Y):b=b(X\\,Y):a=${rounded(inner, r)}[art];[0:v][art]overlay=${at}:${at}:format=auto,format=yuvj420p[out]`,
  ].join(',');
  return ['-y', '-v', 'error', '-f', 'lavfi', '-i', bg, '-i', o.art, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-q:v', '3', o.out];
}
