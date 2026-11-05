import { Stage } from '../kit/stage'
import type { Act } from '../kit/act'
import { Phone } from '../kit/phone'
import { Bar } from '../kit/window'
import { Roll } from '../kit/motion/Roll'
import { States } from '../kit/motion/States'
import { Avatar } from '../kit/parts/Avatar'
import { Toast } from '../kit/parts/Toast'
import { Spinner } from '../kit/parts/Spinner'
import { Segmented } from '../kit/controls/Segmented'
import { AudioLines, Check, Play, X } from 'lucide-react'
import './puxa-demo.css'

// Puxa's empty-state demo: "a flow in an app" on a phone, told in three beats.
// 1. A finger drags the clip's start handle from 0:10 to 0:31; the handle's
//    time reads live under it, and the button's length rolls a beat later,
//    as a total that follows the edit that feeds it.
// 2. A tap on "Enviar trecho" cuts it (Cortando…), and the share sheet rises
//    with the clip as a file.
// 3. A tap on a conversation hands it over; the sheet goes down and the same
//    toast the real site shows arrives: "Entregue ao WhatsApp". That's the payoff.
// The editor resets while the sheet covers it, so nothing rewinds in view.
//
// Real strings: the video title, the two option labels, the handle times,
// the button, the file name and size, one contact, the toast. The rest is bars.

const DUR = 120 // a 2:00 clip keeps the handles well apart on the track
const START = 10
const END = 58
const TRIMMED = 31

type Phase = 'idle' | 'cutting'
type S = { start: number; shown: number; phase: Phase; sheet: boolean; toast: boolean }

const INITIAL: S = { start: START, shown: START, phase: 'idle', sheet: false, toast: false }

