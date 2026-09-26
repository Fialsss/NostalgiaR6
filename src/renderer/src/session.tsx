import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  Info,
  LogIn,
  Languages,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  X
} from 'lucide-react'
import { api, useEvent, type Settings } from './api'
import { Flag } from './flags'
import { useI18n } from './i18n'
import { LanguageGrid } from './Start'
import { Segmented, Spinner, type Tone } from './ui'
import { UpdateMenuItems, useUpdates } from './update'

export type Profile = { user: string; steamid: string; name: string; avatar: string }
/** A season downloading: depot `step` of `steps` (the last step installs the loader). */
export type Job = { key: string; step: number; steps: number; percent: number; file: string }

/** The whole download as one number, each depot a slice of it. */
export const overall = (job: Job) => Math.min(100, ((job.step + job.percent / 100) / job.steps) * 100)
export const seasonId = (key: string) => key.split('_')[0]
type Toast = { id: number; text: string; tone: Tone }
type Mode = 'qr' | 'password'
type Code = { kind: 'app' | 'email'; retry: boolean }
type Login = {
  open: boolean
  mode: Mode
  busy: boolean // a sign-in started from this dialog is running
  qr: string[] | null
  phase: string
  code: Code | null
  error: string
  user: string // remembered for the form after an error; the password never is
  done: boolean
  flying: boolean
}

type Session = {
  profile: Profile | null
  job: Job | null
  playing: string | null // the season running, started from here
  arrived: boolean
  signIn: () => void
  signOut: () => Promise<void>
  toast: (text: string, tone?: Tone) => void
}

const Context = createContext<Session | null>(null)
export const useSession = () => useContext(Context)!

const CLOSED: Login = { open: false, mode: 'qr', busy: false, qr: null, phase: '', code: null, error: '', user: '', done: false, flying: false }

