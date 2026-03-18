// diff-ashref-tn - Simple Real-time Diff
(function() {
  "use strict";

  // === DOM Elements ===
  const textLeft = document.getElementById("text-left");
  const textRight = document.getElementById("text-right");
  const overlayLeft = document.getElementById("overlay-left");
  const overlayRight = document.getElementById("overlay-right");
  const lineNumsLeft = document.getElementById("left-line-nums");
  const lineNumsRight = document.getElementById("right-line-nums");
  const leftStats = document.getElementById("left-stats");
  const rightStats = document.getElementById("right-stats");
  const statAdd = document.getElementById("stat-add");
  const statDel = document.getElementById("stat-del");
  const statSame = document.getElementById("stat-same");
  const inputBar = document.getElementById("input-bar");
  const fileInputs = document.getElementById("file-inputs");
  const folderInputs = document.getElementById("folder-inputs");
  const diffMain = document.querySelector(".diff-main");
  const folderModal = document.getElementById("folder-modal");

  // === Mode Switching ===
  let currentMode = "text";

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      currentMode = mode;

      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (mode === "text") {
        inputBar.hidden = true;
        fileInputs.hidden = true;
        folderInputs.hidden = true;
        diffMain.classList.remove("with-input-bar");
      } else if (mode === "file") {
        inputBar.hidden = false;
        fileInputs.hidden = false;
        folderInputs.hidden = true;
        diffMain.classList.add("with-input-bar");
      } else if (mode === "folder") {
        inputBar.hidden = false;
        fileInputs.hidden = true;
        folderInputs.hidden = false;
        diffMain.classList.add("with-input-bar");
      }
    });
  });

  // === Clear Button ===
  document.getElementById("btn-clear").addEventListener("click", () => {
    textLeft.value = "";
    textRight.value = "";
    updateDiff();
  });

  // === Swap Button ===
  document.getElementById("btn-swap").addEventListener("click", () => {
    const tmp = textLeft.value;
    textLeft.value = textRight.value;
    textRight.value = tmp;
    updateDiff();
  });

  // === File Loading ===
  document.getElementById("btn-load-files").addEventListener("click", async () => {
    const fileL = document.getElementById("file-left").files[0];
    const fileR = document.getElementById("file-right").files[0];
    
    if (!fileL || !fileR) {
      alert("Please select both files");
      return;
    }

    try {
      textLeft.value = await fileL.text();
      textRight.value = await fileR.text();
      updateDiff();
    } catch (e) {
      alert("Error reading files: " + e.message);
    }
  });

  document.getElementById("file-left").addEventListener("change", function() {
    document.getElementById("file-left-name").textContent = this.files[0]?.name || "No file";
  });
  document.getElementById("file-right").addEventListener("change", function() {
    document.getElementById("file-right-name").textContent = this.files[0]?.name || "No file";
  });

  // === Folder Comparison ===
  let leftFolderData = null;
  let rightFolderData = null;
  let folderCompareResult = null;

  document.getElementById("folder-left").addEventListener("change", function() {
    leftFolderData = processFolder(this.files);
    document.getElementById("folder-left-name").textContent = leftFolderData.name || "No folder";
  });

  document.getElementById("folder-right").addEventListener("change", function() {
    rightFolderData = processFolder(this.files);
    document.getElementById("folder-right-name").textContent = rightFolderData.name || "No folder";
  });

  function processFolder(fileList) {
    if (!fileList || fileList.length === 0) return null;
    
    const files = Array.from(fileList);
    const rootPath = files[0].webkitRelativePath.split("/")[0];
    
    const entries = new Map();
    
    for (const file of files) {
      const parts = file.webkitRelativePath.split("/");
      if (parts.length < 2) continue;
      
      // Get immediate children only (1 level deep)
      const childName = parts[1];
      if (!childName) continue;
      
      if (!entries.has(childName)) {
        const isDir = parts.length > 2;
        entries.set(childName, {
          name: childName,
          isDir: isDir,
          size: isDir ? 0 : file.size,
          files: isDir ? [] : [file]
        });
      } else if (parts.length > 2) {
        // It's inside a subdirectory, mark as dir
        entries.get(childName).isDir = true;
        entries.get(childName).files.push(file);
      } else {
        // Direct file, accumulate
        entries.get(childName).files.push(file);
        entries.get(childName).size += file.size;
      }
    }

    return {
      name: rootPath,
      entries: entries
    };
  }

  document.getElementById("btn-compare-folders").addEventListener("click", async () => {
    if (!leftFolderData || !rightFolderData) {
      alert("Please select both folders");
      return;
    }

    folderCompareResult = await compareFolders(leftFolderData, rightFolderData);
    showFolderResults();
  });

  async function hashFile(file) {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return null;
    }
  }

  async function compareFolders(left, right) {
    const allNames = new Set([...left.entries.keys(), ...right.entries.keys()]);
    const sortedNames = Array.from(allNames).sort();

    const entries = [];
    let sameCount = 0, diffCount = 0, onlyLeft = 0, onlyRight = 0;

    for (const name of sortedNames) {
      const leftEntry = left.entries.get(name);
      const rightEntry = right.entries.get(name);

      const entry = { name };

      if (leftEntry && rightEntry) {
        entry.isDir = leftEntry.isDir || rightEntry.isDir;
        entry.leftSize = leftEntry.size;
        entry.rightSize = rightEntry.size;

        if (leftEntry.isDir !== rightEntry.isDir) {
          entry.status = "different";
          diffCount++;
        } else if (leftEntry.isDir) {
          // Both dirs - compare file counts (simplified)
          entry.status = leftEntry.files.length === rightEntry.files.length ? "same" : "different";
          if (entry.status === "same") sameCount++; else diffCount++;
        } else {
          // Both files - compare by hash
          const leftHash = await hashFile(leftEntry.files[0]);
          const rightHash = await hashFile(rightEntry.files[0]);
          entry.status = leftHash === rightHash ? "same" : "different";
          if (entry.status === "same") sameCount++; else diffCount++;
        }
      } else if (leftEntry) {
        entry.isDir = leftEntry.isDir;
        entry.leftSize = leftEntry.size;
        entry.status = "only_left";
        onlyLeft++;
      } else {
        entry.isDir = rightEntry.isDir;
        entry.rightSize = rightEntry.size;
        entry.status = "only_right";
        onlyRight++;
      }

      entries.push(entry);
    }

    return {
      leftName: left.name,
      rightName: right.name,
      entries,
      sameCount,
      diffCount,
      onlyLeft,
      onlyRight
    };
  }

  function showFolderResults() {
    if (!folderCompareResult) return;

    const { leftName, rightName, entries, sameCount, diffCount, onlyLeft, onlyRight } = folderCompareResult;

    // Update headers
    document.getElementById("left-folder-header").textContent = leftName;
    document.getElementById("right-folder-header").textContent = rightName;

    // Update stats
    document.getElementById("modal-stats").innerHTML = `
      <span class="stat-same">✓ ${sameCount} same</span>
      <span class="stat-diff">≠ ${diffCount} different</span>
      <span class="stat-left">← ${onlyLeft} left only</span>
      <span class="stat-right">→ ${onlyRight} right only</span>
    `;

    // Get filter values
    const nameFilter = document.getElementById("folder-filter").value.toLowerCase();
    const statusFilter = document.getElementById("folder-status-filter").value;

    // Filter entries
    const filtered = entries.filter(e => {
      if (nameFilter && !e.name.toLowerCase().includes(nameFilter)) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      return true;
    });

    // Render trees
    const leftTree = document.getElementById("left-folder-tree");
    const rightTree = document.getElementById("right-folder-tree");
    
    leftTree.innerHTML = "";
    rightTree.innerHTML = "";

    for (const entry of filtered) {
      const leftEl = createEntryEl(entry, "left");
      const rightEl = createEntryEl(entry, "right");
      leftTree.appendChild(leftEl);
      rightTree.appendChild(rightEl);
    }

    folderModal.classList.add("visible");
  }

  function createEntryEl(entry, side) {
    const div = document.createElement("div");
    div.className = `folder-entry status-${entry.status}`;

    const isMissing = (side === "left" && entry.status === "only_right") ||
                      (side === "right" && entry.status === "only_left");

    if (isMissing) {
      div.classList.add("status-missing");
    }

    const icon = entry.isDir ? "📁" : "📄";
    const size = isMissing ? "-" : formatSize(side === "left" ? entry.leftSize : entry.rightSize);
    
    let badge = "";
    if (entry.status === "same") badge = `<span class="status-badge same">✓</span>`;
    else if (entry.status === "different") badge = `<span class="status-badge different">≠</span>`;
    else if (isMissing) badge = `<span class="status-badge only">—</span>`;

    div.innerHTML = `
      <span class="icon">${icon}</span>
      <span class="name">${escapeHtml(entry.name)}</span>
      <span class="size">${size}</span>
      ${badge}
    `;

    return div;
  }

  // Filter handlers
  document.getElementById("folder-filter").addEventListener("input", showFolderResults);
  document.getElementById("folder-status-filter").addEventListener("change", showFolderResults);

  document.getElementById("modal-close").addEventListener("click", () => {
    folderModal.classList.remove("visible");
  });

  folderModal.addEventListener("click", (e) => {
    if (e.target === folderModal) {
      folderModal.classList.remove("visible");
    }
  });

  // === Real-time Diff Engine ===

  function computeDiff(oldLines, newLines) {
    const m = oldLines.length, n = newLines.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = oldLines[i-1] === newLines[j-1] 
          ? dp[i-1][j-1] + 1 
          : Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }

    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
        result.unshift({ type: "same", oldIdx: i-1, newIdx: j-1, text: oldLines[i-1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        result.unshift({ type: "add", newIdx: j-1, text: newLines[j-1] });
        j--;
      } else {
        result.unshift({ type: "del", oldIdx: i-1, text: oldLines[i-1] });
        i--;
      }
    }
    return result;
  }

  function charDiff(oldStr, newStr) {
    const m = oldStr.length, n = newStr.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = oldStr[i-1] === newStr[j-1] 
          ? dp[i-1][j-1] + 1 
          : Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }

    const oldRes = [], newRes = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldStr[i-1] === newStr[j-1]) {
        oldRes.unshift({ c: oldStr[i-1], t: "same" });
        newRes.unshift({ c: newStr[j-1], t: "same" });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        newRes.unshift({ c: newStr[j-1], t: "add" });
        j--;
      } else {
        oldRes.unshift({ c: oldStr[i-1], t: "del" });
        i--;
      }
    }
    return { oldRes, newRes };
  }

  function renderChars(chars, type) {
    let html = "";
    for (const ch of chars) {
      const esc = escapeHtml(ch.c);
      html += ch.t === type ? `<span class="char-${type}">${esc}</span>` : esc;
    }
    return html;
  }

  function updateDiff() {
    const leftText = textLeft.value;
    const rightText = textRight.value;
    const leftLines = leftText ? leftText.split("\n") : [];
    const rightLines = rightText ? rightText.split("\n") : [];

    leftStats.textContent = `${leftLines.length} line${leftLines.length !== 1 ? "s" : ""}`;
    rightStats.textContent = `${rightLines.length} line${rightLines.length !== 1 ? "s" : ""}`;

    lineNumsLeft.innerHTML = leftLines.map((_, i) => `<div>${i + 1}</div>`).join("");
    lineNumsRight.innerHTML = rightLines.map((_, i) => `<div>${i + 1}</div>`).join("");

    const diff = computeDiff(leftLines, rightLines);

    let leftHtml = "", rightHtml = "";
    let adds = 0, dels = 0, same = 0;

    let idx = 0;
    while (idx < diff.length) {
      const item = diff[idx];

      if (item.type === "same") {
        leftHtml += `<span class="line">${escapeHtml(item.text)}\n</span>`;
        rightHtml += `<span class="line">${escapeHtml(item.text)}\n</span>`;
        same++;
        idx++;
      } else if (item.type === "del") {
        const delItems = [];
        while (idx < diff.length && diff[idx].type === "del") {
          delItems.push(diff[idx++]);
        }
        const addItems = [];
        while (idx < diff.length && diff[idx].type === "add") {
          addItems.push(diff[idx++]);
        }

        const maxLen = Math.max(delItems.length, addItems.length);
        for (let k = 0; k < maxLen; k++) {
          const del = delItems[k];
          const add = addItems[k];

          if (del && add) {
            const { oldRes, newRes } = charDiff(del.text, add.text);
            leftHtml += `<span class="line line-del">${renderChars(oldRes, "del")}\n</span>`;
            rightHtml += `<span class="line line-add">${renderChars(newRes, "add")}\n</span>`;
            dels++; adds++;
          } else if (del) {
            leftHtml += `<span class="line line-del">${escapeHtml(del.text)}\n</span>`;
            rightHtml += `<span class="line">\n</span>`;
            dels++;
          } else if (add) {
            leftHtml += `<span class="line">\n</span>`;
            rightHtml += `<span class="line line-add">${escapeHtml(add.text)}\n</span>`;
            adds++;
          }
        }
      } else if (item.type === "add") {
        leftHtml += `<span class="line">\n</span>`;
        rightHtml += `<span class="line line-add">${escapeHtml(item.text)}\n</span>`;
        adds++;
        idx++;
      }
    }

    overlayLeft.innerHTML = leftHtml;
    overlayRight.innerHTML = rightHtml;

    statAdd.textContent = `+${adds} added`;
    statDel.textContent = `−${dels} removed`;
    statSame.textContent = `${same} unchanged`;
  }

  // === Scroll Sync ===
  function syncScroll(source, targets) {
    source.addEventListener("scroll", () => {
      for (const t of targets) {
        t.scrollTop = source.scrollTop;
        t.scrollLeft = source.scrollLeft;
      }
    });
  }

  syncScroll(textLeft, [overlayLeft, lineNumsLeft]);
  syncScroll(textRight, [overlayRight, lineNumsRight]);

  // === Helpers ===
  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatSize(bytes) {
    if (bytes == null || isNaN(bytes)) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  // === Input Events ===
  let timeout;
  function onInput() {
    clearTimeout(timeout);
    timeout = setTimeout(updateDiff, 30);
  }

  textLeft.addEventListener("input", onInput);
  textRight.addEventListener("input", onInput);

  // Initial render
  updateDiff();
})();
