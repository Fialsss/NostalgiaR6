import { useEffect, useState } from 'react'
import { ChevronRight, DownloadCloud, Flag, Gamepad2, LibraryBig, LockOpen, Timer, Users } from 'lucide-react'
import type { PageProps } from '../App'
import { api, useEvent, useLibrary } from '../api'
import { keyArt } from '../art'
import { useI18n } from '../i18n'
import { useSession } from '../session'
import { Chip, PageHead, Spinner, Switch } from '../ui'

type Node = { text: string; id: string; children: Node[] }
type Status = {
  attached: boolean
  applied: boolean
  status: string
  capabilities: Record<string, boolean>
  available: boolean
  enabled: boolean
  game: boolean
}

const GROUPS = [
  { id: 'players', icon: Users, mods: ['deathless', 'unlimitedEquip', 'unlimitedAmmo'] },
  { id: 'match', icon: Timer, mods: ['infiniteTime', 'disableAI', 'displayBuild'] },
  { id: 'loadout', icon: Flag, mods: ['disablePrimary', 'disableSecondary', 'disablePrimaryGadget', 'disableSecondaryGadget'] }
]
const HINTS = new Set(['deathless', 'unlimitedEquip', 'unlimitedAmmo', 'disableAI', 'displayBuild'])
const LEVELS = ['full', 'events', 'unlock'] as const

// Liberator doesn't report which rules are on: remember them while it stays attached
let chosen: Record<string, boolean> = {}
let path: number[] = []

