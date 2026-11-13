import assert from 'node:assert/strict';
import { test } from 'node:test';

import { plainError } from '../src/errors';

test('erros: tira o embrulho do Expo e deixa a frase para gente', () => {
  assert.equal(plainError("Call to function 'PuxaEngine.stickerAdd' has been rejected.\n→ Caused by: A figurinha não foi gerada. Tente de novo."), 'A figurinha não foi gerada. Tente de novo.');
  // Causa dentro de causa: a última é a de verdade
  assert.equal(plainError("Call to function 'ExpoAsset.downloadAsync' has been rejected.\n→ Caused by: Unable to download\n→ Caused by: java.io.FileNotFoundException: sem arquivo"), 'sem arquivo');
  // Sem causa nenhuma: uma frase em português no lugar do inglês
  assert.equal(plainError("Call to function 'PuxaEngine.stickerAdd' has been rejected."), 'Algo falhou no aparelho. Tente de novo.');
  // Mensagem normal passa igual
  assert.equal(plainError('O WhatsApp não está instalado neste aparelho.'), 'O WhatsApp não está instalado neste aparelho.');
});
