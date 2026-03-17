export class BacktrackEngine {
  run(pool, grid) {
    const size = grid.size
    const TIME_BUDGET_MS = 5 * 60 * 1000
    const dirs = ['horizontal', 'vertical']

    // Sort pool by score descending
    const sorted = [...pool].sort((a, b) => b.score - a.score)

    // Precompute all candidate positions for each word
    const allPositions = sorted.map(({ word }) => {
      const positions = []
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          for (const dir of dirs) {
            positions.push({ row, col, dir })
          }
        }
      }
      return positions
    })

    const startTime = Date.now()

    const backtrack = (index) => {
      // Time budget check
      if (Date.now() - startTime > TIME_BUDGET_MS) return true
      if (index === sorted.length) return true

      const { word, hint } = sorted[index]

      // First word: place at center, no intersection required
      if (index === 0) {
        const row = Math.floor(size / 2)
        const col = Math.floor((size - word.length) / 2)
        if (grid.canPlace(word, row, col, 'horizontal')) {
          grid.place(word, hint, row, col, 'horizontal')
          if (backtrack(1)) return true
          grid.remove(word, row, col, 'horizontal')
        }
        return false
      }

      // Re-evaluate positions against current grid state, require intersections
      const candidates = allPositions[index]
        .filter(p => grid.canPlace(word, p.row, p.col, p.dir))
        .map(p => ({ ...p, intersections: grid.countIntersections(word, p.row, p.col, p.dir) }))
        .filter(p => p.intersections > 0)
        .sort((a, b) => b.intersections - a.intersections)

      for (const candidate of candidates) {
        grid.place(word, hint, candidate.row, candidate.col, candidate.dir)
        if (backtrack(index + 1)) return true
        grid.remove(word, candidate.row, candidate.col, candidate.dir)
      }

      // Word is optional — skip and continue
      return backtrack(index + 1)
    }

    backtrack(0)
    return grid.getPlacements()
  }
}
