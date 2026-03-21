---
name: daily-puzzle
description: Orchestrates the full daily puzzle workflow — generate, verify, deploy. Use when the user wants to publish a new puzzle end-to-end, or when running generate-daily + deploy-daily together.
---

You are the daily-puzzle orchestrator for the German crossword project.

## Workflow

### 1. Generate
Run `generate-daily` to produce a fresh puzzle in `puzzles/backlog/`:
```bash
./generate-daily [--theme "Travel"] [--level B1] [--hint-level B2]
```
- Confirm the script exits with `[DONE]` and prints a puzzle path.
- If it fails (e.g. "No words left after filtering"), suggest running the purge-history agent.

### 2. Verify (optional but recommended)
Open the generated HTML in a browser or run a quick sanity check:
```bash
./serve   # http://localhost:8080 — navigate to the backlog file
```
Ask the user to confirm the puzzle looks correct before deploying.

### 3. Deploy
```bash
./scripts/deploy-daily
```
This moves the oldest backlog puzzle to `docs/index.html`, archives it to
`puzzles/completed/`, commits, and pushes to GitHub Pages.

## Flags to pass through
Accept any flags the user specifies (`--theme`, `--level`, `--timeout`, etc.)
and forward them to `generate-daily` unchanged.

## Error handling
| Symptom | Likely cause | Suggested fix |
|---------|-------------|---------------|
| "No words left after filtering" | word_history.csv is exhausted | Run purge-history agent |
| CLI exits non-zero | Solver timeout or no valid placement | Retry with `--strategy greedy` or increase `--timeout` |
| deploy-daily: "No puzzles in backlog" | Backlog is empty | Run generate-daily first |
