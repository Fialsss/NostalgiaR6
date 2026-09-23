import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Download, HardDrive, LibraryBig, LockOpen, LogIn, Play, Power, Puzzle } from 'lucide-react'
import type { Page, PageProps } from '../App'
import { api, bytes, GB, seedOf, useLibrary } from '../api'
import { hueOf, keyArt, Mark, SeasonArt } from '../art'
import { useI18n } from '../i18n'
import { Avatar, useSession } from '../session'
import { Spinner } from '../ui'

// each slide wears the key art of a season that shows it off
const SLIDES = [
  { id: 'library', season: 'Y1S0_Vanilla', page: 'library', icon: LibraryBig, alt: 'liberator' },
  { id: 'liberator', season: 'Y3S3_GrimSky', page: 'liberator', icon: LockOpen, alt: 'library' },
  { id: 'mods', season: 'Y5S3_ShadowLegacy', page: 'library', icon: Puzzle, alt: 'settings' }
] as const
const SLIDE_MS = 8000
const CLASSICS = ['Y1S0', 'Y2S3', 'Y3S3', 'Y5S3']

type Tools = { depot: boolean; loader: boolean; liberator: boolean }

/** "2 hours ago", "yesterday", in the page's language. */
function ago(at: number, lang: string): string {
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const seconds = (at - Date.now()) / 1000
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]] as const
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  return format.format(0, 'minute')
}

