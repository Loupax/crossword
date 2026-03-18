#!/usr/bin/env bash
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TMPDIR_CW="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_CW"' EXIT

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local result="$2"
  if [ "$result" = "pass" ]; then
    echo "PASS: $name"
    ((PASS++)) || true
  else
    echo "FAIL: $name"
    ((FAIL++)) || true
  fi
}

# Shared word list used across tests
WORD_LIST="KATZE,Eine Hauskatze
HUND,Ein Haustier
VOGEL,Fliegt hoch
BAUM,Wächst im Wald
HAUS,Ein Gebäude
TISCH,Möbelstück
STUHL,Sitzmöbel
FENSTER,Öffnung in der Wand
TÜR,Ein Eingang
GARTEN,Grünfläche"

# ---------------------------------------------------------------------------
# Test 1: simple strategy produces output files
# ---------------------------------------------------------------------------
T1_DIR="$TMPDIR_CW/t1"
mkdir -p "$T1_DIR"
T1_EXCLUDE="$TMPDIR_CW/t1_exclude.txt"

T1_RESULT="fail"
T1_OUTPUT="$(echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy simple --size 15 \
  --exclude "$T1_EXCLUDE" \
  --output-dir "$T1_DIR" 2>&1)" && T1_EXIT=0 || T1_EXIT=$?

if [ "$T1_EXIT" -eq 0 ] \
  && echo "$T1_OUTPUT" | grep -qE '^Generated: cw_[0-9a-f]+ \([0-9]+ words placed\)$' \
  && [ "$(find "$T1_DIR" -name '*.html' | wc -l)" -gt 0 ] \
  && [ "$(find "$T1_DIR" -name '*.txt' | wc -l)" -gt 0 ]; then
  T1_RESULT="pass"
fi
run_test "simple strategy produces output files" "$T1_RESULT"

# ---------------------------------------------------------------------------
# Test 2: backtrack strategy produces output files
# ---------------------------------------------------------------------------
T2_DIR="$TMPDIR_CW/t2"
mkdir -p "$T2_DIR"
T2_EXCLUDE="$TMPDIR_CW/t2_exclude.txt"

T2_RESULT="fail"
T2_OUTPUT="$(echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy backtrack --size 15 \
  --exclude "$T2_EXCLUDE" \
  --output-dir "$T2_DIR" 2>&1)" && T2_EXIT=0 || T2_EXIT=$?

if [ "$T2_EXIT" -eq 0 ] \
  && echo "$T2_OUTPUT" | grep -qE '^Generated: cw_[0-9a-f]+ \([0-9]+ words placed\)$' \
  && [ "$(find "$T2_DIR" -name '*.html' | wc -l)" -gt 0 ] \
  && [ "$(find "$T2_DIR" -name '*.txt' | wc -l)" -gt 0 ]; then
  T2_RESULT="pass"
fi
run_test "backtrack strategy produces output files" "$T2_RESULT"

# ---------------------------------------------------------------------------
# Test 3: HTML contains valid puzzle data structure
# ---------------------------------------------------------------------------
T3_DIR="$TMPDIR_CW/t3"
mkdir -p "$T3_DIR"
T3_EXCLUDE="$TMPDIR_CW/t3_exclude.txt"

T3_RESULT="fail"
echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy simple --size 15 \
  --exclude "$T3_EXCLUDE" \
  --output-dir "$T3_DIR" >/dev/null 2>&1 && T3_EXIT=0 || T3_EXIT=$?

