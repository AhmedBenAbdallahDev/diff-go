(() => {
  "use strict";

  // ── DOM refs ──────────────────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const welcome    = $("#welcome");
  const app        = $("#app");
  const textLeft   = $("#textLeft");
  const textRight  = $("#textRight");
  const diffStats  = $("#diffStats");
  const diffContent= $("#diffContent");
  const editorView = $("#editorView");
  const folderView = $("#folderView");
  const diffPanel  = $("#diffPanel");
  const gutter     = $("#gutter");
  const panelLeft  = $("#panelLeft");
  const panelRight = $("#panelRight");

  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = 5;

  let currentMode = "text";
  let viewMode    = "split";
  let rafId       = null;

  // ════════════════════════════════════════════════════════════
  // WELCOME SCREEN
  // ════════════════════════════════════════════════════════════

  function dismissWelcome(mode) {
    currentMode = mode || "text";
    welcome.style.opacity = "0";
    welcome.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      welcome.classList.add("hidden");
      app.classList.remove("hidden");
      setMode(currentMode);
    }, 300);
  }

  $$(".wcard").forEach(btn => {
    btn.addEventListener("click", () => dismissWelcome(btn.dataset.mode));
  });

  // ════════════════════════════════════════════════════════════
  // MODE SWITCHING
  // ════════════════════════════════════════════════════════════

  function setMode(mode) {
    currentMode = mode;
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === mode));

    if (mode === "folder") {
      editorView.classList.add("hidden");
      folderView.classList.remove("hidden");
      diffPanel.classList.add("hidden");
    } else {
      editorView.classList.remove("hidden");
      folderView.classList.add("hidden");
      diffPanel.classList.remove("hidden");
      scheduleDiff();
    }
  }

  $$(".tab").forEach(t => {
    t.addEventListener("click", () => setMode(t.dataset.mode));
  });

  // Logo goes back to welcome
  $("#logoBtn").addEventListener("click", () => {
    app.classList.add("hidden");
    welcome.classList.remove("hidden");
    welcome.style.opacity = "1";
  });

  // ════════════════════════════════════════════════════════════
  // LINE-BY-LINE DIFF ENGINE
  // ════════════════════════════════════════════════════════════

  function escape(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function splitLines(text) {
    if (!text) return [];
    const lines = text.split("\n");
    // Remove trailing empty string from final newline
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function computeLineDiff(textA, textB) {
    const ignoreWS = $("#ignoreWS").checked;
    let a = textA, b = textB;
    if (ignoreWS) {
      a = a.replace(/[ \t]+$/gm, "").replace(/^[ \t]+/gm, "");
      b = b.replace(/[ \t]+$/gm, "").replace(/^[ \t]+/gm, "");
    }

    // Use diff-match-patch line mode
    const tmp = dmp.diff_linesToChars_(a, b);
    const diffs = dmp.diff_main(tmp.chars1, tmp.chars2, false);
    dmp.diff_charsToLines_(diffs, tmp.lineArray);

    // Build aligned line pairs
    const left = [], right = [];
    let lNum = 1, rNum = 1;

    for (let i = 0; i < diffs.length; i++) {
      const [op, text] = diffs[i];
      const lines = splitLines(text);
      if (lines.length === 0) continue;

      if (op === 0) {
        for (const ln of lines) {
          left.push({ num: lNum++, text: ln, type: "equal" });
          right.push({ num: rNum++, text: ln, type: "equal" });
        }
      } else if (op === -1) {
        // Check if next is insert → paired modification
        if (i + 1 < diffs.length && diffs[i + 1][0] === 1) {
          const delLines = lines;
          const insLines = splitLines(diffs[i + 1][1]);
          const max = Math.max(delLines.length, insLines.length);

          for (let j = 0; j < max; j++) {
            if (j < delLines.length && j < insLines.length) {
              const charDiff = dmp.diff_main(delLines[j], insLines[j]);
              dmp.diff_cleanupSemantic(charDiff);
              left.push({ num: lNum++, text: delLines[j], type: "mod-del", changes: charDiff });
              right.push({ num: rNum++, text: insLines[j], type: "mod-add", changes: charDiff });
            } else if (j < delLines.length) {
              left.push({ num: lNum++, text: delLines[j], type: "del" });
              right.push({ num: null, text: "", type: "pad" });
            } else {
              left.push({ num: null, text: "", type: "pad" });
              right.push({ num: rNum++, text: insLines[j], type: "add" });
            }
          }
          i++; // skip the insert
        } else {
          for (const ln of lines) {
            left.push({ num: lNum++, text: ln, type: "del" });
            right.push({ num: null, text: "", type: "pad" });
          }
        }
      } else {
        for (const ln of lines) {
          left.push({ num: null, text: "", type: "pad" });
          right.push({ num: rNum++, text: ln, type: "add" });
        }
      }
    }

    return { left, right };
  }

  // Render inline character highlights for modified lines
  function renderInlineLeft(changes) {
    let html = "";
    for (const [op, text] of changes) {
      const safe = escape(text);
      if (op === -1) html += `<span class="hl-del">${safe}</span>`;
      else if (op === 0) html += safe;
      // skip inserts for left side
    }
    return html;
  }

  function renderInlineRight(changes) {
    let html = "";
    for (const [op, text] of changes) {
      const safe = escape(text);
      if (op === 1) html += `<span class="hl-add">${safe}</span>`;
      else if (op === 0) html += safe;
    }
    return html;
  }

  function lineClass(type) {
    const map = {
      equal: "line-equal", del: "line-del", add: "line-add",
      "mod-del": "line-mod-del", "mod-add": "line-mod-add", pad: "line-pad"
    };
    return map[type] || "";
  }

  function signChar(type) {
    if (type === "del" || type === "mod-del") return "−";
    if (type === "add" || type === "mod-add") return "+";
    if (type === "equal") return " ";
    return "";
  }

  // ════════════════════════════════════════════════════════════
  // RENDER DIFF
  // ════════════════════════════════════════════════════════════

  function renderSplitDiff(result) {
    const { left, right } = result;
    let lHtml = "", rHtml = "";

    for (let i = 0; i < left.length; i++) {
      const l = left[i], r = right[i];

      // Left side
      const lCode = l.changes ? renderInlineLeft(l.changes) : escape(l.text);
      lHtml += `<tr class="${lineClass(l.type)}">` +
        `<td class="ln">${l.num ?? ""}</td>` +
        `<td class="sign">${signChar(l.type)}</td>` +
        `<td class="code">${lCode}</td></tr>`;

      // Right side
      const rCode = r.changes ? renderInlineRight(r.changes) : escape(r.text);
      rHtml += `<tr class="${lineClass(r.type)}">` +
        `<td class="ln">${r.num ?? ""}</td>` +
        `<td class="sign">${signChar(r.type)}</td>` +
        `<td class="code">${rCode}</td></tr>`;
    }

    return `<div class="diff-split">` +
      `<div class="diff-side"><table>${lHtml}</table></div>` +
      `<div class="diff-side"><table>${rHtml}</table></div>` +
      `</div>`;
  }

  function renderUnifiedDiff(result) {
    const { left, right } = result;
    let html = "";

    for (let i = 0; i < left.length; i++) {
      const l = left[i], r = right[i];

      if (l.type === "equal") {
        html += `<tr class="line-equal">` +
          `<td class="ln">${l.num ?? ""}</td>` +
          `<td class="ln">${r.num ?? ""}</td>` +
          `<td class="sign"> </td>` +
          `<td class="code">${escape(l.text)}</td></tr>`;
      } else {
        // Show deletion then insertion
        if (l.type !== "pad") {
          const code = l.changes ? renderInlineLeft(l.changes) : escape(l.text);
          html += `<tr class="${lineClass(l.type)}">` +
            `<td class="ln">${l.num ?? ""}</td>` +
            `<td class="ln"></td>` +
            `<td class="sign">−</td>` +
            `<td class="code">${code}</td></tr>`;
        }
        if (r.type !== "pad") {
          const code = r.changes ? renderInlineRight(r.changes) : escape(r.text);
          html += `<tr class="${lineClass(r.type)}">` +
            `<td class="ln"></td>` +
            `<td class="ln">${r.num ?? ""}</td>` +
            `<td class="sign">+</td>` +
            `<td class="code">${code}</td></tr>`;
        }
      }
    }

    return `<div class="diff-unified"><table>${html}</table></div>`;
  }

  // ════════════════════════════════════════════════════════════
  // REAL-TIME DIFF
  // ════════════════════════════════════════════════════════════

  function scheduleDiff() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(runDiff);
  }

  function runDiff() {
    const a = textLeft.value;
    const b = textRight.value;

    if (!a && !b) {
      diffContent.innerHTML = `<div class="empty-msg">Start typing or drop files to see the diff</div>`;
      diffStats.textContent = "";
      return;
    }

    if (a === b) {
      diffContent.innerHTML = `<div class="empty-msg">✓ Files are identical</div>`;
      diffStats.textContent = "✓ 100% identical";
      return;
    }

    const result = computeLineDiff(a, b);

    // Stats
    let adds = 0, dels = 0, mods = 0, equals = 0;
    for (const l of result.left) {
      if (l.type === "del" || l.type === "mod-del") dels++;
      if (l.type === "equal") equals++;
      if (l.type === "mod-del") mods++;
    }
    for (const r of result.right) {
      if (r.type === "add" || r.type === "mod-add") adds++;
    }
    const total = equals + dels + adds - mods;
    const similarity = total > 0 ? Math.round((equals / total) * 100) : 0;

    diffStats.textContent = `${similarity}% similar  ·  +${adds} added  −${dels} removed  ·  ${result.left.length} lines`;

    // Render
    diffContent.innerHTML = viewMode === "split"
      ? renderSplitDiff(result)
      : renderUnifiedDiff(result);
  }

  textLeft.addEventListener("input", scheduleDiff);
  textRight.addEventListener("input", scheduleDiff);

  // ════════════════════════════════════════════════════════════
  // VIEW MODE TOGGLE (Split / Unified)
  // ════════════════════════════════════════════════════════════

  $$(".dtgl").forEach(btn => {
    btn.addEventListener("click", () => {
      viewMode = btn.dataset.view;
      $$(".dtgl").forEach(b => b.classList.toggle("active", b === btn));
      scheduleDiff();
    });
  });

  // ════════════════════════════════════════════════════════════
  // TOOLBAR: Swap, Clear, Copy, Ignore WS
  // ════════════════════════════════════════════════════════════

  $("#swapBtn").addEventListener("click", () => {
    const tmp = textLeft.value;
    textLeft.value = textRight.value;
    textRight.value = tmp;
    scheduleDiff();
  });

  $("#clearBtn").addEventListener("click", () => {
    textLeft.value = "";
    textRight.value = "";
    scheduleDiff();
    textLeft.focus();
  });

  $$(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const ta = btn.dataset.side === "left" ? textLeft : textRight;
      navigator.clipboard.writeText(ta.value).then(() => {
        const orig = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => (btn.textContent = orig), 1000);
      });
    });
  });

  $("#ignoreWS").addEventListener("change", scheduleDiff);

  // ════════════════════════════════════════════════════════════
  // FILE HANDLING (Drag & Drop + File Picker)
  // ════════════════════════════════════════════════════════════

  function readFileToTextarea(file, textarea) {
    const reader = new FileReader();
    reader.onload = () => {
      textarea.value = reader.result;
      scheduleDiff();
    };
    reader.readAsText(file);
  }

  // File pickers
  $("#fileLeft").addEventListener("change", (e) => {
    if (e.target.files[0]) readFileToTextarea(e.target.files[0], textLeft);
  });

  $("#fileRight").addEventListener("change", (e) => {
    if (e.target.files[0]) readFileToTextarea(e.target.files[0], textRight);
  });

  // Drag & drop
  function setupDropZone(zoneId, textarea) {
    const zone = document.getElementById(zoneId);

    zone.addEventListener("dragenter", (e) => { e.preventDefault(); zone.classList.add("dragging"); });
    zone.addEventListener("dragover",  (e) => { e.preventDefault(); zone.classList.add("dragging"); });
    zone.addEventListener("dragleave", ()  => { zone.classList.remove("dragging"); });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragging");
      if (e.dataTransfer.files.length > 0) {
        readFileToTextarea(e.dataTransfer.files[0], textarea);
        // If on welcome, dismiss it
        if (!welcome.classList.contains("hidden")) dismissWelcome("file");
      }
    });
  }

  setupDropZone("dropLeft", textLeft);
  setupDropZone("dropRight", textRight);

  // ════════════════════════════════════════════════════════════
  // DRAGGABLE GUTTER
  // ════════════════════════════════════════════════════════════

  let dragging = false, startX = 0, startLeftW = 0;

  gutter.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startLeftW = panelLeft.getBoundingClientRect().width;
    gutter.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const totalW = editorView.getBoundingClientRect().width - gutter.offsetWidth;
    const newW = Math.max(100, Math.min(totalW - 100, startLeftW + (e.clientX - startX)));
    const pct = (newW / totalW) * 100;
    panelLeft.style.flex = `0 0 ${pct}%`;
    panelRight.style.flex = `0 0 ${100 - pct}%`;
  });

  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; gutter.classList.remove("dragging"); }
  });

  // ════════════════════════════════════════════════════════════
  // FOLDER COMPARISON
  // ════════════════════════════════════════════════════════════

  $("#compareFoldersBtn").addEventListener("click", async () => {
    const left  = $("#folderLeft").value.trim();
    const right = $("#folderRight").value.trim();
    const out   = $("#folderResults");

    if (!left || !right) {
      out.innerHTML = `<div class="folder-error">Please enter both folder paths.</div>`;
      return;
    }

    out.innerHTML = `<div class="empty-msg">Comparing…</div>`;

    try {
      const res = await fetch("/api/compare-dirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left, right })
      });
      const data = await res.json();

      if (data.error) {
        out.innerHTML = `<div class="folder-error">Error: ${escape(data.error)}</div>`;
        return;
      }

      const files = data.files || [];
      if (files.length === 0) {
        out.innerHTML = `<div class="empty-msg">Both folders are empty or identical.</div>`;
        return;
      }

      let rows = "";
      for (const f of files) {
        const cls = f.status;
        const icon = f.isDir ? "📁" : "📄";
        const size = f.isDir ? "—" : formatSize(f.size);
        const label = { "only-left": "Only Left", "only-right": "Only Right", modified: "Modified", same: "Same" }[f.status];
        rows += `<tr class="${cls}">` +
          `<td>${icon} ${escape(f.name)}</td>` +
          `<td>${size}</td>` +
          `<td><span class="status-badge">${label}</span></td></tr>`;
      }

      out.innerHTML = `<table><thead><tr><th>Name</th><th>Size</th><th>Status</th></tr></thead>` +
        `<tbody>${rows}</tbody></table>`;
    } catch (err) {
      out.innerHTML = `<div class="folder-error">Request failed: ${err.message}</div>`;
    }
  });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  // ════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ════════════════════════════════════════════════════════════

  document.addEventListener("keydown", (e) => {
    // On welcome screen: any key dismisses
    if (!welcome.classList.contains("hidden") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key.length === 1 || e.key === "Enter" || e.key === " ") {
        dismissWelcome("text");
        return;
      }
    }

    // Ctrl+1/2/3 switch modes
    if ((e.ctrlKey || e.metaKey) && ["1", "2", "3"].includes(e.key)) {
      e.preventDefault();
      if (welcome.classList.contains("hidden") === false) dismissWelcome("text");
      const modes = { "1": "text", "2": "file", "3": "folder" };
      setMode(modes[e.key]);
    }

    // Ctrl+Shift+S → swap
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      $("#swapBtn").click();
    }

    // Ctrl+Shift+X → clear
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "x") {
      e.preventDefault();
      $("#clearBtn").click();
    }
  });

  // ════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════

  diffContent.innerHTML = `<div class="empty-msg">Start typing or drop files to see the diff</div>`;
})();
