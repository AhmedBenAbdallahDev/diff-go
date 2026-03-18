// Package folder provides directory comparison functionality.
package folder

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
)

// Entry represents a file or subdirectory in a folder.
type Entry struct {
	Name      string `json:"name"`
	IsDir     bool   `json:"isDir"`
	Size      int64  `json:"size"`
	Hash      string `json:"hash,omitempty"` // SHA256 hash for files
	Status    string `json:"status"`         // "same", "different", "only_left", "only_right"
	LeftPath  string `json:"leftPath,omitempty"`
	RightPath string `json:"rightPath,omitempty"`
}

// CompareResult contains the result of comparing two folders.
type CompareResult struct {
	LeftPath   string  `json:"leftPath"`
	RightPath  string  `json:"rightPath"`
	Entries    []Entry `json:"entries"`
	TotalLeft  int     `json:"totalLeft"`
	TotalRight int     `json:"totalRight"`
	SameCount  int     `json:"sameCount"`
	DiffCount  int     `json:"diffCount"`
	OnlyLeft   int     `json:"onlyLeft"`
	OnlyRight  int     `json:"onlyRight"`
}

// CompareFolders compares two directories at one level deep.
// It only compares immediate children, not recursing into subdirectories.
func CompareFolders(leftPath, rightPath string) (*CompareResult, error) {
	// Validate paths
	leftInfo, err := os.Stat(leftPath)
	if err != nil {
		return nil, fmt.Errorf("cannot access left path: %w", err)
	}
	if !leftInfo.IsDir() {
		return nil, fmt.Errorf("left path is not a directory: %s", leftPath)
	}

	rightInfo, err := os.Stat(rightPath)
	if err != nil {
		return nil, fmt.Errorf("cannot access right path: %w", err)
	}
	if !rightInfo.IsDir() {
		return nil, fmt.Errorf("right path is not a directory: %s", rightPath)
	}

	// Read directory contents
	leftEntries, err := readDir(leftPath)
	if err != nil {
		return nil, fmt.Errorf("error reading left directory: %w", err)
	}

	rightEntries, err := readDir(rightPath)
	if err != nil {
		return nil, fmt.Errorf("error reading right directory: %w", err)
	}

	// Create maps for easy lookup
	leftMap := make(map[string]dirEntry)
	for _, e := range leftEntries {
		leftMap[e.name] = e
	}

	rightMap := make(map[string]dirEntry)
	for _, e := range rightEntries {
		rightMap[e.name] = e
	}

	// Collect all unique names
	allNames := make(map[string]bool)
	for name := range leftMap {
		allNames[name] = true
	}
	for name := range rightMap {
		allNames[name] = true
	}

	// Sort names
	sortedNames := make([]string, 0, len(allNames))
	for name := range allNames {
		sortedNames = append(sortedNames, name)
	}
	sort.Strings(sortedNames)

	// Compare entries
	result := &CompareResult{
		LeftPath:   leftPath,
		RightPath:  rightPath,
		TotalLeft:  len(leftEntries),
		TotalRight: len(rightEntries),
	}

	for _, name := range sortedNames {
		leftEntry, inLeft := leftMap[name]
		rightEntry, inRight := rightMap[name]

		entry := Entry{Name: name}

		if inLeft && inRight {
			// Entry exists in both
			entry.IsDir = leftEntry.isDir && rightEntry.isDir
			entry.Size = leftEntry.size
			entry.LeftPath = filepath.Join(leftPath, name)
			entry.RightPath = filepath.Join(rightPath, name)

			if leftEntry.isDir != rightEntry.isDir {
				// One is file, other is directory
				entry.Status = "different"
				result.DiffCount++
			} else if leftEntry.isDir {
				// Both are directories, consider them "same" (we don't recurse)
				entry.Status = "same"
				result.SameCount++
			} else {
				// Both are files, compare content
				entry.Hash = leftEntry.hash
				if leftEntry.hash == rightEntry.hash {
					entry.Status = "same"
					result.SameCount++
				} else {
					entry.Status = "different"
					result.DiffCount++
				}
			}
		} else if inLeft {
			// Only in left
			entry.IsDir = leftEntry.isDir
			entry.Size = leftEntry.size
			entry.Hash = leftEntry.hash
			entry.Status = "only_left"
			entry.LeftPath = filepath.Join(leftPath, name)
			result.OnlyLeft++
		} else {
			// Only in right
			entry.IsDir = rightEntry.isDir
			entry.Size = rightEntry.size
			entry.Hash = rightEntry.hash
			entry.Status = "only_right"
			entry.RightPath = filepath.Join(rightPath, name)
			result.OnlyRight++
		}

		result.Entries = append(result.Entries, entry)
	}

	return result, nil
}

type dirEntry struct {
	name  string
	isDir bool
	size  int64
	hash  string
}

func readDir(path string) ([]dirEntry, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	result := make([]dirEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue // Skip entries we can't stat
		}

		entry := dirEntry{
			name:  e.Name(),
			isDir: e.IsDir(),
			size:  info.Size(),
		}

		// Hash files (not directories)
		if !e.IsDir() {
			hash, err := hashFile(filepath.Join(path, e.Name()))
			if err == nil {
				entry.hash = hash
			}
		}

		result = append(result, entry)
	}

	return result, nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}
