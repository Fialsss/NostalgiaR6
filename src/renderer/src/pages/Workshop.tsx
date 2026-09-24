import { useEffect, useState } from 'react'
import { DownloadCloud, ExternalLink, Flame, FolderOpen, Table2 } from 'lucide-react'
import type { PageProps } from '../App'
import { api, seedOf, useEvent, useLibrary, type Season } from '../api'
import { hueOf, keyArt, SeasonArt } from '../art'
import { useI18n } from '../i18n'
import { useSession } from '../session'
import { Chip, ConfirmButton, PageHead, Segmented, Spinner } from '../ui'

type Mod = {
  id: 'hm' | 'table'
  name: string // a string key, or the mod's own name
  author: string
  url: string
  icon: typeof Flame
  kind: string
  about: string
  cover: string // the season whose key art the card wears
  fits: (s: Season) => boolean
  version: (s: Season) => string
  installed: (s: Season) => boolean
  note?: (s: Season) => string
}

// The catalogue: which seasons each mod fits, and at which version. Seasons carry the facts (seasons.json).
const MODS: Mod[] = [
  {
    id: 'hm',
    name: 'Heated Metal',
    author: 'DataCluster0',
    url: 'https://github.com/DataCluster0/HeatedMetal',
    icon: Flame,
    kind: 'workshop.kind.sdk',
    about: 'workshop.hm.about',
    cover: 'Y5S4_NeonDawn',
    fits: (s) => !!s.hm,
    version: (s) => (s.hm === 'latest' ? 'latest' : `v${s.hm}`),
    installed: (s) => s.hmInstalled
  },
  {
    id: 'table',
    name: 'workshop.tables',
    author: 'Throwback FAQ',
    url: 'https://github.com/xeralin/ThrowbackFAQ',
    icon: Table2,
    kind: 'workshop.kind.table',
    about: 'workshop.tables.about',
    cover: 'Y3S1_Chimera',
    fits: (s) => !!s.table,
    version: () => '',
    installed: (s) => s.tableInstalled,
    note: (s) => `mod.table.${s.id}`
  }
]

type Show = 'all' | 'mine'

/** Mods by season and version, installed into the right folder; a missing season is downloaded first. */
export default function Workshop({ setArt, openSeason }: PageProps) {
  const { t } = useI18n()
  const [library, reload] = useLibrary()
  const [show, setShow] = useState<Show>('all')

  useEffect(() => setArt({ seed: 55, hue: 20, image: keyArt('Y5S4_NeonDawn') }), [])
  useEvent('mods.installed', reload)

  const seasons = library?.seasons ?? []
  return (
    <div className="stack">
      <PageHead
        eyebrow={t('workshop.eyebrow')}
        title="Workshop"
        sub={t('workshop.sub')}
        right={
          <Segmented<Show>
            value={show}
            onChange={setShow}
            options={[
              ['all', t('workshop.all')],
              ['mine', t('workshop.mine')]
            ]}
          />
        }
      />
      {!library ? (
        <div className="center">
          <Spinner size={22} />
        </div>
      ) : (
        <div className="mods-grid">
          {MODS.map((mod, i) => (
            <ModCard
              key={mod.id}
              mod={mod}
              index={i}
              seasons={seasons.filter((s) => mod.fits(s) && (show === 'all' || s.installed || s.partial))}
              reload={reload}
              openSeason={openSeason}
            />
          ))}
        </div>
      )}
      <p className="fine-print">{t('workshop.more')}</p>
    </div>
  )
}

type CardProps = { mod: Mod; index: number; seasons: Season[]; reload: () => void; openSeason: (key: string) => void }

function ModCard({ mod, index, seasons, reload, openSeason }: CardProps) {
  const { t } = useI18n()
  const Icon = mod.icon
  return (
    <div className="card mod" style={{ '--i': index } as React.CSSProperties}>
      <div className="mod-cover">
        <SeasonArt cover={keyArt(mod.cover)} seed={seedOf({ id: mod.cover })} hue={hueOf(mod.cover)} />
        <div className="mod-veil" />
        <div className="mod-title">
          <Chip tone="info" dot={false}>
            <Icon size={12} /> {t(mod.kind)}
          </Chip>
          <b>{t(mod.name)}</b>
          <small>{t('workshop.by', { author: mod.author })}</small>
        </div>
      </div>
      <div className="mod-body">
        <p>{t(mod.about)}</p>
        <a className="link-btn" href={mod.url} target="_blank" rel="noreferrer">
          {t('workshop.source')} <ExternalLink size={12} />
        </a>
        <ul className="mod-seasons">
          {seasons.map((s) => (
            <ModRow key={s.key} mod={mod} season={s} reload={reload} openSeason={openSeason} />
          ))}
          {!seasons.length && <li className="dim">{t('workshop.noneMine')}</li>}
        </ul>
      </div>
    </div>
  )
}