const clock = (t: number) => {
  const r = Math.round(t)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

// A deterministic waveform: two slow swells and a faster texture
const BARS = Array.from({ length: 56 }, (_, i) => {
  const v = 0.42 + 0.3 * Math.sin(i * 0.23) * Math.sin(i * 0.07 + 1.1) + 0.22 * Math.abs(Math.sin(i * 1.7))
  return Math.max(0.16, Math.min(1, v))
})

const REST = { wide: { x: 340, y: 230 }, compact: { x: 318, y: 230 } }

const script = async (a: Act<S>) => {
  await a.wait(700)
  a.mark('drag')
  await a.move('start')
  const track = a.rect('track')
  const handle = a.rect('start')
  const y = handle.y + handle.height / 2
  await a.drag(
    { x: track.x + (track.width * TRIMMED) / DUR, y },
    (at) => {
      const t = ((at.x - track.x) / track.width) * DUR
      // Contínuo sob o dedo; só o texto arredonda
      a.put({ start: Math.min(Math.max(t, 0), END - 1) })
    },
    { duration: 1400 },
  )
  a.put({ start: TRIMMED })
  await a.wait(350)
  // The length the button sends follows the edit, a beat later
  a.put({ shown: TRIMMED })
  await a.wait(1300)
  a.mark('send')
  await a.click({ at: 'send', x: 0.82, y: 0.55 })
  a.put({ phase: 'cutting' })
  await a.wait(850)
  a.put({ sheet: true })
  await a.wait(1500)
  a.mark('pick')
  await a.click({ at: 'contact', x: 0.5, y: 0.4 })
  // Hidden under the sheet: the editor is ready for the next clip
  await a.snap({ start: START, shown: START, phase: 'idle' }, 'editor')
  a.put({ sheet: false })
  await a.wait(420)
  a.put({ toast: true })
  await a.wait(2300)
  a.put({ toast: false })
  // O toque não aparece entre um gesto e outro; o próximo arraste começa logo
  await a.wait(500)
}

export default function PuxaDemo() {
  return (
    <Stage<S>
      width={374}
      height={420}
      compact={{ below: 374, width: 350, height: 420 }}
      initial={INITIAL}
      poster={{ start: TRIMMED, shown: TRIMMED, phase: 'idle', sheet: false, toast: true }}
      script={script}
      cursor={{ at: REST, style: 'touch' }}
      className="pd"
    >
      {(s, _rect, layout) => {
        const left = (s.start / DUR) * 100
        const right = (END / DUR) * 100
        return (
          <Phone width={layout === 'compact' ? 306 : 330} className="pd-phone" time="9:41">
            <div className="pd-screen">
              <div className="pd-above">
                {[
                  [96, 40],
                  [84, 36],
                ].map(([w, size], i) => (
                  <span key={i} className="pd-above__row">
                    <span className="pd-radio" data-on={i === 1 || undefined} />
                    <Bar w={w} h={8} r={4} tone={3} />
                    <span className="pd-above__size">
                      <Bar w={size} h={8} r={4} tone={2} />
                    </span>
                  </span>
                ))}
              </div>

              <div className="pd-video">
                <span className="pd-thumb" />
                <span className="pd-video__text">
                  <span className="pd-video__title">Aula 12: acordes com pestana</span>
                  <Bar w={118} h={7} r={3} tone={2} />
                </span>
              </div>

              <div data-target="editor" className="pd-editor">
                <Segmented className="pd-seg" items={['Áudio inteiro', 'Só um trecho']} value={1} />

                <div className="pd-wave">
                  <div className="pd-track" data-target="track">
                    {BARS.map((h, i) => {
                      const at = ((i + 0.5) / BARS.length) * 100
                      return <span key={i} className="pd-bar" data-in={(at >= left && at <= right) || undefined} style={{ height: `${h * 100}%` }} />
                    })}
                    <span className="pd-handle" data-target="start" style={{ left: `${left}%` }} />
                    <span className="pd-handle" style={{ left: `${right}%` }} />
                  </div>
                  <div className="pd-times">
                    <span className="pd-time" style={{ left: `${left}%` }}>{clock(s.start)}</span>
                    <span className="pd-time" style={{ left: `${right}%` }}>{clock(END)}</span>
                  </div>
                </div>

                <span className="pd-listen">
                  <span className="pd-listen__btn">
                    <Play size={14} strokeWidth={0} fill="currentColor" /> Ouvir trecho
                  </span>
                  <Bar w={96} h={7} r={3} tone={2} />
                </span>

                <span className="pd-send" data-target="send">
                  <States
                    value={s.phase}
                    states={{
                      idle: (
                        <span className="pd-send__label">
                          Enviar trecho de<Roll>{clock(END - s.shown)}</Roll>
                        </span>
                      ),
                      cutting: (
                        <span className="pd-send__label">
                          <Spinner /> Cortando…
                        </span>
                      ),
                    }}
                  />
                </span>
              </div>

              <div className="pd-toast-lane">
                <Toast
                  show={s.toast}
                  className="pd-toast"
                  icon={
                    <span className="pd-toast-icon">
                      <Check size={16} strokeWidth={2.6} />
                    </span>
                  }
                >
                  Entregue ao WhatsApp
                </Toast>
              </div>

              <div className="pd-scrim" data-open={s.sheet || undefined} />
              <div className="pd-sheet" data-open={s.sheet || undefined}>
                <div className="pd-sheet__head">
                  <span className="pd-file">
                    <AudioLines size={20} strokeWidth={2} />
                  </span>
                  <span className="pd-sheet__file">
                    <span className="pd-sheet__name">Aula 12 (trecho).mp3</span>
                    <span className="pd-sheet__meta">Áudio MP3, 432 KB</span>
                  </span>
                  <span className="pd-close">
                    <X size={16} strokeWidth={2.4} />
                  </span>
                </div>
                <div className="pd-people">
                  <span className="pd-person" data-target="contact">
                    <Avatar name="Turma do violão" size={62} />
                    <span className="pd-person__name">Turma do violão</span>
                  </span>
                  {[44, 36, 50].map((w, i) => (
                    <span key={i} className="pd-person">
                      <Avatar size={62} />
                      <Bar w={w} h={7} r={3} tone={2} />
                    </span>
                  ))}
                </div>
                <div className="pd-list">
                  {[132, 104].map((w, i) => (
                    <span key={i} className="pd-list__row">
                      <Bar w={w} h={8} r={4} tone={3} />
                      <span className="pd-list__icon" />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Phone>
        )
      }}
    </Stage>
  )
}
