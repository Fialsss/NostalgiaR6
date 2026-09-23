/** GameSettings.ini, just enough of it: read one section, overwrite values in place. No Electron here, so it runs under plain Node for its test. */
const SECTION = 'INPUT'

/** The [INPUT] section of a GameSettings.ini, in file order. */
export function inputOf(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  let section = ''
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (header) section = header[1]
    else if (section === SECTION) {
      const pair = /^\s*([^=;#\s][^=]*?)\s*=\s*(.*?)\s*$/.exec(line)
      if (pair) values[pair[1]] = pair[2]
    }
  }
  return values
}

/** Write the preset's values over the keys this file's [INPUT] already has; everything else stays as it was. */
export function applyTo(text: string, values: Record<string, string>): { text: string; changed: number } {
  let section = ''
  let changed = 0
  const lines = text.split(/(\r?\n)/)
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i]
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (header) {
      section = header[1]
      continue
    }
    if (section !== SECTION) continue
    const pair = /^(\s*)([^=;#\s][^=]*?)(\s*=\s*)(.*?)(\s*)$/.exec(line)
    if (!pair || !(pair[2] in values) || values[pair[2]] === pair[4]) continue
    lines[i] = `${pair[1]}${pair[2]}${pair[3]}${values[pair[2]]}${pair[5]}`
    changed++
  }
  return { text: lines.join(''), changed }
}
