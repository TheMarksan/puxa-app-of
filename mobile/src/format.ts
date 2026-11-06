/** Formatos em português do Brasil, sem depender do Intl do Hermes. */

function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

export function bytes(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  if (mb < 10) return `${decimal(mb, 1)} MB`;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${decimal(mb / 1024, 1)} GB`;
}

export function speed(bps: number): string {
  if (!bps || bps < 1) return '';
  return `${bytes(bps)}/s`;
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Tempo restante falado: "faltam 8 s", "faltam 2 min". */
export function eta(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `faltam ${Math.max(1, Math.round(seconds))} s`;
  return `faltam ${Math.round(seconds / 60)} min`;
}

export function views(n: number | null | undefined): string {
  if (n == null || n < 0) return '';
  if (n < 1000) return `${n} ${n === 1 ? 'visualização' : 'visualizações'}`;
  if (n < 1_000_000) return `${n < 10_000 ? decimal(n / 1000, 1).replace(',0', '') : Math.round(n / 1000)} mil visualizações`;
  if (n < 1_000_000_000) return `${decimal(n / 1_000_000, 1).replace(',0', '')} mi de visualizações`;
  return `${decimal(n / 1_000_000_000, 1).replace(',0', '')} bi de visualizações`;
}

const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export function date(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "trecho 0m12s a 0m42s", usado no nome do arquivo cortado. */
export function clipName(title: string, start: number, end: number): string {
  const part = (t: number) => {
    const s = Math.round(t);
    return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  };
  return `${title} (trecho ${part(start)} a ${part(end)}).m4a`;
}

/** Tira a extensão: "Música (720p).mp4" → "Música (720p)". */
export function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/** Nome de arquivo seguro: sem barras nem caracteres que o Android recusa. */
export function safeName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Puxa'
  );
}
