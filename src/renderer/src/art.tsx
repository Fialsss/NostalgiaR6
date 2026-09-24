import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { api } from './api'

// Season key art, 3840 px wide: Throwback Launcher's set, pinned to one commit and fetched at runtime (never shipped here)
const KEYART = 'https://cdn.jsdelivr.net/gh/xeralin/ThrowbackLauncher@2255670641427c8e2b21951b3c6385fdc106ad5b/next/assets/keyart/'
const remote = (key: string) => `${KEYART}${key}.webp`

// Pictures already on disk (art://local/...), and the ones on their way there
const onDisk = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => {
  version++
  for (const listener of listeners) listener()
}
api
  .call<string[]>('art.list')
  .then((names) => {
    for (const name of names) onDisk.add(name)
    changed()
  })
  .catch(() => undefined)

/** Re-render when pictures land on disk. Called once, by the app. */
export function useArtCache(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version
  )
}

const waiting: string[] = []
const asked = new Set<string>()
let working = false

/** Download a season's key art once, one at a time, and keep it with a 960 px copy for grids. */
export function prefetch(key: string): void {
  if (asked.has(key) || (onDisk.has(`${key}.webp`) && onDisk.has(`${key}-960.webp`))) return
  asked.add(key)
  waiting.push(key)
  if (!working) setTimeout(work)
}

async function work() {
  working = true
  for (let key = waiting.shift(); key; key = waiting.shift()) {
    try {
      const blob = await (await fetch(remote(key))).blob()
      const bitmap = await createImageBitmap(blob, { resizeWidth: 960, resizeQuality: 'high' })
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
      const small = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })
      await api.call('art.save', { name: `${key}.webp`, bytes: new Uint8Array(await blob.arrayBuffer()) })
      await api.call('art.save', { name: `${key}-960.webp`, bytes: new Uint8Array(await small.arrayBuffer()) })
      onDisk.add(`${key}.webp`)
      onDisk.add(`${key}-960.webp`)
      changed()
    } catch {
      asked.delete(key) // offline: it stays on the CDN and is asked for again next time
    }
  }
  working = false
}

/** A season's key art: from disk once it's there (instant), from the CDN until then. Grids take the 960 px copy. */
export function keyArt(key: string, size: 'small' | 'full' = 'small'): string {
  const small = `${key}-960.webp`
  const full = `${key}.webp`
  if (size === 'small' && onDisk.has(small)) return `art://local/${small}`
  if (onDisk.has(full)) return `art://local/${full}`
  prefetch(key)
  return remote(key)
}

/** A stable hue for a season or operator id, so each one keeps its colour. */
export function hueOf(key: string): number {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  // golden-angle steps: ids one character apart land far apart on the wheel
  return Math.round((hash * 137.508) % 360)
}

/** mulberry32: neighbouring seeds still give unrelated sequences. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

type Shard = { points: string; transform: string; light: number; alpha: number; edge: number }

/**
 * Frozen shards in a season's hue. Generated, not shipped: the repo carries no
 * game art, and every season still gets its own cover.
 */
export function Shards({ seed, hue, grain = false, className }: { seed: number; hue: number; grain?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const shards = useMemo<Shard[]>(() => {
    const r = random(seed)
    return Array.from({ length: 17 }, () => {
      const length = 260 + r() * 640
      const width = 40 + r() * 170
      const points = [
        [0, -length / 2],
        [width / 2, -length * 0.14],
        [width * 0.22, length / 2],
        [-width / 2, length * 0.2]
      ].map((p) => p.join(',')).join(' ')
      // most shards gather on the right, where the glow is, leaving room for text on the left
      const x = 300 + Math.sqrt(r()) * 950
      const y = r() * 900 - 50
      const angle = -64 + r() * 16
      return { points, transform: `translate(${x} ${y}) rotate(${angle})`, light: 58 + r() * 34, alpha: 0.12 + r() * 0.5, edge: 0.12 + r() * 0.3 }
    })
  }, [seed])

  return (
    <svg className={className} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 34% 11%)`} />
          <stop offset="1" stopColor={`hsl(${hue} 18% 3%)`} />
        </linearGradient>
        <radialGradient id={`${id}glow`} cx="0.72" cy="0.34" r="0.6">
          <stop offset="0" stopColor={`hsla(${hue} 90% 64% / .72)`} />
          <stop offset=".45" stopColor={`hsla(${hue} 80% 44% / .22)`} />
          <stop offset="1" stopColor={`hsla(${hue} 85% 40% / 0)`} />
        </radialGradient>
        <radialGradient id={`${id}core`} cx="0.74" cy="0.32" r="0.14">
          <stop offset="0" stopColor={`hsla(${hue} 100% 92% / .55)`} />
          <stop offset="1" stopColor={`hsla(${hue} 100% 80% / 0)`} />
        </radialGradient>
        {shards.map((s, i) => (
          <linearGradient key={i} id={`${id}s${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={`hsla(${hue} 62% ${s.light}% / ${s.alpha})`} />
            <stop offset="1" stopColor={`hsla(${hue} 50% 30% / .02)`} />
          </linearGradient>
        ))}
        {grain && (
          <filter id={`${id}grain`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.07" />
            </feComponentTransfer>
          </filter>
        )}
      </defs>
      <rect width="1200" height="800" fill={`url(#${id}bg)`} />
      <rect width="1200" height="800" fill={`url(#${id}glow)`} />
      {shards.map((s, i) => (
        <polygon
          key={i}
          points={s.points}
          transform={s.transform}
          fill={`url(#${id}s${i})`}
          stroke={`hsla(${hue} 80% 88% / ${s.edge})`}
          strokeWidth="0.8"
        />
      ))}
      <rect width="1200" height="800" fill={`url(#${id}core)`} />
      {grain && <rect width="1200" height="800" filter={`url(#${id}grain)`} />}
    </svg>
  )
}

