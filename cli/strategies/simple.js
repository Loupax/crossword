export class SimpleEngine {
  run(pool, grid) {
    const size = grid.size
    const dirs = ['horizontal', 'vertical']

    for (let i = 0; i < pool.length; i++) {
      const { word, hint } = pool[i]

      if (i === 0) {
        // First word: place at grid center, horizontal
        const row = Math.floor(size / 2)
        const col = Math.floor((size - word.length) / 2)
        if (grid.canPlace(word, row, col, 'horizontal')) {
          grid.place(word, hint, row, col, 'horizontal')
        }
        continue
      }

      // Find first valid position with at least one intersection
      let placed = false
      outer: for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          for (const dir of dirs) {
            if (
              grid.countIntersections(word, row, col, dir) >= 1 &&
              grid.canPlace(word, row, col, dir)
            ) {
              grid.place(word, hint, row, col, dir)
              placed = true
              break outer
            }
          }
        }
      }

      // Words that cannot be placed are simply skipped
      void placed
    }

    return grid.getPlacements()
  }
}
