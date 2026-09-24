import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  DownloadCloud,
  FolderOpen,
  Gamepad2,
  HardDrive,
  LockOpen,
  Play,
  Plus,
  Power,
  Puzzle,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  X
} from 'lucide-react'
import type { PageProps } from '../App'
import { api, bytes, GB, seedOf, useEvent, useLibrary, type Library as Lib, type Season } from '../api'
import { hueOf, keyArt, SeasonArt } from '../art'
import { useI18n } from '../i18n'
import { overall, seasonId, useSession } from '../session'
import { Chip, ConfirmButton, Notice, PageHead, Segmented, Spinner, type Tone } from '../ui'

function seasonState(s: Season): [string, Tone] {
  if (s.running) return ['state.playing', 'ok']
  if (s.downloading) return ['state.downloading', 'info']
  if (s.installed) return ['state.installed', 'ok']
  if (s.partial) return ['state.partial', 'warn']
  return ['state.onSteam', 'muted']
}

/** The library is what's on this PC: one card per installed season, and a + to add the next one. */
export default function Library({ setArt, focus, openSeason, go }: PageProps) {
  const { t } = useI18n()
  const { job } = useSession()
  const [library, reload] = useLibrary()
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!focus) return
    setOpen(focus)
    openSeason(null)
  }, [focus])
  useEffect(() => {
    if (!open) setArt({ seed: 41, hue: 196, image: keyArt('Y1S0_Vanilla') })
  }, [open])

  const seasons = library?.seasons ?? []
  const installs = seasons.filter((s) => s.installed || s.partial || s.downloading || job?.key === s.key)
  const season = seasons.find((s) => s.key === open)

  if (season && library) {
    return <SeasonDetail season={season} library={library} reload={reload} back={() => setOpen(null)} setArt={setArt} cover={keyArt(season.key)} go={go} />
  }

  return (
    <div className="stack">
      <PageHead
        eyebrow={t('library.eyebrow')}
        title={t('library.title')}
        sub={t(installs.length ? 'library.sub' : 'library.subEmpty')}
        right={
          library && (
            <span className="library-free">
              <HardDrive size={15} /> {t('library.free', { free: bytes(library.free) })}
            </span>
          )
        }
      />
      {!library ? (
        <div className="center">
          <Spinner size={22} />
        </div>
      ) : (
        <div className={`installs${installs.length ? '' : ' empty'}`}>
          {installs.map((s, i) => (
            <Install key={s.key} season={s} index={i} open={() => setOpen(s.key)} />
          ))}
          <button className="install add" style={{ '--i': installs.length } as React.CSSProperties} onClick={() => setAdding(true)}>
            <span className="plus">
              <Plus size={30} strokeWidth={1.6} />
            </span>
            <b>{t(installs.length ? 'library.add' : 'library.addFirst')}</b>
            <small>{t('library.addHint', { n: seasons.length })}</small>
          </button>
        </div>
      )}
      {adding && library && <Picker library={library} reload={reload} close={() => setAdding(false)} open={setOpen} />}
    </div>
  )
}

