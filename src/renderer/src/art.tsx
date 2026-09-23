import { useId, useMemo, useState } from 'react'

// Season key art, 3840 px wide: Throwback Launcher's set, pinned to one commit and loaded at runtime (never shipped here)
const KEYART = 'https://cdn.jsdelivr.net/gh/xeralin/ThrowbackLauncher@2255670641427c8e2b21951b3c6385fdc106ad5b/next/assets/keyart/'
export const keyArt = (key: string) => `${KEYART}${key}.webp`

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

/** The mark: Rainbow Six's six with the pistol, in silver, the same as the app icon (resources/icon.svg). */
export function Mark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="50 50 300 300" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#e4e7eb" />
          <stop offset="1" stopColor="#9fa4ac" />
        </linearGradient>
        <mask id={`${id}m`}>
          <path fill="#fff" d="M125 125A75 75 0 0 1 275 125V305A45 45 0 0 1 230 350H170A45 45 0 0 1 125 305Z" />
          <g fill="#000">
            <rect x="193" y="104" width="19" height="120" rx="9.5" />
            <path d="M193 134H290V201H275A30 30 0 0 0 245 171H193Z" />
            <path d="M166 206H238V225H222V254L215 262H202L198 320H169L173 238L163 231L166 225Z" />
          </g>
          <rect fill="#fff" x="203" y="232" width="13" height="22" rx="3" />
        </mask>
      </defs>
      <rect x="50" y="50" width="300" height="300" fill={`url(#${id}g)`} mask={`url(#${id}m)`} />
    </svg>
  )
}
