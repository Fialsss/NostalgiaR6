import { useEffect, useState } from 'react'
import { ChevronRight, CircleHelp, Coffee, DownloadCloud, ExternalLink, FolderOpen, HardDrive, Info, LogIn, LogOut, Mouse, Save, UserRound, Wrench } from 'lucide-react'
import type { PageProps } from '../App'
import { api, bytes, useLibrary, type Settings as Values } from '../api'
import { Mark } from '../art'
import { useI18n, type Lang } from '../i18n'
import { Avatar, useSession } from '../session'
import { PageHead, Segmented, Spinner, Switch } from '../ui'

const REPO = 'https://github.com/Fialsss/NostalgiaR6'
const KOFI = 'https://ko-fi.com/fialss'
const NAME = /^[A-Za-z0-9_.-]{0,16}$/

const SECTIONS = [
  ['account', UserRound],
  ['library', HardDrive],
  ['controls', Mouse],
  ['tools', Wrench],
  ['help', CircleHelp],
  ['about', Info]
] as const
type Section = (typeof SECTIONS)[number][0]

const FAQ = ['owns', 'space', 'offline', 'liberator', 'heatedmetal', 'multiplayer', 'antivirus', 'safe'] as const
const CREDITS = [
  ['Operation Throwback', 'https://github.com/xeralin/ThrowbackLauncher'],
  ['ThrowbackLoader', 'https://github.com/xeralin/ThrowbackLoader'],
  ['Liberator', 'https://github.com/xeralin/ThrowbackLauncher'],
  ['Heated Metal', 'https://github.com/DataCluster0/HeatedMetal'],
  ['Throwback FAQ', 'https://github.com/xeralin/ThrowbackFAQ'],
  ['DepotDownloader', 'https://github.com/SteamRE/DepotDownloader']
] as const

type Tools = { depot: boolean; loader: boolean; liberator: boolean }
type Preset = { from: string; at: number; values: Record<string, string>; auto: boolean }
type Profile = { id: string; season: string; modified: number; keys: number }