/** Steam account, background downloads and notifications, shared by every page. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [login, setLogin] = useState<Login>(CLOSED)
  const [arrived, setArrived] = useState(false)
  const nextToast = useRef(1)
  const current = useRef(login) // event handlers read the latest dialog state through this
  current.current = login

  const toast = useCallback((text: string, tone: Tone = 'info') => {
    const id = nextToast.current++
    setToasts((all) => [...all, { id, text, tone }])
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 5000)
  }, [])

  useEffect(() => {
    api.call<Profile | null>('steam.profile').then(setProfile).catch(() => undefined)
  }, [])

  // success: the badge plays, then the avatar flies to the account pill (see Welcome)
  const welcome = (p: Profile | null) => {
    setProfile(p)
    setLogin((l) => ({ ...l, busy: false, qr: null, code: null, error: '', done: true }))
    setTimeout(() => setLogin((l) => (l.done ? { ...l, flying: true } : l)), 1700)
  }
  const landed = () => {
    setLogin(CLOSED)
    setArrived(true)
    setTimeout(() => setArrived(false), 900)
  }
  // The welcome plays as soon as Steam accepts the sign-in (steam.signed_in); the call itself ends
  // later, once the file list that proves ownership is in. Whatever it says then comes as a toast.
  const finished = (p: Profile | null) => {
    const l = current.current
    if (l.open && !l.done) welcome(p)
  }
  const fail = (e: Error) => {
    if (e.message === 'Cancelled') return
    const l = current.current
    if (!l.open || l.done) toast(t(e.message), 'bad')
    else setLogin((l) => ({ ...l, busy: false, qr: null, code: null, phase: '', error: e.message }))
  }

  const startQr = () => {
    setLogin((l) => ({ ...CLOSED, open: true, user: l.user, busy: true }))
    api.call<Profile | null>('steam.login').then(finished).catch(fail)
  }
  const startPassword = (username: string, password: string) => {
    setLogin((l) => ({ ...l, mode: 'password', busy: true, error: '', phase: 'connecting', code: null, user: username }))
    api.call<Profile | null>('steam.login', { username, password }).then(finished).catch(fail)
  }
  // switching method stops whatever the other one was waiting for
  const switchMode = async (mode: Mode) => {
    await api.call('steam.cancel')
    if (mode === 'qr') {
      await new Promise((r) => setTimeout(r, 300))
      return startQr()
    }
    setLogin((l) => ({ ...l, mode, busy: false, qr: null, code: null, phase: '', error: '' }))
  }
  const sendCode = (code: string) => {
    setLogin((l) => ({ ...l, code: null, phase: 'connecting' }))
    api.call('steam.code', { code })
  }
  const close = () => {
    api.call('steam.cancel')
    setLogin(CLOSED)
  }

  const signOut = async () => {
    await api.call<Settings>('steam.signout')
    setProfile(null)
    toast(t('toast.signedOut'), 'muted')
  }

  // Steam can ask for a scan in the middle of any job: the dialog opens by itself.
  useEvent<{ matrix: string[] }>('steam.qr', (d) => setLogin((l) => ({ ...l, open: true, mode: 'qr', qr: d.matrix, error: '' })))
  useEvent<{ key: string }>('steam.status', (d) => setLogin((l) => ({ ...l, phase: d.key })))
  useEvent<Code>('steam.code', (d) => setLogin((l) => ({ ...l, open: true, code: d })))
  useEvent('steam.signed_in', () => {
    api.call<Profile | null>('steam.profile', { refresh: true }).then((p) => {
      const l = current.current
      if (l.open && !l.done) welcome(p)
      else if (!l.open && p) toast(t('toast.welcome', { name: p.name }), 'ok')
      setProfile(p)
    })
  })

  useEvent<{ key: string }>('games.started', (d) => setJob({ key: d.key, step: 0, steps: 3, percent: 0, file: '' }))
  useEvent<Job>('games.progress', setJob)
  useEvent<{ key: string; ok: boolean; cancelled: boolean }>('games.ended', (d) => {
    setJob(null)
    const season = seasonId(d.key)
    if (d.ok) toast(t('toast.done', { season }), 'ok')
    else if (d.cancelled) toast(t('toast.cancelled', { season }), 'muted')
    else toast(t('toast.failed', { season }), 'bad')
  })

  useEffect(() => {
    api.call<string | null>('games.running').then(setPlaying)
  }, [])
  useEvent<{ key: string; mod: string }>('mods.installed', (d) =>
    toast(t('workshop.installed', { mod: d.mod === 'hm' ? 'Heated Metal' : t('mod.table'), season: seasonId(d.key) }), 'ok')
  )
  useEvent<{ error: string }>('mods.failed', (d) => toast(t(d.error), 'bad'))
  useEvent<{ tool: string; version: string }>('tools.updated', (d) => toast(t('toast.toolUpdated', d), 'ok'))
  useEvent<{ key: string } | null>('games.running', (d) => {
    setPlaying(d?.key ?? null)
    if (d) api.window('minimize') // the game takes the screen: step aside to the taskbar
  })

  return (
    <Context.Provider value={{ profile, job, playing, arrived, signIn: startQr, signOut, toast }}>
      {children}
      {login.open && (
        <LoginDialog
          login={login}
          profile={profile}
          close={close}
          retryQr={startQr}
          switchMode={switchMode}
          startPassword={startPassword}
          sendCode={sendCode}
          landed={landed}
        />
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.tone}`}>
            {x.tone === 'ok' ? <CheckCircle2 size={16} /> : x.tone === 'bad' ? <AlertTriangle size={16} /> : <Info size={16} />}
            <span>{x.text}</span>
          </div>
        ))}
      </div>
    </Context.Provider>
  )
}

type DialogProps = {
  login: Login
  profile: Profile | null
  close: () => void
  retryQr: () => void
  switchMode: (mode: Mode) => void
  startPassword: (username: string, password: string) => void
  sendCode: (code: string) => void
  landed: () => void
}

function LoginDialog({ login, profile, close, retryQr, switchMode, startPassword, sendCode, landed }: DialogProps) {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !login.done && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [login.done])

  let body: ReactNode
  if (login.done) body = <Welcome profile={profile} flying={login.flying} landed={landed} />
  else if (login.code) body = <CodeForm code={login.code} send={sendCode} />
  else if (login.phase === 'confirm') body = <Confirm />
  else if (login.mode === 'password' && !login.busy) body = <PasswordForm user={login.user} error={login.error} submit={startPassword} />
  else if (login.mode === 'qr' && login.error)
    body = (
      <div className="login-state">
        <span className="tile-icon warn">
          <AlertTriangle size={18} />
        </span>
        <b>{t('login.failed')}</b>
        <p>{t(login.error)}</p>
        <button className="btn primary" onClick={retryQr}>
          {t('common.retry')}
        </button>
      </div>
    )
  else if (login.mode === 'qr' && login.qr)
    body = (
      <>
        <div className="login-qr">
          <QrCode matrix={login.qr} />
        </div>
        <ol className="login-steps">
          <li>{t('login.step1')}</li>
          <li>{t('login.step2')}</li>
          <li>{t('login.step3')}</li>
        </ol>
        <span className="chip info dot">
          <Smartphone size={12} /> {t('steam.waiting')}
        </span>
      </>
    )
  else
    body = (
      <div className="login-state">
        <Spinner size={28} />
        <b>{t(`steam.phase.${login.phase || 'connecting'}`)}</b>
        <small>{t('login.owns')}</small>
      </div>
    )

  return (
    <div className={`overlay${login.flying ? ' flying' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && !login.done && close()}>
      <div className={`dialog login-dialog${login.flying ? ' flying' : ''}`} role="dialog" aria-modal="true" aria-label={t('login.title')}>
        {!login.done && (
          <>
            <button className="dialog-close" onClick={close} aria-label={t('window.close')}>
              <X size={16} />
            </button>
            <div className="label">{t('login.title')}</div>
            {!login.code && login.phase !== 'confirm' && (
              <Segmented<Mode>
                value={login.mode}
                onChange={switchMode}
                options={[
                  ['qr', t('login.tabQr')],
                  ['password', t('login.tabPassword')]
                ]}
              />
            )}
          </>
        )}
        <div className="login-body" key={login.done ? 'done' : `${login.mode}-${login.code ? 'code' : login.phase}`}>
          {body}
        </div>
      </div>
    </div>
  )
}

function PasswordForm({ user, error, submit }: { user: string; error: string; submit: (u: string, p: string) => void }) {
  const { t } = useI18n()
  const [username, setUsername] = useState(user)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  return (
    <form
      className="login-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (username.trim() && password) submit(username.trim(), password)
      }}
    >
      <label>
        <span>{t('login.username')}</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!user} autoComplete="username" spellCheck={false} />
      </label>
      <label>
        <span>{t('login.password')}</span>
        <span className="password-field">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={!!user}
            autoComplete="current-password"
          />
          <button type="button" onClick={() => setShow(!show)} aria-label={t(show ? 'login.hide' : 'login.show')} data-tip={t(show ? 'login.hide' : 'login.show')}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </span>
      </label>
      {error && (
        <p className="login-error">
          <AlertTriangle size={14} /> {t(error)}
        </p>
      )}
      <button className="btn primary wide" type="submit" disabled={!username.trim() || !password}>
        <LogIn size={15} /> {t('account.signIn')}
      </button>
      <small className="login-note">
        <ShieldCheck size={13} /> {t('login.passwordNote')}
      </small>
    </form>
  )
}

function CodeForm({ code, send }: { code: Code; send: (c: string) => void }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  return (
    <form
      className="login-state code-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.length === 5) send(value)
      }}
    >
      <span className="tile-icon">{code.kind === 'app' ? <Smartphone size={18} /> : <Mail size={18} />}</span>
      <b>{t(code.kind === 'app' ? 'login.codeApp' : 'login.codeEmail')}</b>
      <small>{t(code.kind === 'app' ? 'login.codeAppHint' : 'login.codeEmailHint')}</small>
      {code.retry && (
        <p className="login-error">
          <AlertTriangle size={14} /> {t('login.codeWrong')}
        </p>
      )}
      <input
        className="code-input"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
        autoFocus
        spellCheck={false}
        aria-label={t('login.codeApp')}
      />
      <button className="btn primary wide" type="submit" disabled={value.length !== 5}>
        {t('login.confirm')}
      </button>
    </form>
  )
}

function Confirm() {
  const { t } = useI18n()
  return (
    <div className="login-state">
      <span className="phone-pulse">
        <Smartphone size={26} />
      </span>
      <b>{t('login.confirmTitle')}</b>
      <small>{t('login.confirmBody')}</small>
    </div>
  )
}

/** The welcome: a ring draws, the avatar pops in with sparks, then it flies into the account pill. */
function Welcome({ profile, flying, landed }: { profile: Profile | null; flying: boolean; landed: () => void }) {
  const { t } = useI18n()
  const avatar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = avatar.current
    if (!flying || !el) return
    const from = el.getBoundingClientRect()
    const to = document.querySelector('.account .avatar')?.getBoundingClientRect()
    if (!to) return landed()
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const flight = el.animate(
      [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.35}px) scale(${(to.width / from.width + 1) / 2})`, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` }
      ],
      { duration: 700, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'forwards' }
    )
    flight.onfinish = landed
    return () => flight.cancel()
  }, [flying])

  return (
    <div className="welcome-anim">
      <div className="welcome-badge">
        <svg className="welcome-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="56" />
        </svg>
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className="spark" style={{ '--a': `${i * 36}deg` } as React.CSSProperties} />
        ))}
        <span ref={avatar} className="welcome-avatar">
          <Avatar profile={profile} size={88} />
        </span>
        <span className="welcome-check">
          <Check size={14} strokeWidth={3} />
        </span>
      </div>
      <b>{t('login.welcome', { name: profile?.name ?? '' })}</b>
      <small>{t('login.ready')}</small>
    </div>
  )
}

