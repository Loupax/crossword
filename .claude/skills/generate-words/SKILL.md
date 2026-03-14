---
name: generate-words
description: Generate German vocabulary words with English clues for crossword import, at specified CEFR levels
---

Generate a list of German vocabulary words formatted as CSV for the crossword creator.

## Usage
`/generate-words [anything you want]`

Just describe what you need in plain language. All parameters are optional — use natural language, any order.

Examples:
- `/generate-words` → 10 words, A1 words, A2 hints
- `/generate-words 15 A2 words, B1 hints`
- `/generate-words 10 animal-themed words at A1, hints at A2`
- `/generate-words food vocabulary, 12 words`
- `/generate-words B2 level, travel theme, 8 words`

## Instructions

1. Read the user's free-form request and extract: count (default 10), word CEFR level (default A1), hint CEFR level (default A2), and any theme or topic if mentioned.

2. Generate the requested number of German words appropriate for the specified CEFR vocabulary level. Choose words suitable for a crossword (single words, no spaces, ideally 4–12 letters long).

3. For each word, write a clue in German appropriate for the specified hint CEFR level, unless the user explicitly requests another language. The clue should describe or define the word without using the word itself or its obvious direct translation. Use umlauts and special characters freely (ä, ö, ü, ß).

4. Output the result as a CSV block the user can copy and paste directly into the crossword creator's "Import CSV" textarea. Format:

```
word,clue
word,clue
...
```

No header row. One word per line. If a clue naturally contains a comma, wrap the clue in double quotes.

5. After the CSV block, add a brief note of any words that were skipped or adjusted (e.g., compound words split, words with spaces excluded).
