import { createRoot } from 'react-dom/client'
import PuxaDemo from './PuxaDemo'

// Monta a demo no espaço reservado do estado vazio. O site chama mount() só
// quando o estado vazio está na tela, para não carregar React à toa.
export function mount(el: HTMLElement) {
  const root = createRoot(el)
  root.render(<PuxaDemo />)
  return () => root.unmount()
}
