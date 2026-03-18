#!/usr/bin/env node

import { randomBytes } from 'crypto'
import { join } from 'path'
import { writeFileSync } from 'fs'

import { validateEncoding } from './encoding-guard.js'
import { CandidateSelector } from './candidate-selector.js'
import { Grid } from './grid.js'
import { SimpleEngine } from './strategies/simple.js'
import { BacktrackEngine } from './strategies/backtrack.js'
import { TemplateEngine } from './strategies/template.js'
import { GreedyEngine } from './strategies/greedy.js'
import { HtmlExporter } from './html-exporter.js'
import { StateManager } from './state-manager.js'

// --- Duration parsing ---
// Accepts: '30s', '2m', '5m', or a plain integer string (treated as ms)
function parseDuration(value) {
  if (/^\d+s$/.test(value)) {
    return parseInt(value, 10) * 1000
  }
  if (/^\d+m$/.test(value)) {
    return parseInt(value, 10) * 60 * 1000
  }
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10)
  }
  throw new Error(`Invalid --timeout value: '${value}'. Use formats like '30s', '2m', or a plain millisecond integer.`)
}

// --- Arg parsing ---
function parseArgs(argv) {
  const args = {
    strategy: 'backtrack',
    size: 15,
    exclude: 'used_words.txt',
    outputDir: '.',
    templateFile: null,
    timeout: '5m'
  }

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--strategy':
        args.strategy = argv[++i]
        break
      case '--size':
        args.size = parseInt(argv[++i], 10)
        break
      case '--exclude':
        args.exclude = argv[++i]
        break
      case '--output-dir':
        args.outputDir = argv[++i]
        break
      case '--template-file':
        args.templateFile = argv[++i]
        break
      case '--timeout':
        args.timeout = argv[++i]
        break
      case '--help':
      case '-h':
        process.stdout.write(
          'Usage: crossword-cli [options]\n' +
          '\n' +
          'Reads CSV from stdin: WORD,"HINT"\n' +
          '\n' +
          'Options:\n' +
          '  --strategy backtrack|simple|greedy|template  Placement strategy (default: backtrack)\n' +
          '  --size N                             Grid size N×N (default: 15)\n' +
          '  --exclude path                       Path to used-words file (default: used_words.txt)\n' +
          '  --output-dir path                    Output directory (default: .)\n' +
          '  --template-file path                 Template file (required for template strategy)\n' +
          '  --timeout duration                   Time budget for the engine, e.g. 30s, 2m, 5m, or ms integer (default: 5m)\n' +
          '  --help                               Show this help\n'
        )
        process.exit(0)
    }
  }

  return args
}

// --- CSV parsing ---
// Handles: WORD,HINT and WORD,"HINT WITH, COMMA"
function parseCSVLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null

  const commaIdx = trimmed.indexOf(',')
  if (commaIdx === -1) return null

  const word = trimmed.slice(0, commaIdx).trim()
  let hint = trimmed.slice(commaIdx + 1).trim()

  // Strip surrounding quotes if present
  if (hint.startsWith('"') && hint.endsWith('"')) {
    hint = hint.slice(1, -1)
  }

  if (!word) return null
  return { word, hint }
}

// --- Read all stdin into buffer ---
async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', chunk => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
    process.stdin.on('error', reject)
  })
}

// --- Main ---
async function main() {
  const args = parseArgs(process.argv.slice(2))

  // 1. Read stdin
  const buffer = await readStdin()

  // 2. Validate encoding
  const text = validateEncoding(buffer)

  // 3. Parse CSV
  const rows = text.split('\n').map(parseCSVLine).filter(Boolean)

  // 4. Load exclude set
  const stateManager = new StateManager()
  const excludeSet = stateManager.load(args.exclude)

  // 5. Build candidate pool
  const selector = new CandidateSelector({ size: args.size, excludeSet })
  for (const { word, hint } of rows) {
    selector.add(word, hint)
  }

  // 6. Get working pool
  const pool = selector.getWorkingPool()

  // 7. Guard empty pool
  if (pool.length === 0) {
    process.stderr.write('No words available after filtering.\n')
    process.exit(1)
  }

  // 8. Build grid
  const grid = new Grid(args.size)

  // 9. Run engine
  const timeBudgetMs = parseDuration(args.timeout)
  let engine
  if (args.strategy === 'template') {
    if (!args.templateFile) {
      process.stderr.write('Error: --template-file is required when using --strategy template\n')
      process.exit(1)
    }
    engine = new TemplateEngine(args.templateFile)
  } else if (args.strategy === 'simple') {
    engine = new SimpleEngine()
  } else if (args.strategy === 'greedy') {
    engine = new GreedyEngine()
  } else {
    engine = new BacktrackEngine(timeBudgetMs)
  }
  const placements = engine.run(pool, grid)

  // 10. Generate output filename
  const hex = randomBytes(4).toString('hex')
  const base = 'cw_' + hex

  // 11. Export HTML
  const exporter = new HtmlExporter()
  await exporter.export(placements, args.size, join(args.outputDir, base + '.html'))

  // 12. Write TXT file (one word per line)
  const txtContent = placements.map(p => p.word).join('\n') + '\n'
  writeFileSync(join(args.outputDir, base + '.txt'), txtContent, 'utf8')

  // 13. Append to exclude file
  stateManager.append(args.exclude, placements.map(p => p.word))

  // 14. Print summary
  process.stdout.write(`Generated: ${base} (${placements.length} words placed)\n`)
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
})
