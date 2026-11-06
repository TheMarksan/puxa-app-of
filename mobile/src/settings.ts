import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

export type ThemePref = 'system' | 'light' | 'dark';

export type Transcriber = 'device' | 'elevenlabs';
export type WhisperChoice = 'base' | 'small' | 'turbo';

/** Preferências guardadas no aparelho (Ajustes e as últimas escolhas). */
export type Settings = {
  theme: ThemePref;
  /** Pasta onde a última figurinha foi guardada. */
  stickerFolder?: string;
  /** Quem transcreve quando o vídeo não tem legenda. */
  transcriber?: Transcriber;
  whisperModel?: WhisperChoice;
  /** Idioma falado do último áudio transcrito ("auto" para detectar). */
  spokenLanguage?: string;
  /** Voz da dublagem (id da ElevenLabs). */
  voice?: string;
};

const DEFAULTS: Settings = { theme: 'system' };
const WEB_KEY = 'puxa-ajustes';

const file = () => new File(Paths.document, 'ajustes.json');

function load(): Settings {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(WEB_KEY);
      return { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
    }
    const f = file();
    if (!f.exists) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(f.textSync()) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(current));
    else file().write(JSON.stringify(current));
  } catch {
    // Sem como gravar: a escolha vale até o app fechar
  }
  if (patch.theme) applyTheme(patch.theme);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/**
 * Claro, escuro ou o do sistema. No Android isso também muda a cor dos elementos nativos
 * (teclado, menus); a paleta do app segue a mesma escolha em usePalette.
 */
export function applyTheme(t: ThemePref) {
  try {
    Appearance.setColorScheme?.(t === 'system' ? 'unspecified' : t);
  } catch {
    // Plataforma sem suporte: fica só a paleta do app
  }
}
