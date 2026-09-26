import { useId, type ReactNode } from 'react'
import type { Lang } from './i18n'

// Drawn, not emoji: Windows has no flag emoji. Simplified where the real one has a crest (Spain).
const stripes = (colors: string[], vertical = false) =>
  colors.map((fill, i) =>
    vertical ? (
      <rect key={i} x={(i * 60) / colors.length} width={60 / colors.length + 0.2} height="40" fill={fill} />
    ) : (
      <rect key={i} y={(i * 40) / colors.length} width="60" height={40 / colors.length + 0.2} fill={fill} />
    )
  )

function UnitedKingdom() {
  const id = useId().replace(/:/g, '')
  return (
    <>
      <clipPath id={`${id}t`}>
        <path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z" />
      </clipPath>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="5" />
      <path d="M30,0 v40 M0,20 h60" stroke="#fff" strokeWidth="12" />
      <path d="M30,0 v40 M0,20 h60" stroke="#C8102E" strokeWidth="7" />
    </>
  )
}

const FLAGS: Record<Lang, () => ReactNode> = {
  en: UnitedKingdom,
  it: () => stripes(['#009246', '#fff', '#CE2B37'], true),
  fr: () => stripes(['#0055A4', '#fff', '#EF4135'], true),
  es: () => stripes(['#AA151B', '#F1BF00', '#F1BF00', '#AA151B']),
  de: () => stripes(['#000', '#DD0000', '#FFCE00']),
  pt: () => (
    <>
      <rect width="60" height="40" fill="#009C3B" />
      <path d="M30,4 L55,20 L30,36 L5,20 Z" fill="#FFDF00" />
      <circle cx="30" cy="20" r="9.5" fill="#002776" />
      <path d="M20.8,17.6 Q31,14.5 39.4,22.6" stroke="#fff" strokeWidth="2" fill="none" />
    </>
  ),
  pl: () => stripes(['#fff', '#DC143C']),
  ru: () => stripes(['#fff', '#0039A6', '#D52B1E'])
}

export function Flag({ lang, size = 28 }: { lang: Lang; size?: number }) {
  const Draw = FLAGS[lang]
  return (
    <svg className="flag" width={size} height={(size * 2) / 3} viewBox="0 0 60 40" aria-hidden="true">
      <Draw />
    </svg>
  )
}