export function QrCode({ matrix }: { matrix: string[] }) {
  const size = matrix.length
  const cells = matrix.flatMap((row, y) => [...row].map((c, x) => (c === '1' ? `M${x} ${y}h1v1h-1z` : '')))
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} shapeRendering="crispEdges" role="img" aria-label="Steam sign-in QR code">
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={cells.join('')} fill="#0b0b0d" />
    </svg>
  )
}

export function Avatar({ profile, size = 30 }: { profile: Profile | null; size?: number }) {
  const initial = (profile?.name || profile?.user || '?').slice(0, 1).toUpperCase()
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {profile?.avatar ? <img src={profile.avatar} alt="" /> : initial}
    </span>
  )
}

/** The pill in the top bar: sign-in button, or the Steam profile with its menu. */
export function AccountPill() {
  const { t } = useI18n()
  const { profile, arrived, signIn, signOut } = useSession()
  const { info } = useUpdates()
  const [open, setOpen] = useState(false)
  const [languages, setLanguages] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('mousedown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('mousedown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [open])

  const openLibrary = async () => api.open((await api.call<Settings>('settings.get')).library)

  return (
    <div className="account-wrap" ref={menu}>
      {/* signed out, the same menu opens (language, updates) with Sign in on top */}
      <button className={`account${profile ? '' : ' signin'}${open ? ' open' : ''}${arrived ? ' arrived' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {profile ? (
          <>
            <span className="avatar-dot">
              <Avatar profile={profile} />
              {info?.available && <i className="update-dot" />}
            </span>
            <span className="account-text">
              <b>{profile.name}</b>
              <small>Steam</small>
            </span>
          </>
        ) : (
          <span className="signin-icon">
            <LogIn size={16} />
            {info?.available && <i className="update-dot" />}
          </span>
        )}
        {!profile && t('check.signIn')}
        <ChevronDown size={15} className="chev" />
      </button>
      {open && !profile && (
        <div className="menu" role="menu">
          <button
            className="menu-item signin-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signIn()
            }}
          >
            <LogIn size={15} /> {t('account.signIn')}
          </button>
          <LanguageMenu open={languages} toggle={() => setLanguages(!languages)} />
          <UpdateMenuItems close={() => setOpen(false)} />
        </div>
      )}
      {open && profile && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <Avatar profile={profile} size={46} />
            <div className="grow">
              <b>{profile.name}</b>
              <small>@{profile.user}</small>
              {profile.steamid && <small className="mono">{profile.steamid}</small>}
            </div>
          </div>
          {profile.steamid && (
            <a className="menu-item" role="menuitem" href={`https://steamcommunity.com/profiles/${profile.steamid}`} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> {t('account.profile')}
            </a>
          )}
          <button className="menu-item" role="menuitem" onClick={openLibrary}>
            <FolderOpen size={15} /> {t('account.library')}
          </button>
          <LanguageMenu open={languages} toggle={() => setLanguages(!languages)} />
          <UpdateMenuItems close={() => setOpen(false)} />
          <button
            className="menu-item danger"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            <LogOut size={15} /> {t('steam.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}

function LanguageMenu({ open, toggle }: { open: boolean; toggle: () => void }) {
  const { t, lang } = useI18n()
  return (
    <>
      <button className={`menu-item${open ? ' open' : ''}`} role="menuitem" onClick={toggle} aria-expanded={open}>
        <Languages size={15} />
        <span className="grow">{t('setting.language')}</span>
        <Flag lang={lang} size={20} />
        <ChevronDown size={14} className="chev" />
      </button>
      {open && <LanguageGrid compact onPick={toggle} />}
    </>
  )
}

/** A download running in the background, or the season being played: visible from every page. */
export function JobChip({ onOpen }: { onOpen: (key: string) => void }) {
  const { t } = useI18n()
  const { job, playing } = useSession()
  if (playing && !job) {
    return (
      <button className="job playing" onClick={() => onOpen(playing)} data-tip={t('play.running')}>
        <i className="live" />
        <span className="mono">{seasonId(playing)}</span>
        <b>{t('play.live')}</b>
      </button>
    )
  }
  if (!job) return null
  const dash = 2 * Math.PI * 9
  const percent = overall(job)
  return (
    <button className="job" onClick={() => onOpen(job.key)} data-tip={job.file || seasonId(job.key)}>
      <svg viewBox="0 0 22 22" width="20" height="20">
        <circle cx="11" cy="11" r="9" className="job-track" />
        <circle cx="11" cy="11" r="9" className="job-fill" strokeDasharray={dash} strokeDashoffset={dash * (1 - percent / 100)} />
      </svg>
      <span className="mono">{seasonId(job.key)}</span>
      <b>{percent.toFixed(0)}%</b>
    </button>
  )
}
