export class BacktrackEngine {
  constructor(timeBudgetMs = 5 * 60 * 1000) {
    this.timeBudgetMs = timeBudgetMs
  }

  run(pool, grid) {
    const size = grid.size
    const TIME_BUDGET_MS = this.timeBudgetMs
    const dirs = ['horizontal', 'vertical']

    // Sort pool by score descending
    const sorted = [...pool].sort((a, b) => b.score - a.score)

    // Precompute all candidate positions for each word (shuffled for layout variety)
    const allPositions = sorted.map(({ word }) => {
      const positions = []
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          for (const dir of dirs) {
            positions.push({ row, col, dir })
          }
        }
      }
      // Fisher-Yates shuffle so equal-intersection candidates are tried in random order
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]]
      }
      return positions
    })

    const startTime = Date.now()

    // Best-so-far tracker: stores the best placement snapshot found during search
    const best = { placements: [], count: 0 }

    const backtrack = (index) => {
      // Time budget check — return true to halt all exploration
      if (Date.now() - startTime > TIME_BUDGET_MS) return true

      // Base case: all words considered — snapshot if this is the best result
      if (index === sorted.length) {
        if (grid.placed.length > best.count) {
          best.placements = grid.getPlacements()
          best.count = grid.placed.length
        }
        return false // keep exploring other branches
      }

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

      // Skip this word and continue exploring
      if (backtrack(index + 1)) return true

      return false
    }

    backtrack(0)

    // Restore grid to the best snapshot found during search
    for (const p of grid.getPlacements()) {
      grid.remove(p.word, p.row, p.col, p.direction)
    }
    for (const p of best.placements) {
      grid.place(p.word, p.hint, p.row, p.col, p.direction)
    }

    return grid.getPlacements()
  }
}
