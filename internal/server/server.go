// Package server provides the HTTP server for the diff viewer frontend and API.
package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"strings"
	"sync"

	"github.com/AhmedBenAbdallahDev/diff-ashref-tn/internal/cli"
	"github.com/AhmedBenAbdallahDev/diff-ashref-tn/internal/diff"
	"github.com/AhmedBenAbdallahDev/diff-ashref-tn/internal/folder"
	"github.com/AhmedBenAbdallahDev/diff-ashref-tn/internal/git"
)

// Server is the HTTP server that serves the frontend and API endpoints.
type Server struct {
	config    *cli.Config
	repo      *git.Repo
	mux       *http.ServeMux
	stdinDiff *diff.Result
	assets    fs.FS
	token     string

	indexOnce sync.Once
	indexHTML []byte
}

// New creates a new server. If stdinDiff is non-nil, the server is in stdin mode.
func New(config *cli.Config, repo *git.Repo, stdinDiff *diff.Result, assets fs.FS) *Server {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}

	s := &Server{
		config:    config,
		repo:      repo,
		mux:       http.NewServeMux(),
		stdinDiff: stdinDiff,
		assets:    assets,
		token:     hex.EncodeToString(b),
	}
	s.routes()
	return s
}

// Handler returns the http.Handler (useful for testing).
func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/diff", s.requireToken(s.handleDiff))
	s.mux.HandleFunc("GET /api/commits", s.requireToken(s.handleCommits))
	s.mux.HandleFunc("POST /api/compare-text", s.requireToken(s.handleCompareText))
	s.mux.HandleFunc("POST /api/compare-files", s.requireToken(s.handleCompareFiles))
	s.mux.HandleFunc("POST /api/compare-folders", s.requireToken(s.handleCompareFolders))
	s.mux.HandleFunc("GET /{$}", s.handleIndex)
	s.mux.Handle("GET /", http.FileServerFS(s.assets))
}

// requireToken returns middleware that checks the X-Auth-Token header on API routes.
func (s *Server) requireToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Auth-Token")), []byte(s.token)) != 1 {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

// handleIndex serves index.html with the auth token injected.
func (s *Server) handleIndex(w http.ResponseWriter, _ *http.Request) {
	s.indexOnce.Do(func() {
		raw, err := fs.ReadFile(s.assets, "index.html")
		if err != nil {
			// Will serve an error on every request; acceptable since this is fatal.
			return
		}
		s.indexHTML = []byte(strings.Replace(
			string(raw),
			"{{TOKEN}}",
			s.token,
			1,
		))
	})
	if s.indexHTML == nil {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(s.indexHTML)
}

func (s *Server) handleDiff(w http.ResponseWriter, r *http.Request) {
	// In stdin mode, always return the pre-parsed diff
	if s.stdinDiff != nil {
		writeJSON(w, s.stdinDiff)
		return
	}

	// Determine which base ref to use
	base := r.URL.Query().Get("base")
	if base == "" {
		base = s.config.Base
	}

	// Determine which target ref to use
	target := r.URL.Query().Get("target")
	if target == "" {
		target = s.config.Target
	}

	// Get the diff from git
	rawDiff, err := s.repo.GetDiff(base, target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	result, err := diff.Parse(rawDiff)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, result)
}

func (s *Server) handleCommits(w http.ResponseWriter, _ *http.Request) {
	// In stdin mode, return empty array
	if s.stdinDiff != nil {
		writeJSON(w, []git.Commit{})
		return
	}

	commits, err := s.repo.GetCommits(50)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if commits == nil {
		commits = []git.Commit{}
	}

	writeJSON(w, commits)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// --- New API Handlers for Web Mode ---

// CompareTextRequest is the JSON body for text comparison.
type CompareTextRequest struct {
	Left     string `json:"left"`
	Right    string `json:"right"`
	LeftName  string `json:"leftName"`
	RightName string `json:"rightName"`
}

func (s *Server) handleCompareText(w http.ResponseWriter, r *http.Request) {
	var req CompareTextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Default names if not provided
	leftName := req.LeftName
	if leftName == "" {
		leftName = "left"
	}
	rightName := req.RightName
	if rightName == "" {
		rightName = "right"
	}

	result := diff.CompareTextsAsResult(req.Left, req.Right, leftName, rightName)
	writeJSON(w, result)
}

func (s *Server) handleCompareFiles(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (max 32MB)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	leftFile, leftHeader, err := r.FormFile("left")
	if err != nil {
		http.Error(w, "Missing left file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer leftFile.Close()

	rightFile, rightHeader, err := r.FormFile("right")
	if err != nil {
		http.Error(w, "Missing right file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer rightFile.Close()

	// Read file contents
	leftContent, err := io.ReadAll(leftFile)
	if err != nil {
		http.Error(w, "Failed to read left file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	rightContent, err := io.ReadAll(rightFile)
	if err != nil {
		http.Error(w, "Failed to read right file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Check if binary (contains null bytes)
	leftBinary := isBinary(leftContent)
	rightBinary := isBinary(rightContent)

	if leftBinary || rightBinary {
		// Binary comparison - just check if they're identical
		result := &diff.Result{
			Files: []diff.FileDiff{{
				OldName:  leftHeader.Filename,
				NewName:  rightHeader.Filename,
				IsBinary: true,
				Status:   binaryStatus(leftContent, rightContent),
			}},
		}
		writeJSON(w, result)
		return
	}

	// Text comparison
	result := diff.CompareTextsAsResult(
		string(leftContent),
		string(rightContent),
		leftHeader.Filename,
		rightHeader.Filename,
	)
	writeJSON(w, result)
}

func isBinary(data []byte) bool {
	// Check first 8000 bytes for null characters
	checkLen := len(data)
	if checkLen > 8000 {
		checkLen = 8000
	}
	for i := 0; i < checkLen; i++ {
		if data[i] == 0 {
			return true
		}
	}
	return false
}

func binaryStatus(left, right []byte) string {
	if len(left) == len(right) {
		same := true
		for i := range left {
			if left[i] != right[i] {
				same = false
				break
			}
		}
		if same {
			return "unchanged"
		}
	}
	return "modified"
}

// CompareFoldersRequest is the JSON body for folder comparison.
type CompareFoldersRequest struct {
	LeftPath  string `json:"leftPath"`
	RightPath string `json:"rightPath"`
}

func (s *Server) handleCompareFolders(w http.ResponseWriter, r *http.Request) {
	var req CompareFoldersRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.LeftPath == "" || req.RightPath == "" {
		http.Error(w, "Both leftPath and rightPath are required", http.StatusBadRequest)
		return
	}

	result, err := folder.CompareFolders(req.LeftPath, req.RightPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	writeJSON(w, result)
}