/** A season's real artwork when the wiki has it, the generated shards otherwise (offline, or not found). */
export function SeasonArt({ cover, seed, hue, className }: { cover?: string; seed: number; hue: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (cover && !broken) {
    return <img className={`season-img ${className ?? ''}`} src={cover} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
  }
  return <Shards className={className} seed={seed} hue={hue} />
}

// Rainbow Six's six with the pistol, traced from the logo (the same path as resources/icon.svg)
const SIX = 'M209.23 239.59L206.95 238.60L206.45 238.60L205.75 238.99L205.85 239.49L207.74 240.98L209.33 242.76L209.72 243.66L209.72 244.35L209.23 244.95L208.14 244.95L204.56 243.75L201.59 243.75L198.11 245.04L196.92 245.84L196.03 246.93L195.63 248.52L195.63 257.05L196.23 258.64L197.12 259.63L198.91 260.13L205.85 260.32L209.03 259.83L209.92 259.33L210.42 258.74L210.81 257.35L210.81 242.46L210.22 240.58ZM190.77 53.16L175.89 55.04L171.82 55.74L165.47 57.23L159.02 59.51L153.07 62.29L147.91 65.46L145.03 67.55L139.97 72.21L137.49 75.19L135.01 78.76L131.34 86.40L129.36 92.85L128.17 99.69L127.67 107.83L127.57 283.24L127.67 294.85L128.07 301.90L128.86 307.85L130.55 313.70L132.43 318.27L134.72 322.43L138.09 326.90L140.57 329.58L145.03 333.35L150.99 337.02L157.14 339.90L163.09 341.98L167.16 342.97L169.44 343.77L178.07 345.35L185.32 346.25L191.57 346.74L203.08 346.84L209.03 346.54L221.73 344.96L222.92 344.56L227.88 343.77L237.01 340.99L244.55 337.81L246.04 336.82L247.33 336.32L253.58 332.36L257.84 328.78L261.81 324.72L264.09 321.84L267.57 315.98L269.55 311.32L270.74 307.75L270.84 306.46L271.44 304.38L271.83 301.70L272.23 295.25L272.23 178.97L271.93 175.59L271.44 173.81L269.05 169.04L264.99 163.98L262.41 161.60L259.63 159.42L253.28 155.65L247.33 153.17L243.66 152.08L241.87 151.78L240.68 151.28L233.63 150.29L224.21 149.90L215.58 149.99L204.07 150.79L199.80 151.68L195.44 153.07L192.86 154.56L190.28 157.04L189.78 157.04L189.19 156.05L189.19 112.19L189.48 109.32L190.48 107.23L192.66 105.55L195.73 104.55L198.41 104.26L202.78 104.36L206.65 105.15L208.93 106.44L210.72 108.42L211.31 110.11L211.11 136.90L211.91 137.69L270.64 137.79L271.83 137.39L272.13 137.00L272.43 112.29L271.73 99.10L270.74 93.34L269.95 90.17L268.76 86.50L265.58 79.65L260.22 72.21L254.87 67.25L251.59 64.87L247.43 62.39L240.68 59.31L234.63 57.23L228.08 55.64L219.35 54.15L209.33 53.26ZM238.50 205.36L240.18 206.75L241.17 208.23L242.07 210.32L242.76 213.59L242.86 225.90L242.76 229.67L242.46 230.36L241.77 230.86L240.78 231.15L239.09 231.25L236.91 231.85L235.42 231.95L227.88 233.54L223.22 234.13L221.43 234.73L220.04 234.83L217.76 235.52L215.97 235.72L214.78 236.31L213.59 237.50L213.00 238.69L212.50 241.27L212.70 258.64L212.20 260.82L211.71 261.42L210.62 261.91L207.64 262.11L203.97 262.80L202.58 263.60L201.09 263.99L198.51 265.28L197.12 266.18L196.23 267.17L195.14 269.55L194.94 314.30L194.15 315.09L192.36 315.98L190.77 316.38L187.80 316.68L184.72 317.87L177.97 317.87L177.48 317.67L176.49 316.68L175.30 315.98L174.40 314.60L173.21 313.90L172.72 313.21L172.81 312.21L173.81 310.53L174.60 308.05L174.50 219.15L173.11 216.27L173.01 215.28L173.51 213.79L174.90 212.60L175.39 210.52L176.29 209.52L178.37 208.53L182.14 207.74L189.78 207.14L193.85 207.24L194.94 208.14L195.83 210.22L197.12 211.91L199.50 213.30L200.89 213.59L202.58 213.59L206.45 213.00L210.12 211.81L211.41 211.61L213.49 210.72L216.77 209.72L220.54 208.04L225.40 206.35L226.69 205.66L227.88 205.46L229.27 204.86L233.14 204.37L235.62 204.37Z'

/** The mark: the six in silver, as on the app icon. */
export function Mark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="48 48 304 304" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#e9ebee" />
          <stop offset="1" stopColor="#aab0b8" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}g)`} fillRule="evenodd" d={SIX} />
    </svg>
  )
}
