import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Gamepad2, LibraryBig, LockOpen, LogIn } from 'lucide-react'
import type { Page } from './App'
import { Mark } from './art'
import { useI18n } from './i18n'
import { DISCORD, DiscordIcon } from './ui'
import { useSession } from './session'

type Step = { key: string; page?: Page; target?: string }

// Each step optionally switches page and points at one element. One sentence each, no walls of text.
const STEPS: Step[] = [
  { key: 'welcome' },
  { key: 'steam', target: '.account' },
  { key: 'add', page: 'library', target: '.install.add' },
  { key: 'download', page: 'library', target: '.top-right' },
  { key: 'play', page: 'library', target: '.install:not(.add)' },
  { key: 'liberator', page: 'liberator', target: '.nav button.active' },
  { key: 'controls', page: 'settings', target: '.settings-nav button:nth-child(3)' },
  { key: 'done', target: '.help' }
]
const FEATURES = [
  ['library', LibraryBig],
  ['offline', Gamepad2],
  ['liberator', LockOpen]
] as const
const PAD = 8
const GAP = 16

type Box = { top: number; left: number; width: number; height: number; radius: number; lit: boolean }

// With nothing to point at, the light closes to a point behind the card: the whole app stays dim.
const closed = (): Box => ({ top: innerHeight / 2, left: innerWidth / 2, width: 0, height: 0, radius: 0, lit: false })

/** A guided tour in a small card: dims the app and lights up the part to use next. */
export default function Tour({ go, close }: { go: (page: Page) => void; close: () => void }) {
  const { t } = useI18n()
  const { profile, signIn } = useSession()
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)
  // opens from the window's edges, then closes in on the first step
  const [box, setBox] = useState<Box>({ top: 0, left: 0, width: innerWidth, height: innerHeight, radius: 0, lit: false })
  const card = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(0)
  const [bodyH, setBodyH] = useState<number | undefined>(undefined)
  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const wide = step.key === 'welcome'
  const cardW = wide ? 400 : 340

  const move = (to: number) => {
    setDir(to > index ? 1 : -1)
    setIndex(to)
  }

  useEffect(() => {
    if (step.page) go(step.page)
  }, [index])

  // Targets render late (page switch, data loading) and move (resize, scroll): keep measuring.
  useEffect(() => {
    let scrolled = false
    const measure = () => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null
      if (!el) return setBox(closed())
      if (!scrolled) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        scrolled = true
      }
      const r = el.getBoundingClientRect()
      // follow the element's own corners: a pill stays a pill, a card keeps its radius
      const own = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      const height = r.height + PAD * 2
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height, radius: Math.min(own + PAD, height / 2), lit: true })
    }
    const first = requestAnimationFrame(measure)
    const timer = setInterval(measure, 200)
    return () => {
      cancelAnimationFrame(first)
      clearInterval(timer)
    }
  }, [index])

  // the card grows and shrinks with its content instead of jumping (each step renders a new body)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    setBodyH(el.scrollHeight)
    const observer = new ResizeObserver(() => setBodyH(el.scrollHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])
  useLayoutEffect(() => setCardH(card.current?.offsetHeight ?? 0))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight' && !last) move(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) move(index - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [index])

  // Beside the lit element (below when there is room) with a caret pointing at it; centred otherwise.
  let top = innerHeight / 2 - cardH / 2
  let left = innerWidth / 2 - cardW / 2
  let side = ''
  let caret = cardW / 2
  if (box.lit) {
    const below = box.top + box.height + GAP
    const fits = below + cardH < innerHeight - 16
    top = fits ? below : Math.max(16, box.top - cardH - GAP)
    left = Math.min(Math.max(16, box.left + box.width / 2 - cardW / 2), innerWidth - cardW - 16)
    caret = Math.min(Math.max(22, box.left + box.width / 2 - left), cardW - 22)
    side = fits ? ' below' : ' above'
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('tour.label')}>
      <div className={`tour-spot${box.lit ? ' lit' : ''}`} style={{ top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: box.radius }}>
        {box.lit && <i className="tour-beacon" key={index} style={{ borderRadius: box.radius }} />}
      </div>
      <div ref={card} className={`tour-card${side}`} style={{ top, left, width: cardW, '--caret': `${caret}px` } as React.CSSProperties}>
        <div className="tour-viewport" style={{ height: bodyH }}>
          <div ref={body} className={`tour-body${wide ? ' center' : ''}`} key={step.key} style={{ '--from': `${dir * 18}px` } as React.CSSProperties}>
            {step.key === 'welcome' && <Mark size={40} />}
            <span className="tour-step">{t('tour.count', { n: index + 1, total: STEPS.length })}</span>
            <b className="tour-title">{t(`tour.${step.key}.title`)}</b>
            <p>{t(`tour.${step.key}.body`)}</p>

            {step.key === 'welcome' && (
              <div className="tour-features">
                {FEATURES.map(([key, Icon]) => (
                  <span key={key}>
                    <Icon size={18} strokeWidth={1.8} />
                    {t(`tour.feature.${key}`)}
                  </span>
                ))}
              </div>
            )}
            {step.key === 'steam' &&
              (profile ? (
                <span className="chip ok dot">{t('tour.signedIn', { user: profile.name })}</span>
              ) : (
                <button className="btn primary small" onClick={signIn}>
                  <LogIn size={14} /> {t('tour.signInNow')}
                </button>
              ))}
            {step.key === 'done' && (
              <a className="btn discord small" href={DISCORD} target="_blank" rel="noreferrer">
                <DiscordIcon /> {t('discord.join')}
              </a>
            )}
          </div>
        </div>

        <div className="tour-foot">
          <button className="link-btn muted" onClick={close}>
            {t('tour.skip')}
          </button>
          <div className="row">
            {index > 0 && (
              <button className="btn ghost small" onClick={() => move(index - 1)} aria-label={t('tour.back')} data-tip={t('tour.back')}>
                <ArrowLeft size={14} />
              </button>
            )}
            {last ? (
              <button className="btn primary small" onClick={close}>
                <Check size={14} /> {t('tour.finish')}
              </button>
            ) : (
              <button className="btn primary small" onClick={() => move(index + 1)}>
                {t(index === 0 ? 'tour.start' : 'tour.next')} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
