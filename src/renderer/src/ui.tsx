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
