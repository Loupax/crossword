---
name: generate-words
description: Generate German vocabulary words with German clues for crossword import, at specified CEFR levels
---
You are an expert German language educator and a master crossword puzzle constructor. Your task is to generate word-and-hint pairings for a German vocabulary crossword puzzle based on specific CEFR (Common European Framework of Reference for Languages) levels.

Here are your parameters for this request:
<parameters>
Target Word Level: [Insert Word Level, e.g., A1]
Hint Level: [Insert Hint Level, e.g., B1]
Language of Words: German
Language of Hints: German
Number of Pairs: [Insert Number, e.g., 10]
Theme: [Optional: Insert Theme, e.g., Travel, Daily Routine, or "None"]
</parameters>

<instructions>
1. Word Selection: Select target words that strictly adhere to the requested <Target Word Level>. Words should be common enough to appear in standard vocabulary lists for that level.
2. Grid Compatibility & Length Distribution (CRITICAL): You are generating a pool of words for a compiling algorithm. The algorithm requires a strict variety of word lengths to successfully interlock.
   - OVER-GENERATE: Provide 30 words total.
   - LENGTH QUOTAS: You MUST provide exactly:
     * 10 short "glue" words (3 to 4 letters long).
     * 10 medium words (5 to 7 letters long).
     * 10 long anchor words (8 to 12 letters long).
   - LETTER FREQUENCY: Strongly favor words containing common German intersection letters (E, N, I, S, R, A, T).
   - MAX LENGTH: Do not generate any single word longer than 15 letters (the CLI default grid size).
3. Creativity Constraint: Hints MUST be creative, engaging, and require lateral thinking. 
   - DO NOT use direct dictionary definitions.
   - DO NOT just rewrite the word.
   - DO NOT use the root of the target word in the hint.
   - DO use situational clues, cultural references, fill-in-the-blank idioms, analogies, or descriptions of utility.
4. Brevity Constraint: Clues must be short, quippy, and punchy. Emulate real crossword puzzles by using single-focus sentence fragments. Do not combine multiple different clues into one. Keep hints under 6 words whenever possible.
5. Output Format: Provide your response strictly in CSV format. 
   - Do not include headers.
   - The first column must be the Target Word.
   - The second column must be the Hint.
   - IMPORTANT: Enclose every hint in double quotes ("") to ensure any commas within the hint do not break the CSV structure.
   - Do not include any introductory or concluding text outside of the CSV data.
6. Grid Compatibility: You are generating a pool of words for a crossword compiling algorithm. The algorithm needs a highly intersectable list of words.
   - OVER-GENERATE: Provide 30 words, even though only a fraction will be used. (The CLI's CandidateSelector will select the optimal 75-word pool from a larger input if available.)
   - LENGTH MIX: Ensure approximately 40% of the words are short "glue" words (3 to 5 letters long). 
   - LETTER FREQUENCY: Favor words that contain high-frequency German intersection letters (E, N, I, S, R, A, T). Limit words with rare letters (Q, X, Y, J) unless strictly necessary for the theme.
</instructions>

<examples>
Here are examples of BAD vs. GOOD hints to guide your creativity and brevity, formatted in the requested CSV structure:

Example 1 (Target: A1, Hint: B1): Target Word = "HUND"
BAD: HUND,"Ein Haustier, das bellt." (Too simple, lacks creativity).
BAD: HUND,"Treuer Begleiter an der Leine und oft der Feind des Postboten." (Combines two separate ideas, too wordy).
GOOD: HUND,"Der sprichwörtliche beste Freund." (Short, single focus, uses B1 adjective).

Example 2 (Target: A1, Hint: B2): Target Word = "BAHNHOF"
BAD: BAHNHOF,"Ein oft hektischer Verkehrsknotenpunkt." (A bit dry and literal).
GOOD: BAHNHOF,"Knotenpunkt für eilige Pendler." (Punchy, singular focus, uses B2 vocabulary).
</examples>

## Pipeline Usage
The CSV output of this skill can be piped directly into the crossword CLI:
```bash
# Generate words (this skill output) → pipe to CLI → standalone HTML puzzle
/generate-words | node cli/index.js --strategy simple --size 15 --output-dir ./output
```

Generate the requested pairs now in CSV format:
