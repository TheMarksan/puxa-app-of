// Ajustes nativos do Android que o app.json não cobre sozinho.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withAppBuildGradle, withGradleProperties, withDangerousMod, AndroidConfig, createRunOncePlugin } = require('expo/config-plugins');

/** Faz o Puxa aparecer no menu "Compartilhar" do YouTube (recebe o link como texto). */
function withShareTarget(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity['intent-filter'] = activity['intent-filter'] || [];
    const exists = activity['intent-filter'].some((f) =>
      (f.action || []).some((a) => a.$['android:name'] === 'android.intent.action.SEND'),
    );
    if (!exists) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }
    activity.$['android:launchMode'] = 'singleTask';
    return cfg;
  });
}

/** O NewPipeExtractor usa APIs do Java 8+ (java.time, java.nio) que precisam de desugaring. */
function withDesugaring(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('coreLibraryDesugaringEnabled')) {
      src = src.replace(/android\s*\{/, (m) => `${m}\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }\n`);
    }
    if (!src.includes('desugar_jdk_libs')) {
      src = src.replace(/dependencies\s*\{/, (m) => `${m}\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")\n`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

/** Figurinhas animadas (WebP animado) aparecem animadas nas telas do app. */
function withAnimatedWebp(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'expo.webp.animated'));
    props.push({ type: 'property', key: 'expo.webp.animated', value: 'true' });
    cfg.modResults = props;
    return cfg;
  });
}

/** Desenho de linha no estilo dos ícones do app (traço de 2, pontas redondas). */
const stroke = (d, w = 2) =>
  `  <path android:pathData="${d}" android:strokeColor="#FFFFFFFF" android:strokeWidth="${w}" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>`;
const fill = (d) => `  <path android:pathData="${d}" android:fillColor="#FFFFFFFF" android:strokeColor="#FFFFFFFF" android:strokeWidth="1.5" android:strokeLineJoin="round"/>`;
/** Um pouco menor (os desenhos de voltar e avançar encostam na borda). */
const shrink = (paths) => `  <group android:pivotX="12" android:pivotY="12" android:scaleX="0.84" android:scaleY="0.84">\n${paths.join('\n')}\n  </group>`;
const vector = (paths) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!-- Gerado pelo plugin with-puxa-android: ícone do player na notificação, no estilo do Puxa -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n${paths.join('\n')}\n</vector>\n`;

/**
 * Notificação do player com a cara do app: a biblioteca de áudio usa os ícones da Media3
 * (um "play" genérico na barra de status e os botões padrão). Recursos com o mesmo nome no app
 * substituem os da biblioteca, então aqui entram a seta do Puxa na barra de status e os botões
 * no mesmo desenho dos ícones das telas.
 */
const ICONS = {
  // Barra de status: a seta para baixo com a base, igual ao ícone do app
  media3_icon_circular_play: [stroke('M12,4.5L12,14.5M7.5,10.2L12,14.7L16.5,10.2M6.5,19.5L17.5,19.5', 2.6)],
  media3_icon_play: [fill('M7,4.8L18.6,12L7,19.2Z')],
  media3_icon_pause: [fill('M6.5,4.5h3.5v15h-3.5z'), fill('M14,4.5h3.5v15h-3.5z')],
  media3_icon_next: [fill('M5.5,5L15,12L5.5,19Z'), stroke('M18.5,5.5L18.5,18.5', 2.2)],
  media3_icon_previous: [fill('M18.5,5L9,12L18.5,19Z'), stroke('M5.5,5.5L5.5,18.5', 2.2)],
  media3_icon_skip_back: [shrink([stroke('M1,4v6h6'), stroke('M3.51,15a9,9 0,1 0,2.13 -9.36L1,10')])],
  media3_icon_skip_forward: [shrink([stroke('M23,4v6h-6'), stroke('M20.49,15a9,9 0,1 1,-2.12 -9.36L23,10')])],
};

function withPlayerIcons(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      // A Media3 guarda os botões em drawable-anydpi-v21 e o ícone pequeno em drawable: o app
      // precisa de um com o mesmo qualificador para valer por cima
      for (const folder of ['drawable', 'drawable-anydpi-v21']) {
        const dir = path.join(res, folder);
        fs.mkdirSync(dir, { recursive: true });
        for (const [name, paths] of Object.entries(ICONS)) fs.writeFileSync(path.join(dir, `${name}.xml`), vector(paths));
      }
      return cfg;
    },
  ]);
}

const withPuxaAndroid = (config) => withPlayerIcons(withAnimatedWebp(withDesugaring(withShareTarget(config))));

module.exports = createRunOncePlugin(withPuxaAndroid, 'with-puxa-android', '1.1.0');
