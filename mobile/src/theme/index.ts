/**
 * O sistema de design do Puxa. Tudo que é cor, letra, espaço, canto, sombra e movimento mora
 * aqui; as telas só usam. As regras estão em DESIGN.md e são conferidas por tests/design.test.ts.
 */
export { usePalette } from './colors';
export { alpha, dark, light, media, type Palette } from './palette';
export { control, gutter, hit, icon, radius, space } from './layout';
export { duration, ease } from './motion';
export { font, tabular, text, type TextName } from './typography';
