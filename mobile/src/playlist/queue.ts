/**
 * Contas da fila, sem nada do aparelho (testadas no computador).
 *
 * A fila nativa sempre começa na música escolhida: a lista é girada até ela (ou embaralhada com
 * ela na frente). Assim tocar uma música é montar uma fila nova, sem pular para um índice que o
 * player do aparelho pode não ter ainda, e a ordem circular da lista continua a mesma.
 */

export type LoopMode = 'all' | 'single' | 'none';

/** Ordem da fila nativa: a música escolhida primeiro, depois as seguintes da lista (dando a volta). */
export function arrange(ids: string[], startId: string, shuffle: boolean, rand: () => number = Math.random): string[] {
  const i = ids.indexOf(startId);
  if (i < 0) return [];
  if (!shuffle) return [...ids.slice(i), ...ids.slice(0, i)];
  const rest = ids.filter((x) => x !== startId);
  for (let k = rest.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [rest[k], rest[j]] = [rest[j], rest[k]];
  }
  return [startId, ...rest];
}

/**
 * Música vizinha de [current] ([by] = 1 próxima, -1 anterior), ou null quando não há.
 * Com "repetir desligado" e na ordem da lista, a lista acaba na última música (e começa na
 * primeira), mesmo que a fila nativa tenha dado a volta. Embaralhado, a fila é a própria ordem.
 */
export function neighbor(order: string[], ids: string[], current: string, by: 1 | -1, loop: LoopMode, shuffle: boolean): string | null {
  const n = order.length;
  const i = order.indexOf(current);
  if (i < 0 || n === 0) return null;
  if (loop === 'none') {
    if (shuffle) {
      const j = i + by;
      return j >= 0 && j < n ? order[j] : null;
    }
    const k = ids.indexOf(current);
    const j = k + by;
    return k >= 0 && j >= 0 && j < ids.length ? ids[j] : null;
  }
  if (n === 1) return null;
  return order[(i + by + n) % n];
}

/** Na ordem da lista com "repetir desligado": a fila deu a volta (passou da última para a primeira). */
export function wrapped(ids: string[], from: string, to: string): boolean {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  return a >= 0 && b >= 0 && a === ids.length - 1 && b === 0 && ids.length > 1;
}

export type QueueOp = { op: 'insert'; id: string; index: number } | { op: 'remove'; index: number };

/**
 * O que fazer na fila nativa quando a lista mudou enquanto toca: inserir as músicas novas no
 * lugar certo e tirar as que saíram, sem parar a música atual. null quando a ordem mudou de um
 * jeito que só montando a fila de novo (a música atual saiu, ou as músicas trocaram de lugar).
 */
export function plan(order: string[], ids: string[], current: string | null, shuffle: boolean): { ops: QueueOp[]; order: string[] } | null {
  const keep = new Set(ids);
  const had = new Set(order);
  if (current && !keep.has(current)) return null;
  const kept = order.filter((id) => keep.has(id));
  // A ordem relativa das que ficaram tem de ser a mesma da lista (girada), senão monta de novo
  if (!shuffle && kept.length > 1) {
    const pos = kept.map((id) => ids.indexOf(id));
    let drops = 0;
    for (let k = 1; k < pos.length; k++) if (pos[k] < pos[k - 1]) drops++;
    // Girada: no máximo uma "volta"
    if (drops > 1 || (drops === 1 && pos[pos.length - 1] > pos[0])) return null;
  }
  const ops: QueueOp[] = [];
  const next = [...order];
  for (let i = next.length - 1; i >= 0; i--) {
    if (!keep.has(next[i])) {
      ops.push({ op: 'remove', index: i });
      next.splice(i, 1);
    }
  }
  const added = ids.filter((id) => !had.has(id));
  for (const id of added) {
    let index = next.length;
    if (!shuffle) {
      // Logo depois da música que vem antes dela na lista (dando a volta)
      const k = ids.indexOf(id);
      for (let back = 1; back < ids.length; back++) {
        const pred = ids[(k - back + ids.length) % ids.length];
        const at = next.indexOf(pred);
        if (at >= 0) {
          index = at + 1;
          break;
        }
      }
    }
    ops.push({ op: 'insert', id, index });
    next.splice(index, 0, id);
  }
  return { ops, order: next };
}

/** A lista com [id] uma posição para cima (-1) ou para baixo (1); igual se não dá. */
export function moved(ids: string[], id: string, by: number): string[] {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  next.splice(i, 1);
  next.splice(j, 0, id);
  return next;
}

/**
 * Segurança para quando o player do aparelho não passa sozinho para a próxima: a música chegou
 * ao fim e ficou parada, ou voltou ao começo na mesma posição da fila (repetiu em vez de seguir).
 */
export type Sample = { index: number; time: number; duration: number; playing: boolean; buffering: boolean; at: number };

export function stuckAtEnd(prev: Sample | null, cur: Sample, loop: LoopMode, queueLength: number): 'ended' | 'repeated' | null {
  if (cur.duration <= 1) return null;
  if (!cur.playing && !cur.buffering && cur.time >= cur.duration - 0.6) return 'ended';
  if (prev && loop === 'all' && queueLength > 1 && prev.index === cur.index && prev.duration > 1 && prev.time >= prev.duration - 1.5 && cur.time < 1.2) return 'repeated';
  return null;
}
