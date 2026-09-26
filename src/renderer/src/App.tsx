import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleHelp, Copy, ExternalLink, FlaskConical, House, LibraryBig, LockOpen, Minus, Puzzle, SlidersHorizontal, Square, X } from 'lucide-react'
import { api, type Library as Lib, type Settings as Values } from './api'
import { Mark, prefetch, SeasonArt, useArtCache } from './art'
import { useI18n } from './i18n'
import Home from './pages/Home'
import Library from './pages/Library'
import Liberator from './pages/Liberator'
import Settings from './pages/Settings'
import Workshop from './pages/Workshop'
import { AccountPill, JobChip } from './session'
import { LanguagePicker, Splash } from './Start'
import Tour from './Tour'
import { UpdateProvider } from './update'

export type Page = 'home' | 'library' | 'workshop' | 'liberator' | 'settings'
export type Art = { seed: number; hue: number; image?: string }

const NAV = [
  ['home', House],
  ['library', LibraryBig],
  ['workshop', Puzzle],
  ['liberator', LockOpen],
  ['settings', SlidersHorizontal]
] as const

type Motion = '' | 'closing' | 'settle'

function firstPage(): Page {
  const hash = location.hash.slice(1)
  return NAV.some(([id]) => id === hash) ? (hash as Page) : 'home'
}