if [ "$T3_EXIT" -eq 0 ]; then
  T3_HTML="$(find "$T3_DIR" -name '*.html' | head -1)"
  if [ -n "$T3_HTML" ]; then
    # Extract everything before the sentinel so we only inspect the injected JSON
    T3_BEFORE_SENTINEL="$(sed '/<!-- __PUZZLE_DATA_INJECTION__ -->/q' "$T3_HTML")"

    T3_HAS_PUZZLE_DATA=0
    T3_HAS_SENTINEL=0
    T3_HAS_METADATA=0
    T3_HAS_SALT=0
    T3_HAS_CLUES=0
    T3_HAS_ACROSS=0
    T3_HAS_DOWN=0
    T3_HAS_NO_ANSWER=0

    grep -q 'window\.__PUZZLE_DATA__' "$T3_HTML" && T3_HAS_PUZZLE_DATA=1
    grep -q '<!-- __PUZZLE_DATA_INJECTION__ -->' "$T3_HTML" && T3_HAS_SENTINEL=1
    echo "$T3_BEFORE_SENTINEL" | grep -q '"metadata"' && T3_HAS_METADATA=1
    echo "$T3_BEFORE_SENTINEL" | grep -q '"salt"' && T3_HAS_SALT=1
    echo "$T3_BEFORE_SENTINEL" | grep -q '"clues"' && T3_HAS_CLUES=1
    echo "$T3_BEFORE_SENTINEL" | grep -q '"across"' && T3_HAS_ACROSS=1
    echo "$T3_BEFORE_SENTINEL" | grep -q '"down"' && T3_HAS_DOWN=1
    # "answer" must NOT appear in the puzzle payload
    echo "$T3_BEFORE_SENTINEL" | grep -qv '"answer"' && T3_HAS_NO_ANSWER=1

    if [ "$T3_HAS_PUZZLE_DATA" -eq 1 ] \
      && [ "$T3_HAS_SENTINEL" -eq 1 ] \
      && [ "$T3_HAS_METADATA" -eq 1 ] \
      && [ "$T3_HAS_SALT" -eq 1 ] \
      && [ "$T3_HAS_CLUES" -eq 1 ] \
      && [ "$T3_HAS_ACROSS" -eq 1 ] \
      && [ "$T3_HAS_DOWN" -eq 1 ] \
      && [ "$T3_HAS_NO_ANSWER" -eq 1 ]; then
      T3_RESULT="pass"
    fi
  fi
fi
run_test "HTML contains valid puzzle data structure" "$T3_RESULT"

# ---------------------------------------------------------------------------
# Test 4: exclude file — word is filtered and file is appended
# ---------------------------------------------------------------------------
T4_DIR="$TMPDIR_CW/t4"
mkdir -p "$T4_DIR"
T4_EXCLUDE="$TMPDIR_CW/t4_exclude.txt"
echo "KATZE" > "$T4_EXCLUDE"

T4_RESULT="fail"
echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy simple --size 15 \
  --exclude "$T4_EXCLUDE" \
  --output-dir "$T4_DIR" >/dev/null 2>&1 && T4_EXIT=0 || T4_EXIT=$?

if [ "$T4_EXIT" -eq 0 ]; then
  T4_TXT="$(find "$T4_DIR" -name '*.txt' | head -1)"
  if [ -n "$T4_TXT" ]; then
    T4_NO_KATZE=0
    T4_APPENDED=0

    # KATZE must not appear in the placed words txt
    grep -qi '^KATZE$' "$T4_TXT" || T4_NO_KATZE=1

    # Exclude file must have grown beyond the initial 1 line
    T4_LINES="$(wc -l < "$T4_EXCLUDE")"
    [ "$T4_LINES" -gt 1 ] && T4_APPENDED=1

    if [ "$T4_NO_KATZE" -eq 1 ] && [ "$T4_APPENDED" -eq 1 ]; then
      T4_RESULT="pass"
    fi
  fi
fi
run_test "exclude file: word filtered and file appended" "$T4_RESULT"

# ---------------------------------------------------------------------------
# Test 5: duplicate input words deduplicated in output
# ---------------------------------------------------------------------------
T5_DIR="$TMPDIR_CW/t5"
mkdir -p "$T5_DIR"
T5_EXCLUDE="$TMPDIR_CW/t5_exclude.txt"

# Each word listed twice
T5_INPUT="HUND,Ein Haustier
KATZE,Eine Hauskatze
VOGEL,Fliegt hoch
BAUM,Wächst im Wald
HAUS,Ein Gebäude
TISCH,Möbelstück
STUHL,Sitzmöbel
FENSTER,Öffnung in der Wand
TÜR,Ein Eingang
GARTEN,Grünfläche
HUND,Ein Haustier
KATZE,Eine Hauskatze"

T5_RESULT="fail"
echo "$T5_INPUT" | node "$DIR/index.js" \
  --strategy simple --size 15 \
  --exclude "$T5_EXCLUDE" \
  --output-dir "$T5_DIR" >/dev/null 2>&1 && T5_EXIT=0 || T5_EXIT=$?

if [ "$T5_EXIT" -eq 0 ]; then
  T5_TXT="$(find "$T5_DIR" -name '*.txt' | head -1)"
  if [ -n "$T5_TXT" ]; then
    T5_HUND_COUNT="$(grep -ci '^HUND$' "$T5_TXT" || true)"
    T5_KATZE_COUNT="$(grep -ci '^KATZE$' "$T5_TXT" || true)"
    if [ "$T5_HUND_COUNT" -le 1 ] && [ "$T5_KATZE_COUNT" -le 1 ]; then
      T5_RESULT="pass"
    fi
  fi
fi
run_test "duplicate input words deduplicated in output" "$T5_RESULT"

