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

  const authHeaders = { "X-Auth-Token": window.__TOKEN__ };

  // === Mode Switching ===
  let currentMode = "text";

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      currentMode = mode;

      // Update button states
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Show/hide input bar
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

  // Update file names on selection
  document.getElementById("file-left").addEventListener("change", function() {
    document.getElementById("file-left-name").textContent = this.files[0]?.name || "No file";
  });
  document.getElementById("file-right").addEventListener("change", function() {
    document.getElementById("file-right-name").textContent = this.files[0]?.name || "No file";
  });

  // === Folder Comparison ===
  document.getElementById("btn-compare-folders").addEventListener("click", async () => {
    const leftPath = document.getElementById("folder-left").value.trim();
    const rightPath = document.getElementById("folder-right").value.trim();

    if (!leftPath || !rightPath) {
      alert("Please enter both folder paths");
      return;
    }

    try {
      const resp = await fetch("/api/compare-folders", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ leftPath, rightPath })
      });

      if (!resp.ok) throw new Error(await resp.text());

      const data = await resp.json();
      showFolderResults(data);
    } catch (e) {
      alert("Error: " + e.message);
    }
  });

  function showFolderResults(data) {
    document.getElementById("modal-stats").textContent = 
      `${data.sameCount} same, ${data.diffCount} different, ${data.onlyLeft} only left, ${data.onlyRight} only right`;

    const tbody = document.getElementById("folder-results");
    tbody.innerHTML = "";

    const labels = {
      same: "✓ Same",
      different: "≠ Different", 
      only_left: "← Left only",
      only_right: "→ Right only"
    };

    for (const entry of data.entries) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="status-${entry.status}">${labels[entry.status] || entry.status}</td>
        <td>${escapeHtml(entry.name)}</td>
        <td>${entry.isDir ? "📁 Folder" : "📄 File"}</td>
        <td>${entry.isDir ? "-" : formatSize(entry.size)}</td>
      `;
      tbody.appendChild(tr);
    }

    folderModal.classList.add("visible");
  }

  document.getElementById("modal-close").addEventListener("click", () => {
    folderModal.classList.remove("visible");
  });

  // Close modal on outside click
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

    // Update line counts
    leftStats.textContent = `${leftLines.length} line${leftLines.length !== 1 ? "s" : ""}`;
    rightStats.textContent = `${rightLines.length} line${rightLines.length !== 1 ? "s" : ""}`;

    // Update line numbers
    lineNumsLeft.innerHTML = leftLines.map((_, i) => `<div>${i + 1}</div>`).join("");
    lineNumsRight.innerHTML = rightLines.map((_, i) => `<div>${i + 1}</div>`).join("");

    // Compute diff
    const diff = computeDiff(leftLines, rightLines);

    let leftHtml = "", rightHtml = "";
    let adds = 0, dels = 0, same = 0;

    let i = 0;
    while (i < diff.length) {
      const item = diff[i];

      if (item.type === "same") {
        leftHtml += `<span class="line">${escapeHtml(item.text)}\n</span>`;
        rightHtml += `<span class="line">${escapeHtml(item.text)}\n</span>`;
        same++;
        i++;
      } else if (item.type === "del") {
        // Collect consecutive dels then adds
        const delItems = [];
        while (i < diff.length && diff[i].type === "del") {
          delItems.push(diff[i++]);
        }
        const addItems = [];
        while (i < diff.length && diff[i].type === "add") {
          addItems.push(diff[i++]);
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
        i++;
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