export default function Settings({ setArt, startTour }: PageProps) {
  const { t, lang, setLang } = useI18n()
  const { profile, signIn, signOut, toast } = useSession()
  const [library, reload] = useLibrary()
  const [values, setValues] = useState<Values | null>(null)
  const [section, setSection] = useState<Section>('account')
  const [name, setName] = useState('')
  const [tools, setTools] = useState<Tools | null>(null)
  const [fetching, setFetching] = useState('')

  useEffect(() => {
    setArt({ seed: 3, hue: 220 })
    api.call<Values>('settings.get').then((v) => {
      setValues(v)
      setName(v.username)
    })
    api.call<Tools>('games.tools').then(setTools)
  }, [])

  const save = async (changes: Partial<Values>) => {
    try {
      setValues(await api.call<Values>('settings.set', changes))
      reload()
      return true
    } catch (e) {
      toast(t((e as Error).message), 'bad')
      return false
    }
  }
  const saveName = async () => {
    if (name !== values?.username && (await save({ username: name }))) toast(t('toast.nameSaved'), 'ok')
  }
  const browse = async () => {
    const picked = await api.pickFolder()
    if (picked) save({ library: picked })
  }
  const fetchTool = async (key: string, method: string) => {
    setFetching(key)
    try {
      await api.call(method)
      setTools(await api.call<Tools>('games.tools'))
      toast(t('toast.toolReady', { tool: t(`tool.${key}`) }), 'ok')
    } catch (e) {
      toast(t((e as Error).message), 'bad')
    } finally {
      setFetching('')
    }
  }

  return (
    <div className="stack">
      <PageHead eyebrow={t('settings.eyebrow')} title={t('settings.title')} />
      <div className="settings">
        <nav className="settings-nav">
          {SECTIONS.map(([id, Icon]) => (
            <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>
              <Icon size={17} strokeWidth={1.8} />
              {t(`section.${id}`)}
            </button>
          ))}
        </nav>

        <section className="card settings-panel" key={section}>
          <header>
            <h2>{t(`section.${section}`)}</h2>
            <p>{t(`section.${section}.sub`)}</p>
          </header>

          {section === 'account' && (
            <>
              <div className="setting">
                <div className="setting-label">
                  <b>{t('setting.steam')}</b>
                  <small>{t('setting.steam.hint')}</small>
                </div>
                <div className="setting-control">
                  {profile ? (
                    <div className="profile-chip">
                      <Avatar profile={profile} size={36} />
                      <div className="grow">
                        <b>{profile.name}</b>
                        <small className="mono">{profile.steamid || `@${profile.user}`}</small>
                      </div>
                      <button className="btn ghost small danger" onClick={signOut}>
                        <LogOut size={14} /> {t('steam.signOut')}
                      </button>
                    </div>
                  ) : (
                    <button className="btn primary small" onClick={signIn}>
                      <LogIn size={14} /> {t('account.signIn')}
                    </button>
                  )}
                </div>
              </div>
              <div className="setting">
                <div className="setting-label">
                  <b>{t('setting.name')}</b>
                  <small>{t('setting.name.hint')}</small>
                </div>
                <form
                  className="setting-control"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveName()
                  }}
                >
                  <input
                    className="text-field"
                    value={name}
                    maxLength={16}
                    spellCheck={false}
                    placeholder={profile?.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 16) || 'Operator'}
                    onChange={(e) => NAME.test(e.target.value) && setName(e.target.value)}
                    onBlur={saveName}
                    aria-label={t('setting.name')}
                  />
                  <button className="btn ghost small icon" type="submit" data-tip={t('common.save')} aria-label={t('common.save')}>
                    <Save size={14} />
                  </button>
                </form>
              </div>
              <div className="setting">
                <div className="setting-label">
                  <b>{t('setting.language')}</b>
                  <small>{t('setting.language.hint')}</small>
                </div>
                <div className="setting-control">
                  <Segmented<Lang> value={lang} onChange={setLang} options={[['it', 'Italiano'], ['en', 'English']]} />
                </div>
              </div>
            </>
          )}

          {section === 'library' && (
            <>
              <div className="setting">
                <div className="setting-label">
                  <b>{t('setting.library')}</b>
                  <small>{t('setting.library.hint')}</small>
                  {!!values?.libraries.length && (
                    <small className="mono others">
                      {t('setting.library.others')} {values.libraries.join(' · ')}
                    </small>
                  )}
                </div>
                <div className="setting-control">
                  <div className="path-field ok" data-tip={values?.library}>
                    <i />
                    <span className="mono">{values?.library ?? '…'}</span>
                  </div>
                  <button className="btn ghost small" onClick={browse}>
                    <FolderOpen size={14} /> {t('common.change')}
                  </button>
                </div>
              </div>
              <div className="setting">
                <div className="setting-label">
                  <b>{t('setting.free')}</b>
                  <small>{t('setting.free.hint')}</small>
                </div>
                <div className="setting-control">
                  <span className="storage-total">{library ? bytes(library.free) : '…'}</span>
                  {values && (
                    <button className="btn ghost small" onClick={() => api.open(values.library)}>
                      <FolderOpen size={14} /> {t('play.folder')}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {section === 'controls' && <Controls />}

          {section === 'tools' &&
            (['depot', 'loader', 'liberator'] as const).map((key) => {
              const ok = !!tools?.[key]
              const method = key === 'depot' ? 'steam.tool' : key === 'liberator' ? 'liberator.fetch' : ''
              return (
                <div key={key} className="setting">
                  <div className="setting-label">
                    <b>{t(`tool.${key}`)}</b>
                    <small>{t(`tool.${key}.hint`)}</small>
                  </div>
                  <div className="setting-control">
                    <span className={`state ${ok ? 'ok' : 'muted'}`}>{t(ok ? 'state.ready' : 'tool.onDemand')}</span>
                    {fetching === key ? (
                      <Spinner />
                    ) : (
                      method &&
                      (!ok || key === 'liberator') && (
                        <button className="btn ghost small" onClick={() => fetchTool(key, method)}>
                          <DownloadCloud size={14} /> {t(ok ? 'tool.update' : 'tool.get')}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )
            })}

          {section === 'help' && (
            <>
            <div className="setting">
              <div className="setting-label">
                <b>{t('nav.guide')}</b>
                <small>{t('help.tour.hint')}</small>
              </div>
              <div className="setting-control">
                <button className="btn ghost small" onClick={startTour}>
                  <CircleHelp size={14} /> {t('help.tour')}
                </button>
              </div>
            </div>
            <div className="faq">
              {FAQ.map((key) => (
                <details key={key}>
                  <summary>
                    {t(`faq.${key}.q`)}
                    <ChevronRight size={15} />
                  </summary>
                  <p>{t(`faq.${key}.a`)}</p>
                </details>
              ))}
            </div>
            </>
          )}

          {section === 'about' && (
            <>
              <div className="about-head">
                <Mark size={48} />
                <div className="grow">
                  <b>Nostalgia</b>
                  <small className="mono">v{__VERSION__} · GPL-3.0 · © 2026 Fialsss</small>
                </div>
                <a className="btn primary small" href={KOFI} target="_blank" rel="noreferrer">
                  <Coffee size={14} /> {t('about.support')}
                </a>
                <a className="btn ghost small" href={REPO} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> GitHub
                </a>
              </div>
              {CREDITS.map(([name, url]) => (
                <div key={name} className="setting credit">
                  <div className="setting-label">
                    <b>{name}</b>
                    <small>{t(`credit.${name}`)}</small>
                  </div>
                  <div className="setting-control">
                    <a className="link-btn" href={url} target="_blank" rel="noreferrer">
                      github.com/{url.split('github.com/')[1]} <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
              <p className="fine-print">{t('about.body')}</p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** One set of sensitivities and input options for every season: taken from a profile, written into each season's own. */
function Controls() {
  const { t, lang } = useI18n()
  const { toast } = useSession()
  const [library] = useLibrary()
  const [data, setData] = useState<{ preset: Preset | null; profiles: Profile[] } | null>(null)

  const load = () => api.call<{ preset: Preset | null; profiles: Profile[] }>('controls.get').then(setData)
  useEffect(() => {
    load()
  }, [])

  const name = (p: Profile) => p.season || t('controls.account', { id: p.id.slice(0, 8) })
  const date = (at: number) => new Date(at).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  const capture = async (p: Profile) => {
    await api.call('controls.capture', { id: p.id, label: name(p) })
    await load()
    toast(t('controls.captured', { from: name(p) }), 'ok')
  }
  const applyAll = async () => {
    const keys = (library?.seasons ?? []).filter((s) => s.installed).map((s) => s.key)
    const { applied, waiting } = await api.call<{ applied: number; waiting: number }>('controls.applyAll', { keys })
    toast(t(waiting ? 'controls.appliedSome' : 'controls.applied', { n: applied, waiting }), 'ok')
  }

  if (!data) {
    return (
      <div className="center">
        <Spinner />
      </div>
    )
  }
  const v = data.preset?.values ?? {}
  return (
    <>
      <div className="setting">
        <div className="setting-label">
          <b>{t('controls.preset')}</b>
          <small>{data.preset ? t('controls.from', { from: data.preset.from, date: date(data.preset.at) }) : t('controls.none')}</small>
        </div>
        <div className="setting-control preset-values">
          {data.preset && (
            <>
              <span className="chip dot info">{t('controls.sens', { x: v.MouseYawSensitivity ?? '-', y: v.MousePitchSensitivity ?? '-' })}</span>
              {v.AimDownSightsMouse && <span className="chip">ADS {v.AimDownSightsMouse}</span>}
              <span className="chip">{t('controls.count', { n: Object.keys(v).length })}</span>
            </>
          )}
        </div>
      </div>
      <div className="setting">
        <div className="setting-label">
          <b>{t('controls.take')}</b>
          <small>{t('controls.takeHint')}</small>
        </div>
        <div className="setting-control">
          <ul className="profiles">
            {data.profiles.map((p) => (
              <li key={p.id}>
                <div className="grow">
                  <b>{name(p)}</b>
                  <small className="mono">
                    {date(p.modified)} · {t('controls.count', { n: p.keys })}
                  </small>
                </div>
                <button className="btn ghost small" onClick={() => capture(p)}>
                  {t('controls.use')}
                </button>
              </li>
            ))}
            {!data.profiles.length && <li className="dim">{t('controls.noProfiles')}</li>}
          </ul>
        </div>
      </div>
      <div className="setting">
        <div className="setting-label">
          <b>{t('controls.auto')}</b>
          <small>{t('controls.autoHint')}</small>
        </div>
        <div className="setting-control">
          <Switch on={!!data.preset?.auto} disabled={!data.preset} label={t('controls.auto')} onChange={(on) => api.call('controls.auto', { on }).then(load)} />
        </div>
      </div>
      <div className="setting">
        <div className="setting-label">
          <b>{t('controls.apply')}</b>
          <small>{t('controls.applyHint')}</small>
        </div>
        <div className="setting-control">
          <button className="btn ghost small" onClick={applyAll} disabled={!data.preset}>
            <Mouse size={14} /> {t('controls.applyNow')}
          </button>
        </div>
      </div>
      <p className="fine-print">{t('controls.keysNote')}</p>
    </>
  )
}
