/**
 * One set of controls for every season. Siege keeps sensitivity and input options in
 * Documents\My Games\Rainbow Six - Siege\<profile>\GameSettings.ini, one profile per season
 * (ThrowbackLoader names it Throwback_<season folder>). A preset is the [INPUT] section of the
 * profile you pick; applying it writes only the keys the target already has, so each season
 * keeps what's its own: old ones skip the per-scope ADS settings, and nothing is added.
 * The value and its unit travel together (MouseYawSensitivity with MouseSensitivityMultiplierUnit),
 * so the feel carries over even where the slider scale changed.
 */
import { app } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME, type Methods } from './core'
import { applyTo, inputOf } from './ini'
import SEASONS from './seasons.json'

const ROOT = join(app.getPath('documents'), 'My Games', 'Rainbow Six - Siege')
const FILE = join(HOME, 'controls.json')
const LOADER_PREFIXES = ['Throwback_', 'R6Throwback_'] // the loader today, and its older builds

type Preset = { from: string; at: number; values: Record<string, string>; auto: boolean }

function preset(): Preset | null {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'))
  } catch {
    return null
  }
}

const ini = (profile: string) => join(ROOT, profile, 'GameSettings.ini')

/** Every profile with settings: the current game's (a Ubisoft account id) and each old season's. */
function profiles() {
  let names: string[] = []
  try {
    names = readdirSync(ROOT).filter((name) => existsSync(ini(name)))
  } catch {
    return []
  }
  return names
    .map((id) => {
      const prefix = LOADER_PREFIXES.find((p) => id.startsWith(p))
      const season = prefix ? SEASONS.find((s) => s.key === id.slice(prefix.length)) : undefined
      return { id, season: season ? `${season.id} ${season.name}` : '', modified: statSync(ini(id)).mtimeMs, keys: Object.keys(inputOf(readFileSync(ini(id), 'utf8'))).length }
    })
    .filter((p) => p.keys > 0)
    .sort((a, b) => b.modified - a.modified)
}

/** The profile a season started from Nostalgia uses (the loader derives it from the folder name). */
function profileOf(key: string): string | undefined {
  return LOADER_PREFIXES.map((p) => p + key).find((id) => existsSync(ini(id)))
}

/** Put the preset into one season's settings; a season never started has no file yet and is skipped. */
export function applySeason(key: string): number | null {
  const p = preset()
  const id = profileOf(key)
  if (!p || !id) return null
  const { text, changed } = applyTo(readFileSync(ini(id), 'utf8'), p.values)
  if (changed) writeFileSync(ini(id), text)
  return changed
}

/** Before a launch and after the game closes (the first run is what creates the file). */
export function onLaunch(key: string): void {
  if (preset()?.auto) applySeason(key)
}

export const methods: Methods = {
  'controls.get': () => ({ preset: preset(), profiles: profiles(), root: ROOT }),
  'controls.capture': ({ id, label }: { id: string; label: string }) => {
    const values = inputOf(readFileSync(ini(id), 'utf8'))
    const next: Preset = { from: label, at: Date.now(), values, auto: preset()?.auto ?? true }
    writeFileSync(FILE, JSON.stringify(next, null, 2))
    return next
  },
  'controls.auto': ({ on }: { on: boolean }) => {
    const p = preset()
    if (p) writeFileSync(FILE, JSON.stringify({ ...p, auto: on }, null, 2))
    return preset()
  },
  /** Apply to every season in the library folder; says how many took it and how many haven't been started yet. */
  'controls.applyAll': ({ keys }: { keys: string[] }) => {
    let applied = 0
    let waiting = 0
    for (const key of keys) {
      const changed = applySeason(key)
      if (changed === null) waiting++
      else applied++
    }
    return { applied, waiting }
  }
}
