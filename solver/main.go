package main

import (
	cryptorand "crypto/rand"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	mathrand "math/rand"
	"os"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// JSON output structs
// ---------------------------------------------------------------------------

type GridSize struct {
	Rows int `json:"rows"`
	Cols int `json:"cols"`
}

type Metadata struct {
	Title      string   `json:"title"`
	GridSize   GridSize `json:"gridSize"`
	TotalWords int      `json:"totalWords"`
	CreatedAt  string   `json:"createdAt"`
}

type Clue struct {
	Number int    `json:"number"`
	Hint   string `json:"hint"`
	Row    int    `json:"row"`
	Col    int    `json:"col"`
	Length int    `json:"length"`
	Hash   string `json:"hash"`
}

type PuzzleData struct {
	Metadata Metadata          `json:"metadata"`
	Salt     string            `json:"salt"`
	Clues    map[string][]Clue `json:"clues"`
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

// Entry holds a word and its clue hint.
type Entry struct {
	Word string
	Hint string
}

// Placement records where a word was placed.
type Placement struct {
	Entry
	Row int
	Col int
	Dir byte // 'A' = across, 'D' = down
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

// Grid is a flat byte array. 0x00 = black cell, 'A'-'Z' = letter.
type Grid struct {
	N    int
	Data []byte
}

func newGrid(n int) *Grid {
	return &Grid{N: n, Data: make([]byte, n*n)}
}

func (g *Grid) idx(r, c int) int { return r*g.N + c }

func (g *Grid) clone() *Grid {
	data := make([]byte, len(g.Data))
	copy(data, g.Data)
	return &Grid{N: g.N, Data: data}
}

func (g *Grid) at(r, c int) byte {
	if r < 0 || r >= g.N || c < 0 || c >= g.N {
		return 0x00
	}
	return g.Data[g.idx(r, c)]
}

// canPlace checks whether a word can legally be placed at (row, col) in
// direction dir. Rules mirror the Node.js Grid.canPlace logic:
//   - Bounds must fit.
//   - End-caps: cell immediately before start and after end must be black/edge.
//   - Per cell: if occupied, letter must match; if empty, no occupied neighbor
//     in the perpendicular direction (no accidental word run-on).
func (g *Grid) canPlace(word string, row, col int, dir byte) bool {
	n := g.N
	length := len(word)

	// Bounds check
	if dir == 'A' {
		if row < 0 || row >= n || col < 0 || col+length > n {
			return false
		}
	} else {
		if col < 0 || col >= n || row < 0 || row+length > n {
			return false
		}
	}

	// End-cap check
	if dir == 'A' {
		if col > 0 && g.at(row, col-1) != 0x00 {
			return false
		}
		if col+length < n && g.at(row, col+length) != 0x00 {
			return false
		}
	} else {
		if row > 0 && g.at(row-1, col) != 0x00 {
			return false
		}
		if row+length < n && g.at(row+length, col) != 0x00 {
			return false
		}
	}

	// Per-cell checks
	for i := 0; i < length; i++ {
		r, c := row, col
		if dir == 'A' {
			c = col + i
		} else {
			r = row + i
		}
		letter := word[i]
		existing := g.at(r, c)

		if existing != 0x00 {
			if existing != letter {
				return false
			}
			// Shared cell — acceptable (intersection)
		} else {
			// Empty cell — perpendicular neighbors must be black
			if dir == 'A' {
				if g.at(r-1, c) != 0x00 || g.at(r+1, c) != 0x00 {
					return false
				}
			} else {
				if g.at(r, c-1) != 0x00 || g.at(r, c+1) != 0x00 {
					return false
				}
			}
		}
	}

	return true
}

// countIntersections returns how many cells in the proposed placement already
// contain the correct letter (shared cells with previously placed words).
func (g *Grid) countIntersections(word string, row, col int, dir byte) int {
	count := 0
	for i := 0; i < len(word); i++ {
		r, c := row, col
		if dir == 'A' {
			c = col + i
		} else {
			r = row + i
		}
		if g.at(r, c) == word[i] {
			count++
		}
	}
	return count
}

// place writes the word's letters into the grid (no validation).
func (g *Grid) place(word string, row, col int, dir byte) {
	for i := 0; i < len(word); i++ {
		r, c := row, col
		if dir == 'A' {
			c = col + i
		} else {
			r = row + i
		}
		g.Data[g.idx(r, c)] = word[i]
	}
}

// ---------------------------------------------------------------------------
// CSP Solver
// ---------------------------------------------------------------------------

type candidate struct {
	row, col     int
	dir          byte
	intersections int
}

type solver struct {
	n          int
	timeout    time.Duration
	start      time.Time
	best       []Placement
	bestCount  int
}

func newSolver(n int, timeout time.Duration) *solver {
	return &solver{n: n, timeout: timeout}
}

// candidatesFor returns all valid placements for word in grid that have at
// least minIntersect intersections. Set minIntersect=0 for the first word.
func (s *solver) candidatesFor(g *Grid, word string, minIntersect int) []candidate {
	n := s.n
	var out []candidate
	dirs := []byte{'A', 'D'}
	for _, dir := range dirs {
		for row := 0; row < n; row++ {
			for col := 0; col < n; col++ {
				if g.canPlace(word, row, col, dir) {
					isect := g.countIntersections(word, row, col, dir)
					if isect >= minIntersect {
						out = append(out, candidate{row, col, dir, isect})
					}
				}
			}
		}
	}
	// Shuffle for layout variety, then stable-sort descending by intersections
	mathrand.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	// Insertion sort descending by intersections (small slices, fast enough)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].intersections > out[j-1].intersections; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// solve runs backtracking CSP and returns the best placement list found.
func (s *solver) solve(entries []Entry) []Placement {
	s.start = time.Now()
	s.best = nil
	s.bestCount = 0

	if len(entries) == 0 {
		return nil
	}

	g := newGrid(s.n)
	placed := make([]Placement, 0, len(entries))
	remaining := make([]Entry, len(entries))
	copy(remaining, entries)

	s.backtrack(g, placed, remaining, true)
	return s.best
}

func (s *solver) timedOut() bool {
	return time.Since(s.start) >= s.timeout
}

func (s *solver) backtrack(g *Grid, placed []Placement, remaining []Entry, isFirst bool) bool {
	if s.timedOut() {
		return true
	}

	if len(remaining) == 0 {
		if len(placed) > s.bestCount {
			snapshot := make([]Placement, len(placed))
			copy(snapshot, placed)
			s.best = snapshot
			s.bestCount = len(placed)
		}
		return false
	}

	// MRV: pick the word with the fewest valid placements first.
	// For the very first word, all words have the same number of positions so
	// we just pick the longest to anchor the grid.
	if isFirst {
		// Sort remaining by length descending; place the longest word that fits
		// in the grid first at centre. Words longer than the grid are skipped.
		sortByLengthDesc(remaining)
		firstIdx := -1
		for i, e := range remaining {
			if len(e.Word) <= s.n {
				firstIdx = i
				break
			}
		}
		if firstIdx == -1 {
			return false // no word fits the grid
		}
		entry := remaining[firstIdx]
		rest := append(remaining[:firstIdx:firstIdx], remaining[firstIdx+1:]...)

		row := s.n / 2
		col := (s.n - len(entry.Word)) / 2
		if col < 0 {
			col = 0
		}
		if g.canPlace(entry.Word, row, col, 'A') {
			ng := g.clone()
			ng.place(entry.Word, row, col, 'A')
			newPlaced := append(placed, Placement{Entry: entry, Row: row, Col: col, Dir: 'A'})
			if s.backtrack(ng, newPlaced, rest, false) {
				return true
			}
		}
		// If longest fitting word can't go there, give up on first placement
		return false
	}

	// Choose next entry by MRV (fewest valid placements).
	mrvIdx := s.mrvIndex(g, remaining)
	entry := remaining[mrvIdx]
	rest := append(remaining[:mrvIdx:mrvIdx], remaining[mrvIdx+1:]...)

	cands := s.candidatesFor(g, entry.Word, 1) // must intersect at least once

	placed2 := append(placed, Placement{}) // grow slice once
	placed2 = placed2[:len(placed)]

	for _, cand := range cands {
		if s.timedOut() {
			return true
		}
		ng := g.clone()
		ng.place(entry.Word, cand.row, cand.col, cand.dir)
		placed2 = placed2[:len(placed)+1]
		placed2[len(placed)] = Placement{Entry: entry, Row: cand.row, Col: cand.col, Dir: cand.dir}
		if s.backtrack(ng, placed2, rest, false) {
			return true
		}
		placed2 = placed2[:len(placed)]
	}

	// Try skipping this word (place remaining without it) — capture best partial
	if s.backtrack(g, placed, rest, false) {
		return true
	}

	// Update best with what we have so far
	if len(placed) > s.bestCount {
		snapshot := make([]Placement, len(placed))
		copy(snapshot, placed)
		s.best = snapshot
		s.bestCount = len(placed)
	}

	return false
}

// mrvIndex returns the index in remaining of the word with the fewest valid
// placements in the current grid (most constrained).
func (s *solver) mrvIndex(g *Grid, remaining []Entry) int {
	best := -1
	bestCount := -1
	for i, e := range remaining {
		cands := s.candidatesFor(g, e.Word, 1)
		c := len(cands)
		if best == -1 || c < bestCount {
			best = i
			bestCount = c
		}
	}
	if best == -1 {
		return 0
	}
	return best
}

// sortByLengthDesc sorts entries in place, longest word first.
func sortByLengthDesc(entries []Entry) {
	// Simple insertion sort — pool sizes are small (≤~50 words)
	for i := 1; i < len(entries); i++ {
		for j := i; j > 0 && len(entries[j].Word) > len(entries[j-1].Word); j-- {
			entries[j], entries[j-1] = entries[j-1], entries[j]
		}
	}
}

// ---------------------------------------------------------------------------
// Clue numbering
// ---------------------------------------------------------------------------

type cellNumber struct {
	num          int
	startsAcross bool
	startsDown   bool
}

func numberCells(g *Grid) map[int]cellNumber {
	n := g.N
	result := make(map[int]cellNumber)
	num := 1
	for r := 0; r < n; r++ {
		for c := 0; c < n; c++ {
			if g.at(r, c) == 0x00 {
				continue
			}
			startsAcross := (c == 0 || g.at(r, c-1) == 0x00) &&
				c+1 < n && g.at(r, c+1) != 0x00
			startsDown := (r == 0 || g.at(r-1, c) == 0x00) &&
				r+1 < n && g.at(r+1, c) != 0x00
			if startsAcross || startsDown {
				result[g.idx(r, c)] = cellNumber{num, startsAcross, startsDown}
				num++
			}
		}
	}
	return result
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

func hashAnswer(salt, word string) string {
	h := sha256.Sum256([]byte(salt + strings.ToUpper(word)))
	return hex.EncodeToString(h[:])
}

func generateSalt() (string, error) {
	b := make([]byte, 16)
	_, err := cryptorand.Read(b)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

func parseCSV(r io.Reader) []Entry {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1 // allow variable columns
	reader.LazyQuotes = true

	var entries []Entry
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // skip malformed lines
		}
		if len(record) < 2 {
			continue
		}
		word := strings.TrimSpace(record[0])
		hint := strings.TrimSpace(record[1])
		if word == "" {
			continue
		}
		// Validate: word must be uppercase A-Z only
		valid := true
		for _, ch := range word {
			if ch < 'A' || ch > 'Z' {
				valid = false
				break
			}
		}
		if !valid {
			continue
		}
		entries = append(entries, Entry{Word: word, Hint: hint})
	}
	return entries
}

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

func buildPuzzleData(placements []Placement, gridN int, salt, title string) PuzzleData {
	// Reconstruct the final grid state for clue numbering
	g := newGrid(gridN)
	for _, p := range placements {
		g.place(p.Word, p.Row, p.Col, p.Dir)
	}

	cellNums := numberCells(g)

	var across []Clue
	var down []Clue

	for _, p := range placements {
		startIdx := g.idx(p.Row, p.Col)
		cn, ok := cellNums[startIdx]
		if !ok {
			// Shouldn't happen for valid placements, but be defensive
			continue
		}
		clue := Clue{
			Number: cn.num,
			Hint:   p.Hint,
			Row:    p.Row,
			Col:    p.Col,
			Length: len(p.Word),
			Hash:   hashAnswer(salt, p.Word),
		}
		if p.Dir == 'A' {
			across = append(across, clue)
		} else {
			down = append(down, clue)
		}
	}

	// Sort clues by number for predictable output
	sortClues(across)
	sortClues(down)

	return PuzzleData{
		Metadata: Metadata{
			Title:      title,
			GridSize:   GridSize{Rows: gridN, Cols: gridN},
			TotalWords: len(placements),
			CreatedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		},
		Salt: salt,
		Clues: map[string][]Clue{
			"across": across,
			"down":   down,
		},
	}
}

func sortClues(clues []Clue) {
	// Insertion sort by Number ascending
	for i := 1; i < len(clues); i++ {
		for j := i; j > 0 && clues[j].Number < clues[j-1].Number; j-- {
			clues[j], clues[j-1] = clues[j-1], clues[j]
		}
	}
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	size := flag.Int("size", 15, "Grid N×N")
	timeoutSec := flag.Int("timeout", 120, "Solver budget in seconds")
	title := flag.String("title", "German Crossword", "Puzzle title")
	flag.Parse()

	entries := parseCSV(os.Stdin)
	fmt.Fprintf(os.Stderr, "crossword-solver: read %d valid words from stdin\n", len(entries))

	// Discard words that can't fit in the grid, then cap at 60 words.
	// The CSP degrades badly beyond ~60 candidates; a large dictionary is
	// best filtered upstream (e.g. via generate-daily's exclusion logic).
	filtered := entries[:0]
	for _, e := range entries {
		if len(e.Word) >= 2 && len(e.Word) <= *size {
			filtered = append(filtered, e)
		}
	}
	entries = filtered
	if len(entries) > 60 {
		mathrand.Shuffle(len(entries), func(i, j int) { entries[i], entries[j] = entries[j], entries[i] })
		entries = entries[:60]
	}
	fmt.Fprintf(os.Stderr, "crossword-solver: using %d words after filter\n", len(entries))

	salt, err := generateSalt()
	if err != nil {
		fmt.Fprintf(os.Stderr, "crossword-solver: failed to generate salt: %v\n", err)
		os.Exit(1)
	}

	s := newSolver(*size, time.Duration(*timeoutSec)*time.Second)
	placements := s.solve(entries)

	fmt.Fprintf(os.Stderr, "crossword-solver: placed %d/%d words\n", len(placements), len(entries))

	puzzle := buildPuzzleData(placements, *size, salt, *title)

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(puzzle); err != nil {
		fmt.Fprintf(os.Stderr, "crossword-solver: json encode error: %v\n", err)
		os.Exit(1)
	}
}
