import { useEffect, useRef, useState } from 'react'
import type { NostalgiaApi } from '../../preload'

declare global {
  interface Window {
    nostalgia: NostalgiaApi
  }
}

export const api = window.nostalgia

export type Season = {
  id: string
  key: string
  name: string
  date: string
  build: string
  size: number // GB
  manifests: { ww: string; rus: string; content: string }
  liberator: '' | 'full' | 'events' | 'unlock'
  event: string
  hm?: string
  table?: string
  dir: string
  installed: boolean
  partial: boolean
  hmInstalled: boolean
  tableInstalled: boolean
  running: boolean
  downloading: boolean
}
export type Library = { root: string; free: number; last: { key: string; at: number }; seasons: Season[] }
export type Settings = { library: string; libraries: string[]; username: string; steam_user: string; liberator: boolean; last_played: string; last_played_at: number; tour_seen: boolean; notice_seen: string }

/** Subscribe to one event from the main process for the lifetime of the component. */
export function useEvent<T>(name: string, listener: (data: T) => void): void {
  const latest = useRef(listener)
  latest.current = listener
  useEffect(() => api.onEvent((e) => e.event === name && latest.current(e.data as T)), [name])
}

/** The library, refreshed whenever a download ends or the game starts or stops. */
export function useLibrary(): [Library | null, () => void] {
  const [library, setLibrary] = useState<Library | null>(null)
  const load = () => {
    api.call<Library>('games.list').then(setLibrary).catch(() => undefined)
  }
  useEffect(load, [])
  useEvent('games.started', load)
  useEvent('games.ended', load)
  useEvent('games.running', load)
  return [library, load]
}

export const seedOf = (s: { id: string }) => {
  const [, year, season] = /Y(\d+)S(\d+)/.exec(s.id) ?? []
  return Number(year) * 10 + Number(season)
}

export function bytes(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`
}

export const GB = 1024 ** 3