export default function App() {
  const { t, lang, chosen } = useI18n()
  const bar = useRef<HTMLElement>(null)
  const [page, setPage] = useState<Page>(firstPage)
  const [art, setArt] = useState<Art>({ seed: 41, hue: 196 })
  const [motion, setMotion] = useState<Motion>('')
  const [maximized, setMaximized] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [tour, setTour] = useState(false)
  const [notice, setNotice] = useState<Values | null>(null)
  const [settings, setSettings] = useState<Values | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [splash, setSplash] = useState(true)
  const [picking, setPicking] = useState(!chosen) // first launch: the language comes before anything else
  useArtCache() // pictures switch to their disk copy as soon as it exists

  // Order on the very first launch: splash, language, the "in development" notice, the guide. Each is
  // remembered in settings.json (the language in localStorage). After an update the changelog shows instead.
  const startGuide = (s: Values) => {
    if (s.tour_seen) return
    setTour(true)
    api.call('settings.set', { tour_seen: true })
  }
  useEffect(() => {
    api.call<Values>('settings.get').then(setSettings)
  }, [])
  useEffect(() => {
    if (!settings || splash || picking) return
    if (settings.notice_seen) startGuide(settings)
    else setNotice(settings)
  }, [settings, splash, picking])
  const readNotice = () => {
    api.call('settings.set', { notice_seen: __VERSION__ })
    if (notice) startGuide(notice)
    setNotice(null)
  }

  // every season's key art comes down in the background, one at a time: the picker opens full later
  // Longer languages (German, French…) or a narrow window: the nav drops its labels (they become tooltips)
  // rather than pushing the window buttons out. Measured with the labels on, every time something changes.
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const fit = () => {
      el.classList.remove('compact')
      // the bar itself grows with its content (a grid item): compare with the window
      el.classList.toggle('compact', el.scrollWidth > document.documentElement.clientWidth + 1)
    }
    fit()
    const observer = new ResizeObserver(fit)
    el.querySelectorAll('.brand, .nav, .top-right').forEach((child) => observer.observe(child))
    document.fonts.ready.then(fit) // the labels widen once Inter has loaded
    addEventListener('resize', fit)
    return () => {
      observer.disconnect()
      removeEventListener('resize', fit)
    }
  }, [lang])

  // the splash waits for the library too (never longer than a few seconds)
  useEffect(() => {
    const giveUp = setTimeout(() => setLoaded(true), 6000)
    api
      .call<Lib>('games.list')
      .then((l) => l.seasons.forEach((s) => prefetch(s.key)))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(giveUp)
        setLoaded(true)
      })
  }, [])

  // The window fades itself; the page adds depth: shrink on exit, settle on return.
  useEffect(
    () =>
      api.onWindow((state) => {
        if (state === 'closing') return setMotion(state)
        if (state === 'maximize' || state === 'unmaximize') setMaximized(state === 'maximize')
        setMotion('settle')
        setTimeout(() => setMotion(''), 420)
      }),
    []
  )

  const openSeason = (key: string | null) => {
    setFocus(key)
    if (key) setPage('library')
  }
  const shared = { go: setPage, setArt, focus, openSeason, startTour: () => setTour(true) }

  return (
    <UpdateProvider quiet={splash || picking || !!notice || tour}>
      <div className={`app ${motion}`}>
        <div className="backdrop" key={`${art.seed}-${art.hue}-${art.image ?? ''}`}>
          <SeasonArt cover={art.image} seed={art.seed} hue={art.hue} />
        </div>

        <header className="topbar" ref={bar}>
          <div className="brand">
            <Mark />
            <div>
              <b>NOSTALGIA</b>
              <span>
                {t('brand.tag')} {__VERSION__.replace(/\.0$/, '')}
              </span>
            </div>
          </div>
          <nav className="nav">
            {NAV.map(([id, Icon]) => (
              <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)} data-tip={t(`nav.${id}`)}>
                <Icon size={18} strokeWidth={1.8} />
                <span className="nav-label">{t(`nav.${id}`)}</span>
              </button>
            ))}
          </nav>
          <div className="top-right">
            <JobChip onOpen={openSeason} />
            <button className={`help${tour ? ' active' : ''}`} onClick={() => setTour(true)} data-tip={t('nav.guide')} aria-label={t('nav.guide')}>
              <CircleHelp size={18} strokeWidth={1.8} />
            </button>
            <AccountPill />
            <div className="winbtns">
              <button onClick={() => api.window('minimize')} aria-label={t('window.minimize')} data-tip={t('window.minimize')}>
                <Minus size={15} />
              </button>
              <button
                onClick={() => api.window('maximize')}
                aria-label={t(maximized ? 'window.restore' : 'window.maximize')}
                data-tip={t(maximized ? 'window.restore' : 'window.maximize')}
              >
                {maximized ? <Copy size={12} /> : <Square size={12} />}
              </button>
              <button className="close" onClick={() => api.window('close')} aria-label={t('window.close')} data-tip={t('window.close')} data-tip-side="left">
                <X size={16} />
              </button>
            </div>
          </div>
        </header>

        <main className="page" key={page}>
          {page === 'home' && <Home {...shared} />}
          {page === 'library' && <Library {...shared} />}
          {page === 'workshop' && <Workshop {...shared} />}
          {page === 'liberator' && <Liberator {...shared} />}
          {page === 'settings' && <Settings {...shared} />}
        </main>
        {tour && <Tour go={setPage} close={() => setTour(false)} />}
        {notice && (
          <div className="overlay">
            <div className="dialog confirm notice-dialog" role="alertdialog" aria-modal="true" aria-label={t('notice.title')}>
              <span className="confirm-icon notice-icon">
                <FlaskConical size={22} />
              </span>
              <b>{t('notice.title')}</b>
              <p>{t('notice.body', { version: __VERSION__ })}</p>
              <div className="confirm-actions">
                <a className="btn ghost" href="https://github.com/Fialsss/NostalgiaR6/issues" target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> {t('notice.report')}
                </a>
                <button className="btn primary" onClick={readNotice} autoFocus>
                  {t('notice.ok')}
                </button>
              </div>
            </div>
          </div>
        )}
        {picking && !splash && <LanguagePicker close={() => setPicking(false)} />}
        {splash && <Splash ready={loaded && !!settings} onDone={() => setSplash(false)} />}
      </div>
    </UpdateProvider>
  )
}

export type PageProps = {
  go: (page: Page) => void
  setArt: (art: Art) => void
  /** a season the Library should open straight away (null once it has) */
  focus: string | null
  openSeason: (key: string | null) => void
  startTour: () => void
}
