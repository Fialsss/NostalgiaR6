import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { emit, TOOLS } from './core'
import * as games from './games'
import * as liberator from './liberator'
import { asset, json } from './net'
import * as steam from './steam'

/**
 * Everything Nostalgia takes from other projects follows their latest release. Each tool remembers the release
 * it came from; a little after startup, and every few hours, a newer one is fetched in the background. Never
 * during a download or while a season runs: the files are in use then, it waits for the next round.
 */
const FILE = join(TOOLS, 'versions.json')
const EVERY = 6 * 60 * 60 * 1000

type Tool = { name: string; repo: string; match: (asset: string) => boolean; have: () => boolean; fetch: () => Promise<unknown> }
const TOOLS_LIST: Tool[] = [
  { name: 'DepotDownloader', repo: 'SteamRE/DepotDownloader', match: (n) => n === 'DepotDownloader-windows-x64.zip', have: () => steam.tool().ok, fetch: steam.refreshTool },
  { name: 'ThrowbackLoader', repo: 'xeralin/ThrowbackLoader', match: (n) => n.endsWith('.zip'), have: () => games.tools().loader, fetch: games.fetchLoader },
  { name: 'Liberator', repo: 'xeralin/ThrowbackLauncher', match: (n) => n === 'Runtime.zip', have: liberator.available, fetch: liberator.fetchExe }
]

function known(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'))
  } catch {
    return {} // fetched before versions were kept: the next round takes the latest once
  }
}
function remember(name: string, tag: string) {
  mkdirSync(TOOLS, { recursive: true })
  writeFileSync(FILE, JSON.stringify({ ...known(), [name]: tag }, null, 2))
}

async function round(): Promise<void> {
  for (const t of TOOLS_LIST) {
    if (!t.have() || !games.idle() || (t.name === 'Liberator' && liberator.busy())) continue // not fetched yet: it comes when first needed
    try {
      const { tag } = await asset(t.repo, t.match)
      if (known()[t.name] === tag) continue
      await t.fetch()
      remember(t.name, tag)
      emit('tools.updated', { tool: t.name, version: tag.replace(/^\D*/, '') })
    } catch {
      // offline, rate-limited or busy right now: next round
    }
  }
  // Heated Metal, for the seasons that follow its latest release (the others are pinned to the build they need)
  const following = games.hmFollowing()
  if (following.length && games.idle()) {
    try {
      const { tag_name: tag } = await json<{ tag_name: string }>('https://api.github.com/repos/DataCluster0/HeatedMetal/releases/latest')
      for (const s of following.filter((s) => s.version !== tag)) {
        if (!games.idle()) break
        await games.installHm({ key: s.key })
        emit('tools.updated', { tool: 'Heated Metal', version: tag })
      }
    } catch {
      // next round
    }
  }
  if (games.idle()) await games.refreshTables()
}

export function start(): void {
  setTimeout(function again() {
    round().finally(() => setTimeout(again, EVERY))
  }, 20_000)
}
