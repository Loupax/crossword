import { readFileSync } from 'fs'

export class TemplateEngine {
  constructor(templatePath) {
    this.templatePath = templatePath
  }

  run(pool, grid) {
    // 1. Parse the template file
    const template = this._parseTemplate()

    // 2. Extract slots (consecutive runs of white cells, length >= 2)
    const slots = this._extractSlots(template)

    if (slots.length === 0) {
      return grid.getPlacements()
    }

    // 3. Build a word pool indexed by length
    const wordsByLength = new Map()
    for (const entry of pool) {
      const len = entry.word.length
      if (!wordsByLength.has(len)) {
        wordsByLength.set(len, [])
      }
      wordsByLength.get(len).push(entry)
    }

    // Shuffle each length bucket for variety
    for (const [, bucket] of wordsByLength) {
      for (let i = bucket.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bucket[i], bucket[j]] = [bucket[j], bucket[i]]
      }
    }

    // 4. Precompute intersection map: for each slot, which other slots share a cell
    //    intersections[i] = [ { otherSlotIdx, myCellOffset, otherCellOffset } ]
    const intersections = slots.map(() => [])
    const cellToSlot = new Map() // "row,col" -> [ { slotIdx, offset } ]

    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]
      for (let offset = 0; offset < slot.length; offset++) {
        const r = slot.direction === 'horizontal' ? slot.row : slot.row + offset
        const c = slot.direction === 'horizontal' ? slot.col + offset : slot.col
        const key = `${r},${c}`
        if (!cellToSlot.has(key)) {
          cellToSlot.set(key, [])
        }
        cellToSlot.get(key).push({ slotIdx: si, offset })
      }
    }

    for (const [, entries] of cellToSlot) {
      if (entries.length === 2) {
        const [a, b] = entries
        intersections[a.slotIdx].push({
          otherSlotIdx: b.slotIdx,
          myCellOffset: a.offset,
          otherCellOffset: b.offset
        })
        intersections[b.slotIdx].push({
          otherSlotIdx: a.slotIdx,
          myCellOffset: b.offset,
          otherCellOffset: a.offset
        })
      }
    }

    // 5. Backtracking solver with best-partial fallback
    const usedWords = new Set()
    const slotAssignments = new Array(slots.length).fill(null) // stores { word, hint }
    const best = { placements: [], count: 0 }

    const isConsistent = (slotIdx, word) => {
      for (const ix of intersections[slotIdx]) {
        const otherAssignment = slotAssignments[ix.otherSlotIdx]
        if (otherAssignment !== null) {
          if (word[ix.myCellOffset] !== otherAssignment.word[ix.otherCellOffset]) {
            return false
          }
        }
      }
      return true
    }

    const backtrack = (idx) => {
      const current = grid.getPlacements().length
      if (current > best.count) {
        best.placements = grid.getPlacements()
        best.count = current
      }

      if (idx === slots.length) return true // all slots filled

      const slot = slots[idx]
      const candidates = wordsByLength.get(slot.length) || []

      for (const entry of candidates) {
        const upperWord = entry.word.toUpperCase()
        if (usedWords.has(upperWord)) continue
        if (!isConsistent(idx, upperWord)) continue

        grid.place(entry.word, entry.hint, slot.row, slot.col, slot.direction)
        slotAssignments[idx] = { word: upperWord, hint: entry.hint }
        usedWords.add(upperWord)

        if (backtrack(idx + 1)) return true

        // Backtrack
        grid.remove(entry.word, slot.row, slot.col, slot.direction)
        slotAssignments[idx] = null
        usedWords.delete(upperWord)
      }

      return false
    }

    backtrack(0)

    // If no complete solution, restore grid to best partial found
    if (grid.getPlacements().length < best.count) {
      for (const p of grid.getPlacements()) {
        grid.remove(p.word, p.row, p.col, p.direction)
      }
      for (const p of best.placements) {
        grid.place(p.word, p.hint, p.row, p.col, p.direction)
      }
    }

    return grid.getPlacements()
  }

  _parseTemplate() {
    const content = readFileSync(this.templatePath, 'utf8')
    const lines = content.split('\n').filter(line => {
      // Keep lines that contain at least one . or #
      return /[.#]/.test(line)
    })

    return lines.map(line => {
      const cells = []
      for (const ch of line) {
        if (ch === '.') cells.push('white')
        else if (ch === '#') cells.push('black')
        // spaces and other characters are ignored
      }
      return cells
    })
  }

  _extractSlots(template) {
    const slots = []
    const rows = template.length
    if (rows === 0) return slots
    const cols = Math.max(...template.map(r => r.length))

    // Horizontal slots: consecutive white cells in each row
    for (let r = 0; r < rows; r++) {
      let runStart = null
      for (let c = 0; c <= template[r].length; c++) {
        const isWhite = c < template[r].length && template[r][c] === 'white'
        if (isWhite) {
          if (runStart === null) runStart = c
        } else {
          if (runStart !== null) {
            const length = c - runStart
            if (length >= 2) {
              slots.push({ row: r, col: runStart, direction: 'horizontal', length })
            }
            runStart = null
          }
        }
      }
    }

    // Vertical slots: consecutive white cells in each column
    for (let c = 0; c < cols; c++) {
      let runStart = null
      for (let r = 0; r <= rows; r++) {
        const isWhite = r < rows && c < template[r].length && template[r][c] === 'white'
        if (isWhite) {
          if (runStart === null) runStart = r
        } else {
          if (runStart !== null) {
            const length = r - runStart
            if (length >= 2) {
              slots.push({ row: runStart, col: c, direction: 'vertical', length })
            }
            runStart = null
          }
        }
      }
    }

    return slots
  }
}
