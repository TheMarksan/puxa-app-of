import { PermissionsAndroid, Platform } from 'react-native';

import { getSettings, setSettings } from '../settings';

/**
 * Notificações: no Android 13 ou mais novo, os controles do player na barra de notificação
 * só aparecem com essa permissão. O app pede na primeira vez que abre e, se ainda faltar,
 * de novo quando uma música começa a tocar.
 */
const needed = () => Platform.OS === 'android' && Number(Platform.Version) >= 33;

let asking: Promise<boolean> | null = null;

export function askNotifications(): Promise<boolean> {
  if (!needed()) return Promise.resolve(true);
  asking ??= (async () => {
    try {
      const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (await PermissionsAndroid.check(perm)) return true;
      return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/** Primeira entrada no app: pede as permissões uma vez só. */
export function askOnFirstLaunch() {
  if (!needed() || getSettings().askedNotifications) return;
  setSettings({ askedNotifications: true });
  askNotifications().catch(() => {});
}
