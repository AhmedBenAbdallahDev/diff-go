package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/api/compare-dirs", handleCompareDirs)
	http.HandleFunc("/api/read-file", handleReadFile)

	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	log.Printf("diff-ashref-tn listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// ── Directory comparison ────────────────────────────────────

type FileEntry struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	IsDir  bool   `json:"isDir"`
	Status string `json:"status"`
}

func handleCompareDirs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		Left  string `json:"left"`
		Right string `json:"right"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Left == "" || req.Right == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "both left and right paths are required"})
		return
	}

	leftMap, err := readDir(req.Left)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": "left: " + err.Error()})
		return
	}
	rightMap, err := readDir(req.Right)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": "right: " + err.Error()})
		return
	}

	var files []FileEntry
	seen := map[string]bool{}

	for name, li := range leftMap {
		seen[name] = true
		if ri, ok := rightMap[name]; ok {
			status := "same"
			if li.Size() != ri.Size() || li.IsDir() != ri.IsDir() {
				status = "modified"
			}
			files = append(files, FileEntry{Name: name, Size: li.Size(), IsDir: li.IsDir(), Status: status})
		} else {
			files = append(files, FileEntry{Name: name, Size: li.Size(), IsDir: li.IsDir(), Status: "only-left"})
		}
	}
	for name, ri := range rightMap {
		if !seen[name] {
			files = append(files, FileEntry{Name: name, Size: ri.Size(), IsDir: ri.IsDir(), Status: "only-right"})
		}
	}

	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	json.NewEncoder(w).Encode(map[string]interface{}{"files": files})
}

func readDir(path string) (map[string]os.FileInfo, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	m := make(map[string]os.FileInfo)
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		m[e.Name()] = info
	}
	return m, nil
}

// ── File reading ────────────────────────────────────────────

func handleReadFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "path is required"})
		return
	}

	data, err := os.ReadFile(req.Path)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"content": string(data)})
}