type RowProps = { mod: Mod; season: Season; reload: () => void; openSeason: (key: string) => void }

/** One season a mod fits: its version, its state, and the one button that gets it there. */
function ModRow({ mod, season: s, reload, openSeason }: RowProps) {
  const { t } = useI18n()
  const { job, toast } = useSession()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const installed = mod.installed(s)
  const waiting = job?.key === s.key && !s.installed
  const version = mod.version(s)

  useEvent<{ key: string; done: number; total: number }>('mods.progress', (d) => d.key === s.key && setProgress(d.total ? d.done / d.total : 0))

  const run = async (method: string, done: string) => {
    setBusy(true)
    setProgress(0)
    try {
      await api.call(method, { key: s.key })
      toast(t(done, { season: s.id }), 'ok')
      reload()
    } catch (e) {
      toast(t((e as Error).message), 'bad')
    } finally {
      setBusy(false)
    }
  }
  // not downloaded yet: the season comes first, then the mod goes in by itself
  const getBoth = async () => {
    await api.call('mods.after', { key: s.key, mod: mod.id })
    api.call('games.install', { key: s.key }).catch((e: Error) => e.message !== 'Cancelled' && toast(t(e.message), 'bad'))
    toast(t('toast.started', { season: s.id }), 'info')
  }
  const openTable = async () => {
    const file = await api.call<string>('mods.table', { key: s.key })
    reload()
    if (await api.open(file)) toast(t('mod.table.noCe'), 'info')
  }

  let action: React.ReactNode
  if (busy) action = <Spinner />
  else if (waiting) action = <Chip tone="info">{t('workshop.waiting')}</Chip>
  else if (!s.installed)
    action = (
      <button className="btn ghost small" onClick={getBoth} disabled={!!job}>
        <DownloadCloud size={14} /> {t(s.partial ? 'workshop.resumeBoth' : 'workshop.getBoth')}
      </button>
    )
  else if (mod.id === 'table')
    action = (
      <button className="btn ghost small" onClick={() => openTable().catch((e: Error) => toast(t(e.message), 'bad'))}>
        {installed ? <FolderOpen size={14} /> : <DownloadCloud size={14} />} {t(installed ? 'mods.open' : 'mod.table.get')}
      </button>
    )
  else if (installed)
    action = (
      <ConfirmButton
        label={t('mods.remove')}
        title={t('confirm.hmTitle')}
        body={t('confirm.hmBody')}
        confirm={t('mods.remove')}
        cancel={t('play.cancel')}
        onConfirm={() => run('mods.hm.remove', 'toast.hmRemoved')}
      />
    )
  else
    action = (
      <button className="btn primary small" onClick={() => run('mods.hm.install', 'toast.hmInstalled')} disabled={s.running}>
        <DownloadCloud size={14} /> {t('mods.install')}
      </button>
    )

  return (
    <li>
      <button className="mod-season" onClick={() => openSeason(s.key)} data-tip={t('workshop.openSeason')} aria-label={t('workshop.openSeason')}>
        <SeasonArt cover={keyArt(s.key)} seed={seedOf(s)} hue={hueOf(s.id)} />
      </button>
      <div className="grow">
        <b>
          {s.id} {s.name}
          {version && <span className="mono dim"> · {version === 'latest' ? t('mod.latest') : version}</span>}
        </b>
        <small>{mod.note ? t(mod.note(s)) : t(installed ? 'workshop.stateOn' : s.installed ? 'workshop.stateReady' : 'workshop.stateNeeds')}</small>
        {busy && mod.id === 'hm' && (
          <div className="bar thin">
            <i style={{ width: `${Math.max(progress * 100, 3)}%` }} />
          </div>
        )}
      </div>
      {installed && <Chip tone="ok">{t('state.installed')}</Chip>}
      {action}
    </li>
  )
}