export default function Home({ go, setArt, openSeason }: PageProps) {
  const { t, lang } = useI18n()
  const { profile, playing, signIn, toast } = useSession()
  const [library] = useLibrary()
  const [tools, setTools] = useState<Tools | null>(null)
  const [fixing, setFixing] = useState('')
  const [starting, setStarting] = useState(false)
  const [index, setIndex] = useState(0)

  // the season played last comes first, and the carousel waits on it: its Play button stays put
  const last = library?.seasons.find((s) => s.key === library.last.key && s.installed)
  const slides = last ? [{ id: 'continue', season: last.key }, ...SLIDES] : SLIDES
  const slide = slides[Math.min(index, slides.length - 1)]
  const seed = seedOf({ id: slide.season })

  const loadTools = () => api.call<Tools>('games.tools').then(setTools)
  useEffect(() => {
    loadTools()
  }, [])
  useEffect(() => {
    setArt({ seed, hue: hueOf(slide.season), image: keyArt(slide.season) })
    if (slide.id === 'continue') return
    const timer = setTimeout(() => setIndex((index + 1) % slides.length), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [index, slides.length])

  const step = (delta: number) => setIndex((index + delta + slides.length) % slides.length)
  const fetchTool = async (key: string, method: string) => {
    setFixing(key)
    try {
      await api.call(method)
      await loadTools()
    } catch (e) {
      toast(t((e as Error).message), 'bad')
    } finally {
      setFixing('')
    }
  }
  const play = async () => {
    if (!last) return
    setStarting(true)
    try {
      await api.call('games.launch', { key: last.key })
      toast(t('toast.launched', { season: last.id }), 'ok')
    } catch (e) {
      toast(t((e as Error).message), 'bad')
    } finally {
      setStarting(false)
    }
  }

  const seasons = library?.seasons ?? []
  const mine = seasons.filter((s) => s.installed || s.partial)
  const shelf = [...mine, ...seasons.filter((s) => CLASSICS.includes(s.id) && !mine.includes(s))].slice(0, 4)
  const roomy = !!library && library.free >= 15 * GB

  const checks = [
    { key: 'steam', icon: LogIn, ok: !!profile, fix: signIn, detail: profile ? profile.name : t('check.steam.hint') },
    {
      key: 'library', icon: HardDrive, ok: roomy, fix: () => go('settings'),
      detail: library ? t('check.library.free', { free: bytes(library.free) }) : '…'
    },
    {
      key: 'depot', icon: Download, ok: tools?.depot, fix: () => fetchTool('depot', 'steam.tool'),
      detail: tools?.depot ? t('check.depot.ok') : t('check.depot.hint')
    },
    {
      key: 'liberator', icon: LockOpen, ok: tools?.liberator, fix: () => fetchTool('liberator', 'liberator.fetch'),
      detail: tools?.liberator ? t('check.liberator.ok') : t('check.liberator.hint')
    }
  ]
  const known = tools != null && library != null
  const missing = checks.filter((c) => !c.ok).length

  return (
    <div className="home">
      <section className="hero">
        <SeasonArt className="hero-art" cover={keyArt(slide.season)} seed={seed} hue={hueOf(slide.season)} key={slide.id} />
        <div className="hero-veil" />
        <div className="hero-arrows">
          <button onClick={() => step(-1)} aria-label={t('home.prev')} data-tip={t('home.prev')}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => step(1)} aria-label={t('home.next')} data-tip={t('home.next')}>
            {slide.id !== 'continue' && (
              <svg className="ring" viewBox="0 0 36 36" key={index}>
                <circle cx="18" cy="18" r="16.5" style={{ animationDuration: `${SLIDE_MS}ms` }} />
              </svg>
            )}
            <ChevronRight size={16} />
          </button>
        </div>
        {slide.id === 'continue' && last ? (
          <div className="hero-body" key={slide.id}>
            <span className="welcome" style={{ '--i': 0 } as React.CSSProperties}>
              <Mark size={14} /> {t('home.welcome', { version: __VERSION__.replace(/\.0$/, '') })}
            </span>
            <div className="eyebrow" style={{ '--i': 1 } as React.CSSProperties}>
              {t('slide.continue.eyebrow', { when: ago(library!.last.at, lang) })}
            </div>
            <h2 style={{ '--i': 2 } as React.CSSProperties}>
              {last.name}
              <span>
                {last.id} · {last.date.slice(0, 4)}
              </span>
            </h2>
            <p style={{ '--i': 3 } as React.CSSProperties}>{t(last.hmInstalled ? 'slide.continue.bodyHm' : 'slide.continue.body')}</p>
            <div className="hero-actions" style={{ '--i': 4 } as React.CSSProperties}>
              {playing === last.key ? (
                <button className="btn ghost danger" onClick={() => api.call('games.stop')}>
                  <Power size={15} /> {t('play.stop')}
                </button>
              ) : (
                <button className="btn primary play-btn" onClick={play} disabled={starting || !!playing}>
                  {starting ? <Spinner /> : <Play size={17} fill="currentColor" />} {t('play.play')}
                </button>
              )}
              <button className="btn ghost" onClick={() => openSeason(last.key)}>
                {t('slide.continue.open')} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          'page' in slide && (
            <div className="hero-body" key={slide.id}>
              <span className="welcome" style={{ '--i': 0 } as React.CSSProperties}>
                <Mark size={14} /> {t('home.welcome', { version: __VERSION__.replace(/\.0$/, '') })}
              </span>
              <div className="eyebrow" style={{ '--i': 1 } as React.CSSProperties}>
                {t(`slide.${slide.id}.eyebrow`)}
              </div>
              <h2 style={{ '--i': 2 } as React.CSSProperties}>
                {t(`slide.${slide.id}.title`)}
                <span>{t(`slide.${slide.id}.title2`)}</span>
              </h2>
              <p style={{ '--i': 3 } as React.CSSProperties}>{t(`slide.${slide.id}.body`)}</p>
              <div className="hero-actions" style={{ '--i': 4 } as React.CSSProperties}>
                <button className="btn primary" onClick={() => go(slide.page as Page)}>
                  <slide.icon size={16} /> {t(`slide.${slide.id}.cta`)}
                </button>
                <button className="btn ghost" onClick={() => go(slide.alt as Page)}>
                  {t(`nav.${slide.alt}`)} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )
        )}
        <div className="hero-dots">
          {slides.map((s, i) => (
            <button key={s.id} className={i === index ? 'on' : ''} onClick={() => setIndex(i)} aria-label={t(`slide.${s.id}.eyebrow`, { when: '' })} />
          ))}
        </div>
      </section>

      <aside className="home-side">
        <div className="card ready">
          <div className="ready-head">
            <div className="grow">
              <div className="label">{t('home.setup')}</div>
              <b>{!known ? '…' : missing ? t(missing === 1 ? 'home.fixOne' : 'home.fixMany', { n: missing }) : t('home.allReady')}</b>
            </div>
            <span className={`ready-count${missing ? '' : ' full'}`}>
              {checks.length - missing}/{checks.length}
            </span>
          </div>
          <div className="ready-bar" aria-hidden="true">
            {checks.map((c) => (
              <i key={c.key} className={!known ? '' : c.ok ? 'ok' : 'todo'} />
            ))}
          </div>
          <ul className="checks">
            {checks.map(({ key, icon: Icon, ok, detail, fix }) => (
              <li key={key} className={ok ? 'ok' : ''}>
                <span className="check-icon">{key === 'steam' && profile ? <Avatar profile={profile} size={30} /> : <Icon size={16} strokeWidth={1.8} />}</span>
                <div className="grow">
                  <b>{t(`check.${key}`)}</b>
                  <small>{detail}</small>
                </div>
                {!known ? null : fixing === key ? (
                  <Spinner />
                ) : ok ? (
                  <CheckCircle2 size={18} className="check-ok" aria-label={t('state.ready')} />
                ) : (
                  <button className="btn ghost small" onClick={fix}>
                    {t(key === 'steam' ? 'check.signIn' : key === 'library' ? 'check.set' : 'check.get')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card grow-card shelf">
          <div className="shelf-head">
            <div className="label">{t(mine.length ? 'home.yours' : 'home.classics')}</div>
            <span className="mono dim">{library ? t('home.count', { n: seasons.length, mine: mine.length }) : '…'}</span>
          </div>
          <div className="mini-covers">
            {shelf.map((s) => (
              <button key={s.key} className="mini-cover" onClick={() => openSeason(s.key)}>
                <SeasonArt cover={keyArt(s.key)} seed={seedOf(s)} hue={hueOf(s.id)} />
                {s.installed && <i className="mini-dot" aria-label={t('state.installed')} />}
                <span>
                  <small className="mono">{s.id}</small>
                  <b>{s.name}</b>
                </span>
              </button>
            ))}
          </div>
          <button className="btn fill wide" onClick={() => go('library')}>
            <LibraryBig size={15} /> {t('home.openLibrary')}
          </button>
        </div>
      </aside>
    </div>
  )
}
