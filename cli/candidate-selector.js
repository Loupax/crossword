const HIGH_FREQ = { E: 3, N: 3, I: 2, S: 2, R: 2, A: 2, T: 2 }
const RARE      = { Q: -3, X: -3, Y: -2, J: -2 }
const POOL_TARGETS = { anchors: 20, mediums: 25, glue: 30 }

function normalizeKey(word) {
  return word.toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
}

function computeScore(word) {
  let score = word.length * 2
  for (const c of word.toUpperCase()) {
    score += HIGH_FREQ[c] ?? RARE[c] ?? 0
  }
  return score
}

export class CandidateSelector {
  constructor({ size, excludeSet }) {
    this.size = size
    this.excludeSet = excludeSet
    this.dedup = new Map()   // normalizedKey -> { word, hint, score }
    this.buckets = {
      anchors: [],   // length >= 8
      mediums: [],   // length 5–7
      glue: []       // length 3–4
    }
  }

  add(word, hint) {
    const trimmed = word.trim()
    const key = normalizeKey(trimmed)

    if (this.dedup.has(key)) return
    if (this.excludeSet.has(key)) return
    if (trimmed.length > this.size) return
    if (trimmed.length < 3) return

    const score = computeScore(trimmed)
    const entry = { word: trimmed, hint, score }
    this.dedup.set(key, entry)

    if (trimmed.length >= 8) {
      this.buckets.anchors.push(entry)
    } else if (trimmed.length >= 5) {
      this.buckets.mediums.push(entry)
    } else {
      this.buckets.glue.push(entry)
    }
  }

  getWorkingPool() {
    const sortDesc = (a, b) => b.score - a.score

    const anchors = [...this.buckets.anchors].sort(sortDesc).slice(0, POOL_TARGETS.anchors)
    const mediums = [...this.buckets.mediums].sort(sortDesc).slice(0, POOL_TARGETS.mediums)
    const glue    = [...this.buckets.glue].sort(sortDesc).slice(0, POOL_TARGETS.glue)

    return [...anchors, ...mediums, ...glue]
  }
}
