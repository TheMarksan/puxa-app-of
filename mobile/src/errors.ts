/**
 * A frase que a pessoa lê quando algo falha. Os módulos nativos do Expo embrulham o erro em
 * inglês ("Call to function 'PuxaEngine.stickerAdd' has been rejected. → Caused by: …"): fica só
 * a causa, que é a frase escrita para gente. Nome de classe Java na frente também sai.
 */
export function plainError(message: string): string {
  const parts = message.split(/\s*(?:→|->)?\s*Caused by:\s*/);
  const cause = parts[parts.length - 1].trim().replace(/^(?:[a-z][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error):\s*/, '');
  if (!cause || /^Call to function .* has been rejected\.?$/s.test(cause)) return 'Algo falhou no aparelho. Tente de novo.';
  return cause;
}
