(() => {
  const leftTA  = document.getElementById("left");
  const rightTA = document.getElementById("right");
  const diffOut = document.getElementById("diffOutput");
  const diffStats = document.getElementById("diffStats");
  const clearBtn  = document.getElementById("clearBtn");
  const swapBtn   = document.getElementById("swapBtn");
  const divider   = document.getElementById("divider");
  const paneLeft  = document.getElementById("paneLeft");
  const paneRight = document.getElementById("paneRight");

  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = 2;

  // ── Real-time diff ──────────────────────────────────────────
  let rafId = null;

  function scheduleDiff() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(runDiff);
  }

  function escape(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function runDiff() {
    const a = leftTA.value;
    const b = rightTA.value;

    if (!a && !b) {
      diffOut.innerHTML = "";
      diffOut.classList.add("empty");
      diffStats.textContent = "";
      return;
    }

    diffOut.classList.remove("empty");

    const diffs = dmp.diff_main(a, b);
    dmp.diff_cleanupSemantic(diffs);

    let insCount = 0, delCount = 0, html = "";

    for (const [op, text] of diffs) {
      const safe = escape(text).replace(/\n/g, "<br>");
      if (op === diff_match_patch.DIFF_INSERT) {
        insCount += text.length;
        html += `<span class="diff-ins">${safe}</span>`;
      } else if (op === diff_match_patch.DIFF_DELETE) {
        delCount += text.length;
        html += `<span class="diff-del">${safe}</span>`;
      } else {
        html += `<span class="diff-eq">${safe}</span>`;
      }
    }

    diffOut.innerHTML = html;
    diffStats.textContent =
      insCount === 0 && delCount === 0
        ? "✓ No differences"
        : `+${insCount} added  −${delCount} removed`;
  }

  leftTA.addEventListener("input", scheduleDiff);
  rightTA.addEventListener("input", scheduleDiff);

  // ── Clear ───────────────────────────────────────────────────
  clearBtn.addEventListener("click", () => {
    leftTA.value = "";
    rightTA.value = "";
    diffOut.innerHTML = "";
    diffStats.textContent = "";
    diffOut.classList.add("empty");
    leftTA.focus();
  });

  // ── Swap ────────────────────────────────────────────────────
  swapBtn.addEventListener("click", () => {
    const tmp = leftTA.value;
    leftTA.value = rightTA.value;
    rightTA.value = tmp;
    scheduleDiff();
  });

  // ── Copy buttons ────────────────────────────────────────────
  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const ta = btn.dataset.target === "left" ? leftTA : rightTA;
      navigator.clipboard.writeText(ta.value).then(() => {
        const orig = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => (btn.textContent = orig), 1200);
      });
    });
  });

  // ── Draggable divider ────────────────────────────────────────
  let dragging = false, startX = 0, startLeftW = 0;
  const main = document.querySelector("main");

  divider.addEventListener("mousedown", e => {
    dragging = true;
    startX = e.clientX;
    startLeftW = paneLeft.getBoundingClientRect().width;
    divider.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const totalW = main.getBoundingClientRect().width - divider.offsetWidth;
    const newLeftW = Math.max(100, Math.min(totalW - 100, startLeftW + delta));
    const pct = (newLeftW / totalW) * 100;
    paneLeft.style.flex  = `0 0 ${pct}%`;
    paneRight.style.flex = `0 0 ${100 - pct}%`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
    divider.classList.remove("dragging");
  });

  // ── Initial state ────────────────────────────────────────────
  diffOut.classList.add("empty");
  diffStats.textContent = "";
})();
