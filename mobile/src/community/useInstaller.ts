import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';

import { useToast } from '../components/Toasts';
import { installPack } from './install';
import type { Pack } from './types';

/**
 * Pôr um pacote do acervo no WhatsApp, com os avisos de cada desfecho. [busy] é o pacote em
 * andamento (um de cada vez) e [step] quantas figurinhas já foram copiadas.
 */
export function useInstaller() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<{ done: number; total: number } | null>(null);

  const install = useCallback(
    async (pack: Pack) => {
      if (busy) return;
      setBusy(pack.id);
      setStep(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        const r = await installPack(pack, (done, total) => setStep({ done, total }));
        if (r.state === 'added') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast.show({ title: `${pack.name} no WhatsApp`, body: `Também está em Figurinhas, na pasta ${r.folder.name}.`, tone: 'success', celebrate: true, duration: 5000 });
        } else if (r.state === 'already') {
          toast.show({ title: 'Já está no WhatsApp', body: `Pasta ${r.folder.name}, em Figurinhas.`, tone: 'info' });
        } else {
          toast.show({ title: 'O WhatsApp não confirmou', body: r.error ?? 'As figurinhas ficaram na pasta do app. Dá para tentar de novo em Figurinhas.', tone: 'info' });
        }
      } catch (e) {
        toast.show({ title: 'Não deu para adicionar', body: (e as Error).message, tone: 'error' });
      } finally {
        setBusy(null);
        setStep(null);
      }
    },
    [busy, toast],
  );

  return { install, busy, step };
}
