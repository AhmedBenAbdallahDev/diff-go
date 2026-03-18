// diff-ashref-tn - Frontend Application
// Vanilla JS, no build step, no framework.

(function () {
  "use strict";

  // --- Auth Token ---
  const authHeaders = { "X-Auth-Token": window.__TOKEN__ };

  // --- DOM References ---
  const landing = document.getElementById("landing");
  const textInputView = document.getElementById("text-input-view");
  const fileInputView = document.getElementById("file-input-view");
  const folderInputView = document.getElementById("folder-input-view");
  const diffView = document.getElementById("diff-view");
  const folderResultView = document.getElementById("folder-result-view");

  // Text diff elements
  const textLeft = document.getElementById("text-left");
  const textRight = document.getElementById("text-right");
  const diffLeftOverlay = document.getElementById("diff-left-overlay");
  const diffRightOverlay = document.getElementById("diff-right-overlay");
  const leftLineCount = document.getElementById("left-line-count");
  const rightLineCount = document.getElementById("right-line-count");
  const statAdditions = document.getElementById("stat-additions");
  const statDeletions = document.getElementById("stat-deletions");
  const statUnchanged = document.getElementById("stat-unchanged");

  // --- View Management ---

  function showView(viewId) {
    const views = [landing, textInputView, fileInputView, folderInputView, diffView, folderResultView];
    for (const view of views) {
      if (view) view.hidden = view.id !== viewId;
    }
  }

  function goToLanding() {
    showView("landing");
  }

  // --- Mode Card Click Handlers ---

  document.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      if (mode === "text") {
        showView("text-input-view");
        textLeft.value = "";
        textRight.value = "";
        updateDiff();
        textLeft.focus();
      } else if (mode === "file") {
        showView("file-input-view");
        resetFileInputs();
      } else if (mode === "folder") {
        showView("folder-input-view");
        document.getElementById("folder-left").value = "";
        document.getElementById("folder-right").value = "";
        document.getElementById("folder-left").focus();
      }
    });
  });

  // --- Back Buttons ---

  document.getElementById("text-back").addEventListener("click", goToLanding);
  document.getElementById("file-back").addEventListener("click", goToLanding);
  document.getElementById("folder-back").addEventListener("click", goToLanding);

  // Clear button
  document.getElementById("text-clear").addEventListener("click", () => {
    textLeft.value = "";
    textRight.value = "";
    updateDiff();
  });

  // ========================================
  // REAL-TIME DIFF ENGINE
  // ========================================

  function splitLines(text) {
    if (!text) return [];
    return text.split('\n');
  }

  // Simple LCS-based diff
  function computeDiff(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;

    // Build LCS table
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find diff
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        result.unshift({ type: 'same', oldIdx: i - 1, newIdx: j - 1, text: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'add', newIdx: j - 1, text: newLines[j - 1] });
        j--;
      } else {
        result.unshift({ type: 'del', oldIdx: i - 1, text: oldLines[i - 1] });
        i--;
      }
    }

    return result;
  }

  // Character-level diff for modified lines
  function charDiff(oldStr, newStr) {
    const oldChars = oldStr.split('');
    const newChars = newStr.split('');
    const m = oldChars.length;
    const n = newChars.length;

    // Build LCS table
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldChars[i - 1] === newChars[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack
    const oldResult = [];
    const newResult = [];
    let i = m, j = n;
    
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldChars[i - 1] === newChars[j - 1]) {
        oldResult.unshift({ char: oldChars[i - 1], type: 'same' });
        newResult.unshift({ char: newChars[j - 1], type: 'same' });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        newResult.unshift({ char: newChars[j - 1], type: 'add' });
        j--;
      } else {
        oldResult.unshift({ char: oldChars[i - 1], type: 'del' });
        i--;
      }
    }

    return { oldResult, newResult };
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCharDiff(charDiffResult, type) {
    let html = '';
    for (const item of charDiffResult) {
      const escaped = escapeHtml(item.char);
      if (item.type === 'same') {
        html += escaped;
      } else if (item.type === type) {
        html += `<span class="char-${type}">${escaped}</span>`;
      }
    }
    return html;
  }

  function updateDiff() {
    const leftText = textLeft.value;
    const rightText = textRight.value;

    const leftLines = splitLines(leftText);
    const rightLines = splitLines(rightText);

    // Update line counts
    leftLineCount.textContent = `${leftLines.length} line${leftLines.length !== 1 ? 's' : ''}`;
    rightLineCount.textContent = `${rightLines.length} line${rightLines.length !== 1 ? 's' : ''}`;

    // Compute diff
    const diff = computeDiff(leftLines, rightLines);

    // Build overlay HTML for both sides
    let leftHtml = '';
    let rightHtml = '';
    let additions = 0;
    let deletions = 0;
    let unchanged = 0;

    // Group consecutive del/add for inline comparison
    let i = 0;
    while (i < diff.length) {
      const item = diff[i];

      if (item.type === 'same') {
        leftHtml += `<span class="line line-same">${escapeHtml(item.text)}\n</span>`;
        rightHtml += `<span class="line line-same">${escapeHtml(item.text)}\n</span>`;
        unchanged++;
        i++;
      } else if (item.type === 'del') {
        // Collect consecutive deletions
        const dels = [];
        while (i < diff.length && diff[i].type === 'del') {
          dels.push(diff[i]);
          i++;
        }
        // Collect consecutive additions
        const adds = [];
        while (i < diff.length && diff[i].type === 'add') {
          adds.push(diff[i]);
          i++;
        }

        // Pair them for character-level diff
        const maxLen = Math.max(dels.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          const del = dels[j];
          const add = adds[j];

          if (del && add) {
            // Both exist - do character diff
            const { oldResult, newResult } = charDiff(del.text, add.text);
            leftHtml += `<span class="line line-del">${renderCharDiff(oldResult, 'del')}\n</span>`;
            rightHtml += `<span class="line line-add">${renderCharDiff(newResult, 'add')}\n</span>`;
            deletions++;
            additions++;
          } else if (del) {
            // Only deletion
            leftHtml += `<span class="line line-del">${escapeHtml(del.text)}\n</span>`;
            rightHtml += `<span class="line line-same">\n</span>`;
            deletions++;
          } else if (add) {
            // Only addition
            leftHtml += `<span class="line line-same">\n</span>`;
            rightHtml += `<span class="line line-add">${escapeHtml(add.text)}\n</span>`;
            additions++;
          }
        }
      } else if (item.type === 'add') {
        // Standalone add (not preceded by del)
        leftHtml += `<span class="line line-same">\n</span>`;
        rightHtml += `<span class="line line-add">${escapeHtml(item.text)}\n</span>`;
        additions++;
        i++;
      }
    }

    // Update overlays
    diffLeftOverlay.innerHTML = leftHtml;
    diffRightOverlay.innerHTML = rightHtml;

    // Update stats
    statAdditions.textContent = `+${additions}`;
    statDeletions.textContent = `−${deletions}`;
    statUnchanged.textContent = `${unchanged} unchanged`;

    // Sync scroll
    syncScroll();
  }

  // Sync scroll between textareas and overlays
  function syncScroll() {
    const syncLeft = () => {
      diffLeftOverlay.scrollTop = textLeft.scrollTop;
      diffLeftOverlay.scrollLeft = textLeft.scrollLeft;
    };
    const syncRight = () => {
      diffRightOverlay.scrollTop = textRight.scrollTop;
      diffRightOverlay.scrollLeft = textRight.scrollLeft;
    };
    
    textLeft.addEventListener('scroll', syncLeft);
    textRight.addEventListener('scroll', syncRight);
  }

  // Debounce for performance
  let diffTimeout = null;
  function debouncedUpdateDiff() {
    if (diffTimeout) clearTimeout(diffTimeout);
    diffTimeout = setTimeout(updateDiff, 50);
  }

  // Listen for input
  textLeft.addEventListener('input', debouncedUpdateDiff);
  textRight.addEventListener('input', debouncedUpdateDiff);

  // Initial sync scroll setup
  syncScroll();

  // ========================================
  // FILE COMPARE
  // ========================================

  let leftFile = null;
  let rightFile = null;

  function resetFileInputs() {
    leftFile = null;
    rightFile = null;
    document.getElementById("file-left").value = "";
    document.getElementById("file-right").value = "";
    document.getElementById("file-left-name").textContent = "";
    document.getElementById("file-right-name").textContent = "";
  }

  function setupDropZone(dropId, inputId, nameId, setFile) {
    const drop = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    const name = document.getElementById(nameId);

    drop.addEventListener("click", () => input.click());

    drop.addEventListener("dragover", e => {
      e.preventDefault();
      drop.classList.add("dragover");
    });

    drop.addEventListener("dragleave", () => {
      drop.classList.remove("dragover");
    });

    drop.addEventListener("drop", e => {
      e.preventDefault();
      drop.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        setFile(file);
        name.textContent = file.name;
      }
    });

    input.addEventListener("change", () => {
      if (input.files.length > 0) {
        const file = input.files[0];
        setFile(file);
        name.textContent = file.name;
      }
    });
  }

  setupDropZone("drop-left", "file-left", "file-left-name", f => { leftFile = f; });
  setupDropZone("drop-right", "file-right", "file-right-name", f => { rightFile = f; });

  document.getElementById("file-compare").addEventListener("click", async () => {
    if (!leftFile || !rightFile) {
      alert("Please select both files to compare.");
      return;
    }

    // Read files and show in text compare view
    const leftText = await leftFile.text();
    const rightText = await rightFile.text();

    textLeft.value = leftText;
    textRight.value = rightText;
    showView("text-input-view");
    updateDiff();
  });

  // ========================================
  // FOLDER COMPARE
  // ========================================

  document.getElementById("folder-compare").addEventListener("click", async () => {
    const leftPath = document.getElementById("folder-left").value.trim();
    const rightPath = document.getElementById("folder-right").value.trim();

    if (!leftPath || !rightPath) {
      alert("Please enter both folder paths.");
      return;
    }

    try {
      const resp = await fetch("/api/compare-folders", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ leftPath, rightPath })
      });

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      const data = await resp.json();
      showFolderResult(data);
    } catch (err) {
      alert("Error comparing folders: " + err.message);
    }
  });

  document.getElementById("folder-result-back").addEventListener("click", () => {
    showView("folder-input-view");
  });

  function showFolderResult(data) {
    const stats = document.getElementById("folder-stats");
    stats.textContent = `${data.sameCount} same, ${data.diffCount} different, ${data.onlyLeft} only left, ${data.onlyRight} only right`;

    const tbody = document.getElementById("folder-result-body");
    tbody.innerHTML = "";

    for (const entry of data.entries) {
      const tr = document.createElement("tr");

      const statusLabels = {
        same: "✓ Same",
        different: "≠ Different",
        only_left: "← Left only",
        only_right: "→ Right only"
      };

      tr.innerHTML = `
        <td class="status-${entry.status}">${statusLabels[entry.status] || entry.status}</td>
        <td class="name-cell">${escapeHtml(entry.name)}</td>
        <td class="type-cell">${entry.isDir ? "📁 Folder" : "📄 File"}</td>
        <td class="size-cell">${entry.isDir ? "-" : formatSize(entry.size)}</td>
      `;

      tbody.appendChild(tr);
    }

    showView("folder-result-view");
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ========================================
  // INIT
  // ========================================

  showView("landing");
})();
