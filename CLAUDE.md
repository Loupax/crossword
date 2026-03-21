# Project Memory — German Crossword Generator

## What This Project Does
Generates playable German vocabulary crossword puzzles as self-contained HTML files.
Aimed at CEFR-levelled German learners (A1–B1 words, A1–B2 clues).

---

## Directory Layout

```
crossword/
├── cli/                  Node.js CLI — reads CSV from stdin, outputs HTML puzzle
│   ├── index.js          Entry point; arg parsing, orchestration
│   ├── candidate-selector.js  Scores & buckets words (anchors/mediums/glue)
│   ├── state-manager.js  Tracks used words via a plain-text exclude file
│   ├── html-exporter.js  Produces self-contained playable HTML (SHA-256 answer hashes)
│   ├── grid.js           N×N grid with placement validation
│   ├── encoding-guard.js UTF-8 validation; rejects replacement-char files
│   └── strategies/       backtrack (default) | greedy | simple | template
├── words/                Pre-generated CSV word lists (96 files)
│   └── crossword_<THEME>_<WORD_LEVEL>_<HINT_LEVEL>.csv
├── puzzles/
│   ├── backlog/          HTML puzzles ready to deploy
│   ├── completed/        Deployed puzzles archive
│   └── TODO.txt          Feature backlog
├── docs/                 GitHub Pages root; deploy-daily writes here
├── scripts/
│   └── deploy-daily      Rotates backlog → docs/index.html → completed, then git push
├── .claude/
│   ├── skills/generate-words/SKILL.md   Interactive word generation skill
│   └── agents/                          Sub-agent definitions
├── generate_words        Python — bulk generation via Claude API (all themes/levels)
├── gen                   Bash wrapper for generate_words (31 themes, 100 words/batch)
├── generate-daily        Python — repeatable daily puzzle generation (see below)
├── serve                 python3 -m http.server 8080
├── CLAUDE.md             ← this file
└── word_history.csv      Created on first run of generate-daily (WORD,HINT,DATE rows)
```

---

## CSV Format (stdin for the CLI)

```
WORD,"Hint text"
REISE,"Koffer packen ist Pflicht"
```

- Words must be uppercase, umlauts expanded: Ä→AE, Ö→OE, Ü→UE, ß→SS
- Hints must be in double quotes if they contain commas
- No header row

---

## CLI Quick Reference

```bash
cat words/crossword_Travel_B1_B2.csv | node cli/index.js \
  --strategy backtrack \   # backtrack | greedy | simple | template
  --size 15 \              # grid N×N (max word length = N)
  --exclude used_words.txt \ # plain-text list of words to skip
  --output-dir ./puzzles/backlog \
  --timeout 5m             # 30s | 2m | 5m | <ms>
```

Outputs: `cw_<hex>.html` (playable puzzle) + `cw_<hex>.txt` (placed words).
Appends placed words to the `--exclude` file automatically.

---

## Daily Puzzle Generation (generate-daily)

**Purpose:** Run once per day (or on demand) to produce a fresh puzzle that
never reuses words from previous runs.

**Tracking file — `word_history.csv`:**
```
REISE,"Koffer packen ist Pflicht",2026-03-21
BRIEF,"Papiergebundene Nachricht",2026-03-21
```
Format: `WORD,"HINT",YYYY-MM-DD` — three columns, appended after each run.
A separate TTL-purge script (not yet written) removes stale rows.

**Usage:**
```bash
./generate-daily                          # defaults: B1 words, B2 hints, no theme
./generate-daily --theme "Travel"
./generate-daily --level A2 --hint-level B1
./generate-daily --output-dir puzzles/backlog --timeout 5m
```

**Full option list:**

| Flag | Default | Description |
|------|---------|-------------|
| `--level` | B1 | CEFR level for answer words |
| `--hint-level` | B2 | CEFR level used in clue language |
| `--theme` | None | Vocabulary theme (or "None" for mixed) |
| `--output-dir` | puzzles/backlog | Where to write the HTML |
| `--history-file` | word_history.csv | Tracking file (WORD,HINT,DATE) |
| `--size` | 15 | Grid size N×N |
| `--strategy` | backtrack | Placement engine |
| `--timeout` | 5m | Solver time budget |

**Internal flow:**
1. Load `word_history.csv` → build exclusion set
2. Call Claude (claude-opus-4-6) with 30-word generation prompt + exclusion list
3. Filter response CSV against exclusion set (double safety)
4. Pipe filtered CSV to `node cli/index.js`
5. Read output `.txt` to find placed words; look up their hints
6. Append `WORD,"HINT",DATE` rows to `word_history.csv`

---

## Word Generation (bulk)

```bash
./gen                             # all 31 themes, A1/A2/B1, B1 hints, 100/batch
./generate_words --hint-level B2 --batch-size 50 --themes Travel "Food and Cooking"
```

Output: `crossword_<THEME>_<LEVEL>_<HINT_LEVEL>.csv` in current directory.
Move files to `words/` to make them available to the CLI.

---

## Deployment

```bash
./scripts/deploy-daily   # publish next puzzle from backlog, push to GitHub Pages
./serve                  # local preview at http://localhost:8080
```

---

## Key Design Decisions

- **Umlaut expansion** is done at generation time; the grid only contains A–Z.
- **Answer hashing**: player HTML embeds SHA-256(salt + answer); answers are never in plaintext.
- **Exclusion is two-layered** in `generate-daily`: Claude is told not to generate excluded words (prompt), and any that slip through are filtered in Python before reaching the CLI.
- **CLI exclusion file** (`--exclude`) is bypassed with `/dev/null` in `generate-daily` because history-based exclusion already handles deduplication.
- **`word_history.csv` TTL** is intentionally delegated to a separate purge script so the daily script stays simple.
