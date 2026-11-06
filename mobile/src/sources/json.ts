/** Ajudantes para ler JSON de formato que muda (Instagram e X). Sem React Native: roda nos testes. */

/** Resposta capturada (pedido direto ou navegador invisível). [html]: é a página inteira. */
export type Captured = { url: string; body: string; html: boolean };

/** Percorre um JSON e junta os objetos que passam no teste (o formato muda, a chave costuma ficar). */
export function collect(root: unknown, test: (o: Record<string, unknown>) => boolean, limit = 300): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const stack: unknown[] = [root];
  let seen = 0;
  while (stack.length && out.length < limit && seen < 200_000) {
    const v = stack.pop();
    seen++;
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push(v[i]);
      continue;
    }
    const o = v as Record<string, unknown>;
    if (test(o)) out.push(o);
    for (const k of Object.keys(o)) stack.push(o[k]);
  }
  return out;
}

/** JSONs de um texto: o corpo inteiro, ou os scripts JSON de uma página HTML. */
export function jsonsOf(c: Captured): unknown[] {
  if (!c.html) {
    // Respostas do Instagram às vezes vêm com "for (;;);" na frente
    const t = c.body.replace(/^for \(;;\);/, '').trim();
    try {
      return [JSON.parse(t)];
    } catch {
      // várias linhas de JSON (respostas em partes)
      return t
        .split('\n')
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((x) => x != null);
    }
  }
  const out: unknown[] = [];
  const re = /<script[^>]*type="application\/(?:json|ld\+json)"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(c.body))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // script que não é JSON puro
    }
  }
  return out;
}
