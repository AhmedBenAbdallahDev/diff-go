(() => {
  "use strict";

  const textLeft = document.getElementById("textLeft");
  const textRight = document.getElementById("textRight");
  const overlayLeft = document.getElementById("overlayLeft");
  const overlayRight = document.getElementById("overlayRight");
  const wrapLeft = document.getElementById("wrapLeft");
  const wrapRight = document.getElementById("wrapRight");
  const stats = document.getElementById("stats");
  const ignoreWS = document.getElementById("ignoreWS");

  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = 1;

  let rafId = null;

  // ══════════════════════════════════════════════════════════
  // INLINE DIFF HIGHLIGHTING
  // ══════════════════════════════════════════════════════════

  function escape(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function computeDiff() {
    let a = textLeft.value;
    let b = textRight.value;

    if (ignoreWS.checked) {
      a = a.trim().replace(/\s+/g, " ");
      b = b.trim().replace(/\s+/g, " ");
    }

    const diffs = dmp.diff_main(a, b);
    dmp.diff_cleanupSemantic(diffs);

    let leftHTML = "", rightHTML = "";
    let adds = 0, dels = 0, mods = 0;

    for (const [op, text] of diffs) {
      const safe = escape(text);
      if (op === -1) {
        // Deletion (only on left)
        dels += text.length;
        leftHTML += `<span class="del">${safe}</span>`;
      } else if (op === 1) {
        // Addition (only on right)
        adds += text.length;
        rightHTML += `<span class="add">${safe}</span>`;
      } else {
        // Equal
        leftHTML += safe;
        rightHTML += safe;
      }
    }

    overlayLeft.innerHTML = leftHTML;
    overlayRight.innerHTML = rightHTML;

    // Stats
    const total = a.length + b.length;
    const sim = total > 0 ? Math.round(((total - adds - dels) / total) * 100) : 100;
    stats.textContent = 
      adds === 0 && dels === 0 
        ? "✓ Identical" 
        : `${sim}% similar  ·  +${adds} chars  −${dels} chars`;
  }

  function scheduleDiff() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(computeDiff);
  }

  textLeft.addEventListener("input", scheduleDiff);
  textRight.addEventListener("input", scheduleDiff);
  textLeft.addEventListener("scroll", () => {
    overlayLeft.scrollTop = textLeft.scrollTop;
    overlayLeft.scrollLeft = textLeft.scrollLeft;
  });
  textRight.addEventListener("scroll", () => {
    overlayRight.scrollTop = textRight.scrollTop;
    overlayRight.scrollLeft = textRight.scrollLeft;
  });
  ignoreWS.addEventListener("change", scheduleDiff);

  // ══════════════════════════════════════════════════════════
  // FILE HANDLING
  // ══════════════════════════════════════════════════════════

  function readFile(file, textarea) {
    const reader = new FileReader();
    reader.onload = () => {
      textarea.value = reader.result;
      scheduleDiff();
    };
    reader.readAsText(file);
  }

  document.getElementById("fileLeft").addEventListener("change", e => {
    if (e.target.files[0]) readFile(e.target.files[0], textLeft);
  });

  document.getElementById("fileRight").addEventListener("change", e => {
    if (e.target.files[0]) readFile(e.target.files[0], textRight);
  });

  // Drag & drop
  [wrapLeft, wrapRight].forEach((wrap, idx) => {
    const ta = idx === 0 ? textLeft : textRight;
    wrap.addEventListener("dragover", e => { e.preventDefault(); wrap.style.opacity = "0.5"; });
    wrap.addEventListener("dragleave", () => { wrap.style.opacity = "1"; });
    wrap.addEventListener("drop", e => {
      e.preventDefault();
      wrap.style.opacity = "1";
      if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0], ta);
    });
  });

  // ══════════════════════════════════════════════════════════
  // TOOLBAR
  // ══════════════════════════════════════════════════════════

  document.getElementById("swapBtn").addEventListener("click", () => {
    const tmp = textLeft.value;
    textLeft.value = textRight.value;
    textRight.value = tmp;
    scheduleDiff();
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    textLeft.value = "";
    textRight.value = "";
    scheduleDiff();
  });

  // ══════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ══════════════════════════════════════════════════════════

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("swapBtn").click();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("clearBtn").click();
    }
  });

  // ══════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════

  stats.textContent = "Type or drop files to compare";
})();