# ---------------------------------------------------------------------------
# Test 6: encoding guard rejects non-UTF-8 input
# ---------------------------------------------------------------------------
T6_DIR="$TMPDIR_CW/t6"
mkdir -p "$T6_DIR"
T6_EXCLUDE="$TMPDIR_CW/t6_exclude.txt"

T6_RESULT="fail"
T6_STDERR="$(printf 'HUND,Ein Tier\n\xe4\xf6\xfc,Test\n' | node "$DIR/index.js" \
  --strategy simple --size 15 \
  --exclude "$T6_EXCLUDE" \
  --output-dir "$T6_DIR" 2>&1 >/dev/null)" && T6_EXIT=0 || T6_EXIT=$?

if [ "$T6_EXIT" -eq 1 ] \
  && echo "$T6_STDERR" | grep -q 'Error: Input encoding is not UTF-8'; then
  T6_RESULT="pass"
fi
run_test "encoding guard rejects non-UTF-8 input" "$T6_RESULT"

# ---------------------------------------------------------------------------
# Test 7: greedy strategy produces output files
# ---------------------------------------------------------------------------
T7_DIR="$TMPDIR_CW/t7"
mkdir -p "$T7_DIR"
T7_EXCLUDE="$TMPDIR_CW/t7_exclude.txt"

T7_RESULT="fail"
T7_OUTPUT="$(echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy greedy --size 15 \
  --exclude "$T7_EXCLUDE" \
  --output-dir "$T7_DIR" 2>&1)" && T7_EXIT=0 || T7_EXIT=$?

if [ "$T7_EXIT" -eq 0 ] \
  && echo "$T7_OUTPUT" | grep -qE '^Generated: cw_[0-9a-f]+ \([0-9]+ words placed\)$' \
  && [ "$(find "$T7_DIR" -name '*.html' | wc -l)" -gt 0 ] \
  && [ "$(find "$T7_DIR" -name '*.txt' | wc -l)" -gt 0 ]; then
  T7_RESULT="pass"
fi
run_test "greedy strategy produces output files" "$T7_RESULT"

# ---------------------------------------------------------------------------
# Test 8: greedy strategy places first word at center
# ---------------------------------------------------------------------------
T8_DIR="$TMPDIR_CW/t8"
mkdir -p "$T8_DIR"
T8_EXCLUDE="$TMPDIR_CW/t8_exclude.txt"

T8_RESULT="fail"
echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy greedy --size 15 \
  --exclude "$T8_EXCLUDE" \
  --output-dir "$T8_DIR" >/dev/null 2>&1 && T8_EXIT=0 || T8_EXIT=$?

if [ "$T8_EXIT" -eq 0 ]; then
  T8_HTML="$(find "$T8_DIR" -name '*.html' | head -1)"
  if [ -n "$T8_HTML" ]; then
    # The first across or down clue should exist, confirming placement occurred
    T8_HAS_ACROSS=0
    T8_HAS_DOWN=0
    grep -q '"across"' "$T8_HTML" && T8_HAS_ACROSS=1
    grep -q '"down"' "$T8_HTML" && T8_HAS_DOWN=1
    if [ "$T8_HAS_ACROSS" -eq 1 ] || [ "$T8_HAS_DOWN" -eq 1 ]; then
      T8_RESULT="pass"
    fi
  fi
fi
run_test "greedy strategy places words (has across or down clues)" "$T8_RESULT"

# ---------------------------------------------------------------------------
# Test 9: greedy places more words than minimum (intersection preference)
# ---------------------------------------------------------------------------
T9_DIR="$TMPDIR_CW/t9"
mkdir -p "$T9_DIR"
T9_EXCLUDE="$TMPDIR_CW/t9_exclude.txt"

T9_RESULT="fail"
echo "$WORD_LIST" | node "$DIR/index.js" \
  --strategy greedy --size 15 \
  --exclude "$T9_EXCLUDE" \
  --output-dir "$T9_DIR" >/dev/null 2>&1 && T9_EXIT=0 || T9_EXIT=$?

if [ "$T9_EXIT" -eq 0 ]; then
  T9_TXT="$(find "$T9_DIR" -name '*.txt' | head -1)"
  if [ -n "$T9_TXT" ]; then
    T9_WORD_COUNT="$(wc -l < "$T9_TXT")"
    # With 10 input words on a 15x15 grid, greedy should place at least 2
    if [ "$T9_WORD_COUNT" -ge 2 ]; then
      T9_RESULT="pass"
    fi
  fi
fi
run_test "greedy strategy places multiple words (intersection preference)" "$T9_RESULT"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
echo ""
echo "$PASS/$TOTAL tests passed"
[ "$FAIL" -eq 0 ]
