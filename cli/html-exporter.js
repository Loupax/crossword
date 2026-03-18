import { createHash, randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLAYER_TEMPLATE_PATH = join(__dirname, '..', 'player.html')
const SENTINEL = '<!-- __PUZZLE_DATA_INJECTION__ -->'

export class HtmlExporter {
  buildPuzzlePayload(placements, size) {
    // 1. Assign clue numbers (sort by row then col)
    const sorted = [...placements].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
    const numbered = []
    let num = 1
    const assigned = {}
    for (const p of sorted) {
      const key = `${p.row},${p.col}`
      if (!assigned[key]) assigned[key] = num++
      numbered.push({ ...p, number: assigned[key] })
    }

    // 2. Generate salt
    const salt = randomBytes(16).toString('hex')  // 32-char hex

    // 3. Hash each word's answer
    const hashAnswer = (answer) => {
      return createHash('sha256').update(salt + answer.toUpperCase()).digest('hex')
    }

    const across = numbered.filter(p => p.direction === 'horizontal')
    const down   = numbered.filter(p => p.direction === 'vertical')

    const mapClue = (p) => ({
      number: p.number,
      hint:   p.hint,
      row:    p.row,
      col:    p.col,
      length: p.word.length,
      hash:   hashAnswer(p.word)
    })

    return {
      metadata: {
        title: 'German Crossword',
        gridSize: { rows: size, cols: size },
        totalWords: placements.length,
        createdAt: new Date().toISOString()
      },
      salt,
      clues: {
        across: across.map(mapClue),
        down:   down.map(mapClue)
      }
    }
  }

  async export(placements, size, htmlPath) {
    const payload = await this.buildPuzzlePayload(placements, size)
    const template = readFileSync(PLAYER_TEMPLATE_PATH, 'utf8')

    if (!template.includes(SENTINEL)) {
      throw new Error(`Sentinel "${SENTINEL}" not found in player.html`)
    }

    const injection = `<script>\nwindow.__PUZZLE_DATA__ = ${JSON.stringify(payload)};\n</script>\n`
    const html = template.replace(SENTINEL, injection + SENTINEL)
    writeFileSync(htmlPath, html, 'utf8')
    return payload
  }
}
