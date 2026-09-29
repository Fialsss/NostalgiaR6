import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Trash2, X } from 'lucide-react'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted'

export function Chip({ tone = 'muted', dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return <span className={`chip ${tone}${dot ? ' dot' : ''}`}>{children}</span>
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

export function PageHead({ eyebrow, title, sub, right }: { eyebrow: string; title: ReactNode; sub?: string; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * A destructive action that asks first: a small dialog with a red confirm and a cancel.
 * It opens on document.body: a card's backdrop-filter would otherwise trap a fixed overlay inside the card.
 */
export function ConfirmButton(props: {
  label: string
  title: string
  body: string
  confirm: string
  cancel: string
  onConfirm: () => void
  small?: boolean
}) {
  const { label, title, body, confirm, cancel, onConfirm, small = true } = props
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button className={`btn ghost danger${small ? ' small' : ''}`} onClick={() => setOpen(true)}>
        <Trash2 size={14} /> {label}
      </button>
      {open &&
        createPortal(
          <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="dialog confirm" role="alertdialog" aria-modal="true" aria-label={title}>
              <span className="confirm-icon">
                <Trash2 size={22} />
              </span>
              <b>{title}</b>
              <p>{body}</p>
              <div className="confirm-actions">
                <button className="btn ghost" autoFocus onClick={() => setOpen(false)}>
                  {cancel}
                </button>
                <button
                  className="btn danger-fill"
                  onClick={() => {
                    setOpen(false)
                    onConfirm()
                  }}
                >
                  <Trash2 size={15} /> {confirm}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

export function Notice({ text, onClose }: { text: string; onClose?: () => void }) {
  return (
    <div className="notice">
      <AlertTriangle size={16} />
      <span>{text}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export const DISCORD = 'https://discord.gg/uWma5sfQAK'

/** Discord's mark (lucide has no brand icons); the button around it carries the name. */
export function DiscordIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
