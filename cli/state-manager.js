import { readFileSync, appendFileSync, existsSync } from 'fs'

function normalizeKey(word) {
  return word.toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
}

export class StateManager {
  load(filePath) {
    if (!existsSync(filePath)) return new Set()
    const lines = readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    return new Set(lines.map(normalizeKey))
  }

  append(filePath, words) {
    if (words.length === 0) return
    const lines = words.map(w => normalizeKey(w)).join('\n') + '\n'
    appendFileSync(filePath, lines, 'utf8')
  }
}
