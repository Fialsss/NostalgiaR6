import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ArrowUpCircle, Download, ExternalLink, ScrollText, X } from 'lucide-react'
import { api, useEvent, type Settings } from './api'
import { useI18n } from './i18n'
import { Spinner } from './ui'

const RELEASES = 'https://github.com/Fialsss/NostalgiaR6/releases'

type Note = { version: string; title: string; date: string; body: string; url: string }
type Info = { current: string; latest: string; available: boolean; kind: 'portable' | 'setup' | 'dev'; notes: Note[] }
type Phase = { state: 'idle' } | { state: 'downloading'; percent: number } | { state: 'restarting' } | { state: 'failed'; error: string }

type Updates = {
  info: Info | null
  offline: boolean
  phase: Phase
  install: () => void
  /** the changelog, opened on a version (the newest when none) */
  showLog: (version?: string) => void
}
const Context = createContext<Updates | null>(null)
export const useUpdates = () => useContext(Context)!

/**
 * Asks GitHub once per launch whether a newer Nostalgia is out. The card in the corner says so (unless
 * `quiet`: the splash, the language picker); the profile menu keeps an "Update" entry until it's done.
 */
export function UpdateProvider({ quiet, children }: { quiet: boolean; children: ReactNode }) {
  const { t } = useI18n()
  const [info, setInfo] = useState<Info | null>(null)
  const [offline, setOffline] = useState(false)
  const [phase, setPhase] = useState<Phase>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [log, setLog] = useState<string | null>(null)

  const check = () =>
    api
      .call<Info>('update.check')
      .then((i) => {
        setInfo(i)
        setOffline(false)
        return i
      })
      .catch(() => {
        setOffline(true)
        return null
      })
  useEffect(() => {
    check().then((i) => {
      // first launch after an update (a version was seen before, not this one): what changed, once.
      // A first install gets the "early preview" notice instead (App).
      api.call<Settings>('settings.get').then((s) => {
        if (!s.notice_seen || s.notice_seen === __VERSION__) return
        if (i?.notes.some((n) => n.version === __VERSION__)) setLog(__VERSION__)
        api.call('settings.set', { notice_seen: __VERSION__ })
      })
    })
  }, [])

  useEvent<{ done: number; total: number }>('update.progress', ({ done, total }) =>
    setPhase({ state: 'downloading', percent: total ? (done / total) * 100 : 0 })
  )
  useEvent('update.ready', () => setPhase({ state: 'restarting' }))

  const install = () => {
    if (phase.state === 'downloading' || phase.state === 'restarting') return
    setPhase({ state: 'downloading', percent: 0 })
    api.call('update.install').catch((e: Error) => setPhase({ state: 'failed', error: e.message }))
  }
  const showLog = (version?: string) => {
    setLog(version ?? info?.notes[0]?.version ?? '')
    if (!info || offline) check()
  }

  const card = info?.available && !quiet && log === null && (!dismissed || phase.state !== 'idle')
  return (
    <Context.Provider value={{ info, offline, phase, install, showLog }}>
      {children}
      {card && (
        <div className="update-card" role="status">
          <span className="update-icon">
            <ArrowUpCircle size={20} />
          </span>
          <div className="grow">
            <b>{t('update.title')}</b>
            {phase.state === 'idle' && <p>{t('update.body', { version: info.latest })}</p>}
            <Progress phase={phase} />
            <div className="update-actions">
              {phase.state === 'idle' && (
                <>
                  <button className="btn primary small" onClick={install}>
                    <Download size={14} /> {t('update.now')}
                  </button>
                  <button className="btn ghost small" onClick={() => showLog()}>
                    <ScrollText size={14} /> {t('changelog.title')}
                  </button>
                </>
              )}
              {phase.state === 'failed' && (
                <button className="btn primary small" onClick={install}>
                  {t('update.now')}
                </button>
              )}
            </div>
          </div>
          {(phase.state === 'idle' || phase.state === 'failed') && (
            <button
              className="dialog-close"
              onClick={() => setDismissed(true)}
              aria-label={t('update.later')}
              data-tip={t('update.later')}
              data-tip-side="left"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {log !== null && !quiet && <Changelog focus={log} close={() => setLog(null)} />}
    </Context.Provider>
  )
}

function Progress({ phase }: { phase: Phase }) {
  const { t } = useI18n()
  if (phase.state === 'downloading')
    return (
      <div className="update-progress">
        <small>{t('update.downloading', { percent: phase.percent.toFixed(0) })}</small>
        <i style={{ '--p': `${phase.percent}%` } as React.CSSProperties} />
      </div>
    )
  if (phase.state === 'restarting')
    return (
      <small className="update-state">
        <Spinner /> {t('update.restarting')}
      </small>
    )
  if (phase.state === 'failed')
    return (
      <small className="update-state bad">
        {phase.error.startsWith('update.') ? t(phase.error) : phase.error}{' '}
        <a className="link-btn" href={RELEASES} target="_blank" rel="noreferrer">
          {t('update.github')} <ExternalLink size={11} />
        </a>
      </small>
    )
  return null
}

/** The profile menu's entry: "Update (0.2.0)" while one is out, the version with a Latest tag otherwise. */
export function UpdateMenuItems({ close }: { close: () => void }) {
  const { t } = useI18n()
  const { info, phase, install, showLog } = useUpdates()
  return (
    <>
      {info?.available ? (
        <button className="menu-item update" role="menuitem" onClick={install} disabled={phase.state === 'downloading' || phase.state === 'restarting'}>
          <ArrowUpCircle size={15} />
          <span className="grow">{t('update.menu', { version: info.latest })}</span>
          {phase.state === 'downloading' && <small className="mono">{phase.percent.toFixed(0)}%</small>}
        </button>
      ) : (
        <div className="menu-row">
          <span>{t('update.version', { version: __VERSION__ })}</span>
          {info && <span className="chip ok dot">{t('update.latest')}</span>}
        </div>
      )}
      <button
        className="menu-item"
        role="menuitem"
        onClick={() => {
          close()
          showLog()
        }}
      >
        <ScrollText size={15} /> {t('changelog.open')}
      </button>
    </>
  )
}

function Changelog({ focus, close }: { focus: string; close: () => void }) {
  const { t, lang } = useI18n()
  const { info, offline, phase, install } = useUpdates()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    document.getElementById(`v${focus}`)?.scrollIntoView({ block: 'start' })
  }, [focus, info])
  const date = (at: string) => new Date(at).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog changelog" role="dialog" aria-modal="true" aria-label={t('changelog.title')}>
        <button className="dialog-close" onClick={close} aria-label={t('window.close')}>
          <X size={16} />
        </button>
        <div className="changelog-head">
          <span className="confirm-icon">
            <ScrollText size={20} />
          </span>
          <div>
            <b>{t('changelog.title')}</b>
            {lang !== 'en' && <small>{t('changelog.english')}</small>}
          </div>
        </div>
        <div className="changelog-list">
          {!info && !offline && (
            <p className="changelog-empty">
              <Spinner /> {t('changelog.loading')}
            </p>
          )}
          {!info && offline && <p className="changelog-empty">{t('changelog.offline')}</p>}
          {info?.notes.map((n) => (
            <article key={n.version} id={`v${n.version}`} className="release">
              <header>
                <span className="mono release-version">v{n.version}</span>
                {n.version === info.current && <span className="chip ok dot">{t('changelog.current')}</span>}
                {info.available && n.version === info.latest && <span className="chip info dot">{t('changelog.new')}</span>}
                <small className="grow">{date(n.date)}</small>
                <a className="link-btn muted" href={n.url} target="_blank" rel="noreferrer" aria-label="GitHub" data-tip="GitHub" data-tip-side="left">
                  <ExternalLink size={13} />
                </a>
              </header>
              <Markdown text={n.body} />
            </article>
          ))}
        </div>
        {info?.available && (
          <div className="changelog-foot">
            <Progress phase={phase} />
            {(phase.state === 'idle' || phase.state === 'failed') && (
              <button className="btn primary" onClick={install}>
                <Download size={15} /> {t('update.menu', { version: info.latest })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Just enough Markdown for release notes: headings, lists, quotes, tables, **bold**, `code`, links. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const take = (test: (l: string) => boolean) => {
      const group: string[] = []
      while (i < lines.length && test(lines[i])) group.push(lines[i++])
      i--
      return group
    }
    if (!line.trim()) continue
    const heading = /^(#{1,6})\s+(.*)/.exec(line)
    if (heading) blocks.push(<h4 key={i}>{inline(heading[2])}</h4>)
    else if (/^\s*[-*]\s/.test(line))
      blocks.push(
        <ul key={i}>
          {take((l) => /^\s*[-*]\s/.test(l)).map((l, k) => (
            <li key={k}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>
          ))}
        </ul>
      )
    else if (line.startsWith('>')) {
      const quote = take((l) => l.startsWith('>'))
        .map((l) => l.replace(/^>\s?/, ''))
        .filter((l) => !/^\[!\w+\]$/.test(l.trim()))
      blocks.push(<blockquote key={i}>{inline(quote.join(' '))}</blockquote>)
    } else if (line.startsWith('|')) {
      const rows = take((l) => l.startsWith('|'))
        .filter((l) => !/^\|[\s|:-]+\|$/.test(l))
        .map((l) =>
          l
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
        )
      blocks.push(
        <table key={i}>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k}>{r.map((c, j) => (k === 0 ? <th key={j}>{inline(c)}</th> : <td key={j}>{inline(c)}</td>))}</tr>
            ))}
          </tbody>
        </table>
      )
    } else blocks.push(<p key={i}>{inline(take((l) => !!l.trim() && !/^(#|>|\||\s*[-*]\s)/.test(l)).join(' '))}</p>)
  }
  return <div className="markdown">{blocks}</div>
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https:\/\/\S+)/g).map((part, k) => {
    if (part.startsWith('**')) return <b key={k}>{part.slice(2, -2)}</b>
    if (part.startsWith('`')) return <code key={k}>{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link || part.startsWith('https://'))
      return (
        <a key={k} href={link ? link[2] : part} target="_blank" rel="noreferrer">
          {link ? link[1] : part}
        </a>
      )
    return part
  })
}
