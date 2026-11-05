// Empacota a demo para o site estático.
// O CSS do kit sai em /demo/kit/stageshow.css, separado do CSS da cena: assim o
// navegador carrega o kit uma vez e a checagem "kit override" da skill distingue
// o que é do kit do que é da cena.
import { build } from 'esbuild'

const OUT = '../static/demo'

// Os componentes do kit importam o próprio CSS; aqui esses imports viram vazios,
// porque o kit inteiro entra pelo stageshow.css abaixo.
const dropKitCss = {
  name: 'drop-kit-css',
  setup(b) {
    b.onLoad({ filter: /[\\/]kit[\\/].*\.css$/ }, () => ({ contents: '', loader: 'css' }))
  },
}

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  jsx: 'automatic',
  target: 'es2020',
  loader: { '.svg': 'file' },
  outfile: `${OUT}/demo.js`,
  plugins: [dropKitCss],
  logLevel: 'info',
})

await build({
  entryPoints: ['kit/stageshow.css'],
  bundle: true,
  minify: true,
  outfile: `${OUT}/kit/stageshow.css`,
  logLevel: 'info',
})