/** One season on this PC: its key art, its state, and Play right on the card. */
function Install({ season: s, index, open }: { season: Season; index: number; open: () => void }) {
  const { t } = useI18n()
  const { job, playing, toast } = useSession()
  const [starting, setStarting] = useState(false)
  const here = job?.key === s.key
  const [state, tone]: [string, Tone] = here ? ['state.downloading', 'info'] : seasonState(s)

  const act = (e: React.MouseEvent, work: () => Promise<unknown>) => {
    e.stopPropagation()
    work().catch((err: Error) => err.message !== 'Cancelled' && toast(t(err.message), 'bad'))
  }
  const play = (e: React.MouseEvent) =>
    act(e, async () => {
      setStarting(true)
      try {
        await api.call('games.launch', { key: s.key })
        toast(t('toast.launched', { season: s.id }), 'ok')
      } finally {
        setStarting(false)
      }
    })

  return (
    <div
      className={`install${s.running ? ' live' : ''}`}
      style={{ '--i': index, '--hue': hueOf(s.id) } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="install-media">
        <SeasonArt cover={keyArt(s.key)} seed={seedOf(s)} hue={hueOf(s.id)} />
        <div className="install-veil" />
        {here && (
          <div className="install-bar">
            <i style={{ width: `${overall(job)}%` }} />
          </div>
        )}
      </div>
      <div className="install-top">
        <Chip tone={tone}>{t(state)}</Chip>
        {s.hmInstalled && (
          <Chip tone="warn" dot={false}>
            Heated Metal
          </Chip>
        )}
      </div>
      <div className="install-body">
        <div className="grow">
          <span className="mono">
            {s.id} · {s.date.slice(0, 4)}
          </span>
          <b>{s.name}</b>
        </div>
        {here ? (
          <span className="install-percent mono">{overall(job).toFixed(0)}%</span>
        ) : s.running ? (
          <button className="btn ghost small danger" onClick={(e) => act(e, () => api.call('games.stop'))}>
            <Power size={14} /> {t('play.stop')}
          </button>
        ) : s.installed ? (
          <button className="btn primary install-play" onClick={play} disabled={starting || !!playing}>
            {starting ? <Spinner /> : <Play size={16} fill="currentColor" />} {t('play.play')}
          </button>
        ) : (
          <button className="btn ghost small" onClick={(e) => act(e, () => api.call('games.install', { key: s.key }))} disabled={!!job}>
            <RotateCcw size={14} /> {t('play.resume')}
          </button>
        )}
      </div>
    </div>
  )
}

type Show = 'all' | 'mods'

/** Every season Steam still serves: pick one, see what it takes, download it. */
function Picker({ library, reload, close, open }: { library: Lib; reload: () => void; close: () => void; open: (key: string) => void }) {
  const { t } = useI18n()
  const { job, toast } = useSession()
  const [year, setYear] = useState('all')
  const [show, setShow] = useState<Show>('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Season | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const years = useMemo(() => [...new Set(library.seasons.map((s) => s.id.split('S')[0]))], [library])
  const shown = library.seasons.filter(
    (s) =>
      (year === 'all' || s.id.startsWith(`${year}S`)) &&
      (show === 'all' || !!(s.hm || s.table)) &&
      `${s.id} ${s.name}`.toLowerCase().includes(query.toLowerCase())
  )
  const mine = (s: Season) => s.installed || s.partial
  const short = !!picked && library.free < (picked.size + 1) * GB
  // like Steam's install dialog: where it goes, and a way to put it somewhere roomier
  const move = async () => {
    const folder = await api.pickFolder()
    if (!folder) return
    await api.call('settings.set', { library: folder })
    reload()
  }

  // the download goes on in the background: its card shows up in the library right away
  const download = (s: Season) => {
    api.call('games.install', { key: s.key }).catch((e: Error) => e.message !== 'Cancelled' && toast(t(e.message), 'bad'))
    toast(t('toast.started', { season: s.id }), 'info')
    close()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="picker" role="dialog" aria-modal="true" aria-label={t('picker.title')}>
        <header className="picker-head">
          <div>
            <div className="label">{t('picker.eyebrow')}</div>
            <h2>{t('picker.title')}</h2>
          </div>
          <label className="search">
            <Search size={15} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.search')} />
          </label>
          <button className="dialog-close" onClick={close} aria-label={t('window.close')}>
            <X size={16} />
          </button>
        </header>
        <div className="filters">
          <div className="years">
            <Segmented value={year} onChange={setYear} options={[['all', t('library.all')], ...years.map((y): [string, string] => [y, y])]} />
          </div>
          <Segmented<Show>
            value={show}
            onChange={setShow}
            options={[
              ['all', t('library.showAll')],
              ['mods', t('library.showMods')]
            ]}
          />
        </div>
        <div className="picker-grid">
          {shown.map((s, i) => (
            <button
              key={s.key}
              className={`pick${picked?.key === s.key ? ' on' : ''}`}
              style={{ '--i': Math.min(i, 16), '--hue': hueOf(s.id) } as React.CSSProperties}
              onClick={() => setPicked(s)}
              onDoubleClick={() => !mine(s) && !job && download(s)}
            >
              <SeasonArt cover={keyArt(s.key)} seed={seedOf(s)} hue={hueOf(s.id)} />
              <span className="pick-veil" />
              {mine(s) && (
                <span className="pick-mine">
                  <Check size={12} strokeWidth={3} /> {t('state.installed')}
                </span>
              )}
              <span className="pick-text">
                <small className="mono">
                  {s.id} · {s.date.slice(0, 4)}
                </small>
                <b>{s.name}</b>
              </span>
            </button>
          ))}
          {!shown.length && <div className="center empty">{t('library.none')}</div>}
        </div>
        <div className="picker-dest">
          <FolderOpen size={15} />
          <span className="dim">{t('picker.folder')}</span>
          <span className="mono path" data-tip={library.root}>
            {library.root}
          </span>
          <span className={short ? 'warn' : 'dim'}>{short ? t('picker.short') : t('library.free', { free: bytes(library.free) })}</span>
          <button className="btn ghost small" onClick={move}>
            {t('common.change')}
          </button>
        </div>
        <footer className="picker-foot">
          {picked ? (
            <>
              <span className="picker-pick">
                <b>{picked.name}</b>
                <small className="mono">
                  {picked.id} · build {picked.build}
                </small>
              </span>
              <span className="picker-facts">
                <span>
                  <DownloadCloud size={14} /> {picked.size.toFixed(1)} GB
                </span>
                <span className={short ? 'warn' : ''}>
                  <HardDrive size={14} /> {t('library.free', { free: bytes(library.free) })}
                </span>
                {picked.liberator && (
                  <span>
                    <LockOpen size={14} /> {t(`liberator.level.${picked.liberator}`)}
                  </span>
                )}
                {(picked.hm || picked.table) && (
                  <span>
                    <Puzzle size={14} /> {t('library.hasMods')}
                  </span>
                )}
              </span>
              {mine(picked) ? (
                <button
                  className="btn ghost"
                  onClick={() => {
                    close()
                    open(picked.key)
                  }}
                >
                  {t('picker.open')} <ArrowRight size={15} />
                </button>
              ) : (
                <button className="btn primary" onClick={() => download(picked)} disabled={!!job || short}>
                  <DownloadCloud size={16} /> {t('play.download')}
                </button>
              )}
            </>
          ) : (
            <span className="dim">{t(job ? 'picker.busy' : 'picker.hint')}</span>
          )}
        </footer>
      </div>
    </div>
  )
}

type DetailProps = {
  season: Season
  library: Lib
  reload: () => void
  back: () => void
  setArt: PageProps['setArt']
  cover?: string
  go: PageProps['go']
}

function SeasonDetail({ season: s, library, reload, back, setArt, cover, go }: DetailProps) {
  const { t } = useI18n()
  const { profile, job, playing, signIn, toast } = useSession()
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('')
  const [log, setLog] = useState('')
  const [starting, setStarting] = useState(false)

  const here = job?.key === s.key
  const other = job && !here ? seasonId(job.key) : ''
  const need = s.size * GB
  const short = !s.installed && !s.partial && library.free > 0 && library.free < need

  useEffect(() => setArt({ seed: seedOf(s), hue: hueOf(s.id), image: cover }), [cover])
  useEvent<{ key: string }>('steam.status', (d) => setPhase(d.key))
  useEvent<string>('steam.log', setLog)

  const fail = (e: Error) => e.message !== 'Cancelled' && setError(e.message)

  // runs in the background: the top bar follows it on every page, and a toast says how it ended
  const install = () => {
    setError('')
    setPhase('')
    setLog('')
    api.call('games.install', { key: s.key }).catch(fail)
  }
  const launch = async () => {
    setError('')
    setStarting(true)
    try {
      await api.call('games.launch', { key: s.key })
      toast(t('toast.launched', { season: s.id }), 'ok')
    } catch (e) {
      fail(e as Error)
    } finally {
      setStarting(false)
    }
  }
  const remove = () =>
    api
      .call('games.remove', { key: s.key })
      .then(() => {
        toast(t('toast.removed', { season: s.id }), 'muted')
        reload()
      })
      .catch(fail)

  let icon = <DownloadCloud size={20} strokeWidth={1.7} />
  let title = t('play.notInstalled')
  let sub = t('play.needs', { size: `${s.size.toFixed(1)} GB`, free: bytes(library.free) })
  if (here) {
    icon = <Spinner size={20} />
    title = job.step >= job.steps ? t('play.loader') : job.percent ? t('play.depot', { n: job.step + 1, of: job.steps }) : t(`steam.phase.${phase || 'connecting'}`)
    sub = job.file || log || '…'
  } else if (s.installed) {
    icon = <Gamepad2 size={20} strokeWidth={1.7} />
    title = s.running ? t('play.running') : t('play.ready')
    sub = s.running ? t('play.runningHint') : t('play.readyHint')
  } else if (s.partial) {
    icon = <AlertTriangle size={20} strokeWidth={1.7} />
    title = t('play.partial')
    sub = t('play.partialHint')
  }

  return (
    <div className="detail">
      <aside className="detail-side">
        <button className="back" onClick={back}>
          <ArrowLeft size={15} /> {t('library.back')}
        </button>
        <div className="detail-cover">
          <SeasonArt cover={cover} seed={seedOf(s)} hue={hueOf(s.id)} />
          <div className="detail-cover-text">
            <span className="mono">{s.id}</span>
            <b>{s.name}</b>
          </div>
        </div>
        <dl className="specs">
          <dt>{t('spec.released')}</dt>
          <dd>{s.date}</dd>
          <dt>{t('spec.build')}</dt>
          <dd className="mono">{s.build}</dd>
          <dt>{t('spec.size')}</dt>
          <dd>{s.size.toFixed(1)} GB</dd>
          <dt>{t('spec.liberator')}</dt>
          <dd>{t(`liberator.level.${s.liberator || 'none'}`)}</dd>
          <dt>{t('spec.manifest')}</dt>
          <dd className="mono">{s.manifests.content}</dd>
        </dl>
      </aside>

      <section className="detail-main">
        {!profile && !here && !s.installed && (
          <div className="card steam">
            <div className="steam-row">
              <span className="tile-icon">
                <Smartphone size={17} strokeWidth={1.8} />
              </span>
              <div className="grow">
                <b>{t('steam.signedOut')}</b>
                <small>{t('steam.signedOutBody')}</small>
              </div>
              <button className="btn primary small" onClick={signIn}>
                {t('account.signIn')}
              </button>
            </div>
          </div>
        )}

        {error && <Notice text={t(error)} onClose={() => setError('')} />}

        <div className={`card play${s.installed && !here ? ' ready' : ''}`}>
          <div className="play-row">
            <span className="play-icon">{icon}</span>
            <div className="grow">
              <b>{title}</b>
              <small className={here ? 'mono' : ''}>{sub}</small>
            </div>
            {here ? (
              <button className="btn ghost" onClick={() => api.call('games.cancel')}>
                <X size={15} /> {t('play.cancel')}
              </button>
            ) : s.running ? (
              <button className="btn ghost danger" onClick={() => api.call('games.stop')}>
                <Power size={15} /> {t('play.stop')}
              </button>
            ) : s.installed ? (
              <button className="btn primary play-btn" onClick={launch} disabled={starting || !!playing}>
                {starting ? <Spinner /> : <Play size={17} fill="currentColor" />} {t('play.play')}
              </button>
            ) : (
              <button className="btn primary" onClick={install} disabled={!!job}>
                {s.partial ? <RotateCcw size={16} /> : <DownloadCloud size={16} />} {t(s.partial ? 'play.resume' : 'play.download')}
              </button>
            )}
          </div>

          {here && (
            <div className="progress">
              <div className="bar">
                <i style={{ width: `${overall(job)}%` }} />
              </div>
              <div className="progress-text">
                <span>{t('play.steps', { n: Math.min(job.step + 1, job.steps), of: job.steps })}</span>
                <b>{overall(job).toFixed(1)}%</b>
              </div>
            </div>
          )}
          {other && <small className="play-note">{t('play.waitOther', { season: other })}</small>}
          {short && (
            <small className="play-note warn">
              <AlertTriangle size={13} /> {t('play.short', { free: bytes(library.free) })}
            </small>
          )}

          <div className="play-foot">
            <span className="path mono" data-tip={s.dir}>
              {s.dir}
            </span>
            <div className="row">
              {(s.installed || s.partial) && (
                <button className="btn ghost small" onClick={() => api.open(s.dir)}>
                  <FolderOpen size={14} /> {t('play.folder')}
                </button>
              )}
              {s.installed && !here && !s.running && (
                <button className="btn ghost small" onClick={install} disabled={!!job} data-tip={t('play.verifyHint')}>
                  <ShieldCheck size={14} /> {t('play.verify')}
                </button>
              )}
              {(s.installed || s.partial) && !here && !s.running && (
                <ConfirmButton
                  label={t('play.remove')}
                  title={t('confirm.removeTitle', { season: s.name })}
                  body={t('confirm.removeBody', { size: `${s.size.toFixed(1)} GB` })}
                  confirm={t('play.remove')}
                  cancel={t('play.cancel')}
                  onConfirm={remove}
                />
              )}
            </div>
          </div>
        </div>

        <Mods season={s} go={go} />
      </section>
    </div>
  )
}

function Mods({ season: s, go }: { season: Season; go: PageProps['go'] }) {
  const { t } = useI18n()
  const mods = [s.hm && 'Heated Metal', s.table && t('mod.table')].filter(Boolean).join(' · ')
  return (
    <div className="card mods">
      <div className="label">{t('mods.title')}</div>
      <ul className="rows">
        <li>
          <span className="tile-icon">
            <LockOpen size={16} strokeWidth={1.8} />
          </span>
          <div className="grow">
            <b>Liberator</b>
            <small>{s.liberator ? t(`liberator.about.${s.liberator}`, { event: s.event }) : t('liberator.about.none')}</small>
          </div>
          <Chip tone={s.liberator === 'unlock' ? 'info' : s.liberator ? 'ok' : 'muted'}>{t(`liberator.level.${s.liberator || 'none'}`)}</Chip>
          {s.liberator && (
            <button className="btn ghost small" onClick={() => go('liberator')}>
              {t('mods.open')} <ArrowRight size={14} />
            </button>
          )}
        </li>
        {mods && (
          <li>
            <span className="tile-icon">
              <Puzzle size={16} strokeWidth={1.8} />
            </span>
            <div className="grow">
              <b>{t('mods.workshop')}</b>
              <small>{mods}</small>
            </div>
            {s.hmInstalled && <Chip tone="ok">Heated Metal</Chip>}
            <button className="btn ghost small" onClick={() => go('workshop')}>
              {t('mods.openWorkshop')} <ArrowRight size={14} />
            </button>
          </li>
        )}
      </ul>
      {!mods && <small className="mods-none">{t('mods.none')}</small>}
    </div>
  )
}
