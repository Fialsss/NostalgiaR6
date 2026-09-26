import { useEffect, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Mark } from './art'
import { Flag } from './flags'
import { LANGS, useI18n, type Lang } from './i18n'

const LETTERS = 'NOSTALGIA'.split('')
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The launch: the mark lights up, the name spells itself out and a line fills while the library is read.
 * It stays at least `min` ms so it reads as an intro, not a flicker, and leaves as soon as both are done.
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { t } = useI18n()
  const [started, setStarted] = useState(false)
  const [min, setMin] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const timers = [setTimeout(() => setStarted(true), 600), setTimeout(() => setMin(true), reduced() ? 300 : 1700)]
    return () => timers.forEach(clearTimeout)
  }, [])
  useEffect(() => {
    if (!min || !ready) return
    setLeaving(true)
    const timer = setTimeout(onDone, reduced() ? 0 : 520)
    return () => clearTimeout(timer)
  }, [min, ready])

  const step = ready && started ? 'splash.ready' : started ? 'splash.library' : 'splash.start'
  return (
    <div className={`splash${leaving ? ' leaving' : ''}`} aria-busy={!leaving} aria-label="Nostalgia">
      <div className="splash-glow" />
      <div className="splash-mark">
        <Mark size={84} />
        <i className="splash-ring" />
      </div>
      <div className="splash-name" aria-hidden="true">
        {LETTERS.map((l, i) => (
          <span key={i} style={{ animationDelay: `${0.35 + i * 0.05}s` }}>
            {l}
          </span>
        ))}
      </div>
      <div className={`splash-bar${ready ? ' done' : ''}`}>
        <i />
      </div>
      <small className="splash-step" key={step}>
        {t(step)}
      </small>
    </div>
  )
}

/** Every language as its flag and its own name; the one in use is ticked. */
export function LanguageGrid({ compact = false, onPick }: { compact?: boolean; onPick?: (lang: Lang) => void }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={`lang-grid${compact ? ' compact' : ''}`} role="radiogroup">
      {LANGS.map(([id, name]) => (
        <button
          key={id}
          role="radio"
          aria-checked={lang === id}
          className={`lang-option${lang === id ? ' on' : ''}`}
          onClick={() => {
            setLang(id)
            onPick?.(id)
          }}
        >
          <Flag lang={id} size={compact ? 22 : 30} />
          <span className="grow">{name}</span>
          {lang === id && <Check size={14} className="lang-check" />}
        </button>
      ))}
    </div>
  )
}

/** First launch: pick a language before anything else. The texts switch as soon as a flag is picked. */
export function LanguagePicker({ close }: { close: () => void }) {
  const { t, lang, setLang } = useI18n()
  // Continue keeps the preselected (system) language too: it's a choice all the same
  const done = () => {
    setLang(lang)
    close()
  }
  return (
    <div className="tour lang-picker" role="dialog" aria-modal="true" aria-label={t('lang.title')}>
      <div className="tour-card lang-card">
        <div className="tour-body center">
          <Mark size={40} />
          <b className="tour-title">{t('lang.title')}</b>
          <p>{t('lang.body')}</p>
          <LanguageGrid />
        </div>
        <div className="tour-foot end">
          <button className="btn primary small" onClick={done} autoFocus>
            {t('lang.continue')} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
