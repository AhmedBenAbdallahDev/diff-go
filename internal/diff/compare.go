// Package diff provides text comparison functionality.
package diff

import (
	"fmt"
	"strings"
)

// CompareTexts compares two texts and returns a FileDiff with line-by-line changes.
// This is used for the web UI when users paste or upload text/files.
func CompareTexts(oldText, newText, oldName, newName string) *FileDiff {
	oldLines := splitLines(oldText)
	newLines := splitLines(newText)

	// Compute LCS-based diff
	hunks := computeHunks(oldLines, newLines)

	// Determine status
	status := "modified"
	if len(oldLines) == 0 && len(newLines) > 0 {
		status = "added"
	} else if len(oldLines) > 0 && len(newLines) == 0 {
		status = "deleted"
	} else if oldText == newText {
		status = "unchanged"
	}

	return &FileDiff{
		OldName: oldName,
		NewName: newName,
		Status:  status,
		Hunks:   hunks,
	}
}

// CompareTextsAsResult wraps CompareTexts and returns a Result.
func CompareTextsAsResult(oldText, newText, oldName, newName string) *Result {
	return &Result{
		Files: []FileDiff{*CompareTexts(oldText, newText, oldName, newName)},
	}
}

// splitLines splits text into lines, handling different line endings.
func splitLines(text string) []string {
	if text == "" {
		return []string{}
	}
	// Normalize line endings
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	// Remove trailing empty line if text ends with newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// computeHunks computes the diff hunks between old and new line arrays.
// Uses a simple Myers-like algorithm for generating minimal edit script.
func computeHunks(oldLines, newLines []string) []Hunk {
	// Compute edit operations using LCS
	ops := computeEditOps(oldLines, newLines)

	if len(ops) == 0 {
		return []Hunk{}
	}

	// Convert all operations into lines
	var allLines []Line
	for _, op := range ops {
		switch op.typ {
		case "equal":
			allLines = append(allLines, Line{
				Type:    "context",
				Content: op.content,
				OldNum:  op.oldIdx + 1,
				NewNum:  op.newIdx + 1,
			})
		case "delete":
			allLines = append(allLines, Line{
				Type:    "delete",
				Content: op.content,
				OldNum:  op.oldIdx + 1,
			})
		case "insert":
			allLines = append(allLines, Line{
				Type:    "add",
				Content: op.content,
				NewNum:  op.newIdx + 1,
			})
		}
	}

	// Create a single hunk with all changes (simple approach)
	if len(allLines) == 0 {
		return []Hunk{}
	}

	// Find first/last old/new line numbers
	var oldStart, newStart int = 1, 1
	var oldCount, newCount int
	for _, line := range allLines {
		switch line.Type {
		case "context":
			oldCount++
			newCount++
			if oldStart == 1 && line.OldNum > 0 {
				oldStart = line.OldNum
			}
			if newStart == 1 && line.NewNum > 0 {
				newStart = line.NewNum
			}
		case "delete":
			oldCount++
			if oldStart == 1 && line.OldNum > 0 {
				oldStart = line.OldNum
			}
		case "add":
			newCount++
			if newStart == 1 && line.NewNum > 0 {
				newStart = line.NewNum
			}
		}
	}

	hunk := Hunk{
		OldStart: oldStart,
		OldLines: oldCount,
		NewStart: newStart,
		NewLines: newCount,
		Header:   fmt.Sprintf("@@ -%d,%d +%d,%d @@", oldStart, oldCount, newStart, newCount),
		Lines:    allLines,
	}

	return []Hunk{hunk}
}

type editOp struct {
	typ     string // "equal", "delete", "insert"
	content string
	oldIdx  int
	newIdx  int
}

// computeEditOps computes the edit operations to transform old to new.
// Uses a simple O(nm) algorithm suitable for moderate-sized files.
func computeEditOps(oldLines, newLines []string) []editOp {
	m, n := len(oldLines), len(newLines)

	// Handle trivial cases
	if m == 0 && n == 0 {
		return nil
	}
	if m == 0 {
		ops := make([]editOp, n)
		for i, line := range newLines {
			ops[i] = editOp{typ: "insert", content: line, newIdx: i}
		}
		return ops
	}
	if n == 0 {
		ops := make([]editOp, m)
		for i, line := range oldLines {
			ops[i] = editOp{typ: "delete", content: line, oldIdx: i}
		}
		return ops
	}

	// Compute LCS table
	lcs := make([][]int, m+1)
	for i := range lcs {
		lcs[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if oldLines[i-1] == newLines[j-1] {
				lcs[i][j] = lcs[i-1][j-1] + 1
			} else {
				lcs[i][j] = max(lcs[i-1][j], lcs[i][j-1])
			}
		}
	}

	// Backtrack to get edit operations
	var ops []editOp
	i, j := m, n
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && oldLines[i-1] == newLines[j-1] {
			ops = append(ops, editOp{
				typ:     "equal",
				content: oldLines[i-1],
				oldIdx:  i - 1,
				newIdx:  j - 1,
			})
			i--
			j--
		} else if j > 0 && (i == 0 || lcs[i][j-1] >= lcs[i-1][j]) {
			ops = append(ops, editOp{
				typ:     "insert",
				content: newLines[j-1],
				newIdx:  j - 1,
			})
			j--
		} else {
			ops = append(ops, editOp{
				typ:     "delete",
				content: oldLines[i-1],
				oldIdx:  i - 1,
			})
			i--
		}
	}

	// Reverse to get correct order
	for i, j := 0, len(ops)-1; i < j; i, j = i+1, j-1 {
		ops[i], ops[j] = ops[j], ops[i]
	}

	return ops
}
