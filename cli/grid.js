export class Grid {
  constructor(size) {
    this.size = size
    this.cells = new Map()   // "row,col" -> { letter, owners: Set<string> }
    this.placed = []         // Array<{ word, hint, row, col, direction }>
  }

  _key(row, col) {
    return `${row},${col}`
  }

  _cellsForWord(word, row, col, dir) {
    const positions = []
    for (let i = 0; i < word.length; i++) {
      if (dir === 'horizontal') {
        positions.push({ r: row, c: col + i, letter: word[i] })
      } else {
        positions.push({ r: row + i, c: col, letter: word[i] })
      }
    }
    return positions
  }

  _wordId(word, row, col, dir) {
    return `${word}@${row},${col},${dir}`
  }

  canPlace(word, row, col, dir) {
    const len = word.length
    const size = this.size

    // Bounds check
    if (dir === 'horizontal') {
      if (row < 0 || row >= size) return false
      if (col < 0 || col + len > size) return false
    } else {
      if (col < 0 || col >= size) return false
      if (row < 0 || row + len > size) return false
    }

    // End-cap check: cell immediately before start must be empty
    if (dir === 'horizontal') {
      if (col > 0 && this.cells.has(this._key(row, col - 1))) return false
      if (col + len < size && this.cells.has(this._key(row, col + len))) return false
    } else {
      if (row > 0 && this.cells.has(this._key(row - 1, col))) return false
      if (row + len < size && this.cells.has(this._key(row + len, col))) return false
    }

    // Per-cell checks
    for (let i = 0; i < len; i++) {
      const r = dir === 'horizontal' ? row : row + i
      const c = dir === 'horizontal' ? col + i : col
      const letter = word[i]
      const existing = this.cells.get(this._key(r, c))

      if (existing) {
        // Letter mismatch
        if (existing.letter !== letter) return false
      } else {
        // Empty cell — check adjacency: no occupied neighbors in the perpendicular axis
        if (dir === 'horizontal') {
          const above = this.cells.get(this._key(r - 1, c))
          const below = this.cells.get(this._key(r + 1, c))
          if (above) return false
          if (below) return false
        } else {
          const left  = this.cells.get(this._key(r, c - 1))
          const right = this.cells.get(this._key(r, c + 1))
          if (left)  return false
          if (right) return false
        }
      }
    }

    return true
  }

  place(word, hint, row, col, dir) {
    const id = this._wordId(word, row, col, dir)
    const positions = this._cellsForWord(word, row, col, dir)

    for (const { r, c, letter } of positions) {
      const key = this._key(r, c)
      if (this.cells.has(key)) {
        this.cells.get(key).owners.add(id)
      } else {
        this.cells.set(key, { letter, owners: new Set([id]) })
      }
    }

    this.placed.push({ word, hint, row, col, direction: dir })
  }

  remove(word, row, col, dir) {
    const id = this._wordId(word, row, col, dir)
    const positions = this._cellsForWord(word, row, col, dir)

    for (const { r, c } of positions) {
      const key = this._key(r, c)
      const cell = this.cells.get(key)
      if (cell) {
        cell.owners.delete(id)
        if (cell.owners.size === 0) {
          this.cells.delete(key)
        }
      }
    }

    const idx = this.placed.findIndex(
      p => p.word === word && p.row === row && p.col === col && p.direction === dir
    )
    if (idx !== -1) this.placed.splice(idx, 1)
  }

  countIntersections(word, row, col, dir) {
    let count = 0
    const positions = this._cellsForWord(word, row, col, dir)
    for (const { r, c, letter } of positions) {
      const existing = this.cells.get(this._key(r, c))
      if (existing && existing.letter === letter) count++
    }
    return count
  }

  getPlacements() {
    return [...this.placed]
  }
}
