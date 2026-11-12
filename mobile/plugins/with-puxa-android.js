// Ajustes nativos do Android que o app.json não cobre sozinho.
const { withAndroidManifest, withAppBuildGradle, withGradleProperties, AndroidConfig, createRunOncePlugin } = require('expo/config-plugins');

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

const withPuxaAndroid = (config) => withAnimatedWebp(withDesugaring(withShareTarget(config)));

module.exports = createRunOncePlugin(withPuxaAndroid, 'with-puxa-android', '1.0.0');
