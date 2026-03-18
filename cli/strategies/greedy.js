function normalizeWord(word) {
  return word.toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
}

export class GreedyEngine {
  run(pool, grid) {
    const size = grid.size

    if (pool.length === 0) {
      return grid.getPlacements()
    }

    // --- Place first word at center ---
    const first = pool[0]
    const hRow = Math.floor(size / 2)
    const hCol = Math.max(0, Math.floor((size - first.word.length) / 2))

    const vRow = Math.max(0, Math.floor((size - first.word.length) / 2))
    const vCol = Math.floor(size / 2)

    if (grid.canPlace(first.word, hRow, hCol, 'horizontal')) {
      grid.place(first.word, first.hint, hRow, hCol, 'horizontal')
    } else if (grid.canPlace(first.word, vRow, vCol, 'vertical')) {
      grid.place(first.word, first.hint, vRow, vCol, 'vertical')
    } else {
      return grid.getPlacements()
    }

    // --- Place remaining words ---
    for (let i = 1; i < pool.length; i++) {
      const { word, hint } = pool[i]

      // Find all valid placements
      const allPlacements = this._findAllPlacements(word, grid)
      if (allPlacements.length === 0) continue

      // Compute other words for future-fit scoring (all pool words except current)
      const otherWords = pool
        .filter((_, idx) => idx !== i)
        .map(e => normalizeWord(e.word))

      // Score each placement
      const scored = allPlacements.map(p => ({
        p,
        score: this._scorePlacement(p, word, grid, size, otherWords)
      }))
      scored.sort((a, b) => b.score - a.score)

      // Prefer placements with intersections; fall back to highest score overall
      const best = (scored.find(s => s.p.intersections > 0) ?? scored[0]).p

      grid.place(word, hint, best.row, best.col, best.direction)
    }

    return grid.getPlacements()
  }

  _findAllPlacements(word, grid) {
    const size = grid.size
    const placements = []

    for (const direction of ['horizontal', 'vertical']) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (grid.canPlace(word, r, c, direction)) {
            placements.push({
              row: r,
              col: c,
              direction,
              intersections: grid.countIntersections(word, r, c, direction)
            })
          }
        }
      }
    }

    return placements
  }

  _scorePlacement(placement, word, grid, size, otherWords) {
    const centerR = size / 2
    const centerC = size / 2
    const distFromCenter = Math.abs(placement.row - centerR) + Math.abs(placement.col - centerC)
    const maxDist = centerR + centerC

    // Compute future connectivity
    let futureConnectivity = 0
    if (otherWords && otherWords.length > 0) {
      const normalized = normalizeWord(word)
      const dr = placement.direction === 'vertical' ? 1 : 0
      const dc = placement.direction === 'horizontal' ? 1 : 0

      for (let i = 0; i < normalized.length; i++) {
        const r = placement.row + dr * i
        const c = placement.col + dc * i

        // Only count letters in empty cells (new connection points)
        if (!grid.cells.has(`${r},${c}`)) {
          const letter = normalized[i]
          for (const uw of otherWords) {
            if (uw.includes(letter)) futureConnectivity++
          }
        }
      }
      if (futureConnectivity > 50) futureConnectivity = 50
    }

    return placement.intersections * 100 + futureConnectivity * 10 + (maxDist - distFromCenter)
  }
}