export default function Liberator({ go, setArt }: PageProps) {
  const { t } = useI18n()
  const { toast } = useSession()
  const [library] = useLibrary()
  const [status, setStatus] = useState<Status | null>(null)
  const [tree, setTree] = useState<Node[] | null>(null)
  const [mods, setMods] = useState(chosen)
  const [columns, setColumns] = useState(path)
  const [picked, setPicked] = useState('')
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    setArt({ seed: 33, hue: 280, image: keyArt('Y3S3_GrimSky') })
  }, [])
  useEffect(() => {
    api.call<Status & { tree: Node[] | null }>('liberator.status').then(({ tree, ...rest }) => {
      setStatus(rest)
      setTree(tree)
    })
  }, [])
  useEvent<Status>('liberator.state', (s) => {
    setStatus(s)
    if (!s.attached) {
      chosen = {}
      path = []
      setMods({})
      setColumns([])
    }
  })
  useEvent<Node[] | null>('liberator.tree', setTree)
  useEffect(() => {
    if (!picked) return
    const timer = setTimeout(() => setPicked(''), 5000)
    return () => clearTimeout(timer)
  }, [picked])

  const live = !!status?.attached && status.applied && !!status.capabilities.fullFeature
  const toggle = (mod: string, on: boolean) => {
    chosen = { ...mods, [mod]: on }
    setMods(chosen)
    api.call('liberator.setMod', { mod, enabled: on })
  }
  const choose = (next: number[]) => {
    path = next
    setColumns(next)
  }
  const pick = (id: string) => {
    setPicked(id)
    api.call('liberator.setPlaylist', { id })
  }
  const download = async () => {
    setFetching(true)
    try {
      setStatus(await api.call<Status>('liberator.fetch'))
      toast(t('liberator.fetched'), 'ok')
    } catch (e) {
      toast(t((e as Error).message), 'bad')
    } finally {
      setFetching(false)
    }
  }

  let state = t('liberator.state.off')
  if (status?.enabled && !status.available) state = t('liberator.state.missing')
  else if (status?.enabled && status.attached) state = status.status || t('liberator.state.attached')
  else if (status?.enabled && status.game) state = t('liberator.state.waiting')
  else if (status?.enabled) state = t('liberator.state.idle')

  return (
    <div className="stack">
      <PageHead
        eyebrow={t('liberator.eyebrow')}
        title="Liberator"
        sub={t('liberator.sub')}
        right={
          status && (
            <div className="lib-switch">
              <Chip tone={status.attached ? 'ok' : status.game ? 'info' : 'muted'}>{state}</Chip>
              <Switch on={status.enabled} label="Liberator" onChange={(on) => api.call<Status>('liberator.enable', { on }).then(setStatus)} />
            </div>
          )
        }
      />

      {status && !status.available && (
        <div className="card lib-empty">
          <span className="tile-icon">
            <LockOpen size={18} />
          </span>
          <div className="grow">
            <b>{t('liberator.getTitle')}</b>
            <small>{t('liberator.getBody')}</small>
          </div>
          <button className="btn primary" onClick={download} disabled={fetching}>
            {fetching ? <Spinner /> : <DownloadCloud size={16} />} {t('liberator.get')}
          </button>
        </div>
      )}

      {status?.available && !live && (
        <div className="card lib-empty">
          <span className="tile-icon">{status.game && status.enabled && !status.attached ? <Spinner /> : <Gamepad2 size={18} />}</span>
          <div className="grow">
            <b>{status.attached ? state : t(status.game ? 'liberator.waitTitle' : 'liberator.idleTitle')}</b>
            <small>{t(status.attached ? 'liberator.limited' : status.game ? 'liberator.waitBody' : 'liberator.idleBody')}</small>
          </div>
          {!status.game && (
            <button className="btn ghost" onClick={() => go('library')}>
              <LibraryBig size={15} /> {t('home.openLibrary')}
            </button>
          )}
        </div>
      )}

      {live && (
        <div className="lib-live">
          <div className="card lib-playlists">
            <div className="label">{t('liberator.playlist')}</div>
            {tree ? <Columns roots={tree} path={columns} picked={picked} onPath={choose} onPick={pick} /> : <Spinner />}
          </div>
          <div className="lib-rules">
            {GROUPS.map(({ id, icon: Icon, mods: keys }) => (
              <div key={id} className="card lib-group">
                <div className="label">
                  <Icon size={13} /> {t(`liberator.group.${id}`)}
                </div>
                {keys.map((mod) => (
                  <label key={mod} className="rule" data-tip={HINTS.has(mod) ? t(`liberator.mod.${mod}.hint`) : undefined}>
                    <span>{t(`liberator.mod.${mod}`)}</span>
                    <Switch on={!!mods[mod]} label={t(`liberator.mod.${mod}`)} disabled={!status.capabilities[mod]} onChange={(on) => toggle(mod, on)} />
                  </label>
                ))}
              </div>
            ))}
            <div className="card lib-group lib-actions">
              <button className="btn ghost" disabled={!status.capabilities.endRound} onClick={() => api.call('liberator.endRound')}>
                {t('liberator.endRound')}
              </button>
              <button className="btn ghost" disabled={!status.capabilities.endMatch} onClick={() => api.call('liberator.endMatch')}>
                {t('liberator.endMatch')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lib-support">
        {LEVELS.map((level) => (
          <div key={level} className="card lib-level">
            <div className="lib-level-head">
              <div className="label">{t(`liberator.level.${level}`)}</div>
              <small>{t(`liberator.levelBody.${level}`)}</small>
            </div>
            <div className="lib-seasons">
              {(library?.seasons ?? [])
                .filter((s) => s.liberator === level)
                .map((s) => (
                  <span key={s.key} className={`lib-season${s.installed ? ' mine' : ''}`} data-tip={s.event || undefined}>
                    <span className="mono">{s.id}</span> {s.name}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The playlist tree as Finder-style columns: each pick opens the next column; a leaf starts that mode. */
function Columns({ roots, path, picked, onPath, onPick }: { roots: Node[]; path: number[]; picked: string; onPath: (p: number[]) => void; onPick: (id: string) => void }) {
  const active = path.length === 0 && roots[0]?.children.length ? [0] : path
  const columns: Node[][] = [roots]
  let level = roots
  for (const index of active) {
    const next = level[index]
    if (!next || !next.children.length) break
    columns.push(next.children)
    level = next.children
  }
  return (
    <div className="columns">
      {columns.map((nodes, col) => (
        <ul key={col}>
          {nodes.map((node, index) => {
            const branch = node.children.length > 0
            const open = branch && active[col] === index
            return (
              <li key={`${col}:${index}`}>
                <button
                  className={open ? 'open' : !branch && node.id === picked ? 'picked' : ''}
                  onClick={() => {
                    if (branch) return onPath([...active.slice(0, col), index])
                    onPath(active.slice(0, col))
                    onPick(node.id)
                  }}
                >
                  <span>{node.text}</span>
                  {branch && <ChevronRight size={14} />}
                </button>
              </li>
            )
          })}
        </ul>
      ))}
    </div>
  )
}
