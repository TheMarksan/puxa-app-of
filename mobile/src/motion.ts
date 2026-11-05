import { AccessibilityInfo } from 'react-native';

let reduced = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduced = v)).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduced = v));

/** Duração de uma animação, zerada quando a pessoa pediu menos movimento no sistema. */
export function ms(duration: number): number {
  return reduced ? 0 : duration;
}

export function reduceMotion(): boolean {
  return reduced;
}
