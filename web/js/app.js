// diff-ashref-tn - Frontend Application
// Vanilla JS, no build step, no framework.

(function () {
  "use strict";

  // --- State ---
  let currentFiles = [];
  let viewMode = "split"; // "split" or "unified"
  let activeFile = null;
  let currentMode = null; // "text", "file", "folder"

  // --- Auth Token ---
  const authHeaders = { "X-Auth-Token": window.__TOKEN__ };

  // --- DOM References ---
  const landing = document.getElementById("landing");
  const textInputView = document.getElementById("text-input-view");
  const fileInputView = document.getElementById("file-input-view");
  const folderInputView = document.getElementById("folder-input-view");
  const diffView = document.getElementById("diff-view");
  const folderResultView = document.getElementById("folder-result-view");

  const btnSplit = document.getElementById("btn-split");
  const btnUnified = document.getElementById("btn-unified");
  const fileTreeContent = document.getElementById("file-tree-content");
  const diffContent = document.getElementById("diff-content");

  // --- View Management ---

  function showView(viewId) {
    const views = [landing, textInputView, fileInputView, folderInputView, diffView, folderResultView];
    for (const view of views) {
      view.hidden = view.id !== viewId;
    }
  }

  function goToLanding() {
    currentMode = null;
    showView("landing");
  }

  // --- Mode Card Click Handlers ---

  document.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      currentMode = mode;
      if (mode === "text") {
        showView("text-input-view");
        document.getElementById("text-left").value = "";
        document.getElementById("text-right").value = "";
        document.getElementById("text-left").focus();
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
  document.getElementById("diff-back").addEventListener("click", () => {
    if (currentMode === "text") showView("text-input-view");
    else if (currentMode === "file") showView("file-input-view");
    else if (currentMode === "folder") showView("folder-input-view");
    else goToLanding();
  });
  document.getElementById("folder-result-back").addEventListener("click", () => showView("folder-input-view"));

  // --- Text Compare ---

  document.getElementById("text-compare").addEventListener("click", async () => {
    const left = document.getElementById("text-left").value;
    const right = document.getElementById("text-right").value;

    if (!left && !right) {
      alert("Please enter some text to compare.");
      return;
    }

    try {
      const resp = await fetch("/api/compare-text", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ left, right, leftName: "Original", rightName: "Modified" })
      });

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      const data = await resp.json();
      currentFiles = data.files || [];
      document.getElementById("diff-title").textContent = "Text Comparison";
      showDiffResult();
    } catch (err) {
      alert("Error comparing text: " + err.message);
    }
  });

  // --- File Compare ---

  let leftFile = null;
  let rightFile = null;

  function resetFileInputs() {
    leftFile = null;
    rightFile = null;
    document.getElementById("file-left").value = "";
    document.getElementById("file-right").value = "";
    document.getElementById("file-left-name").textContent = "";
    document.getElementById("file-right-name").textContent = "";
    document.querySelectorAll(".file-drop-zone").forEach(z => z.classList.remove("dragover"));
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

    try {
      const formData = new FormData();
      formData.append("left", leftFile);
      formData.append("right", rightFile);

      const resp = await fetch("/api/compare-files", {
        method: "POST",
        headers: authHeaders,
        body: formData
      });

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      const data = await resp.json();
      currentFiles = data.files || [];
      document.getElementById("diff-title").textContent = `${leftFile.name} vs ${rightFile.name}`;
      showDiffResult();
    } catch (err) {
      alert("Error comparing files: " + err.message);
    }
  });

  // --- Folder Compare ---

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

  // --- Diff Result Display ---

  function showDiffResult() {
    showView("diff-view");
    renderFileTree(currentFiles);
    renderDiffContent(currentFiles);
  }

  // --- File Tree ---

  function buildFileTree(files) {
    const root = { name: "", children: new Map(), files: [] };

    for (const file of files) {
      const path =
        file.status === "deleted" ? file.oldName : file.newName || file.oldName;
      const parts = path.split("/");
      let current = root;

      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts[i];
        if (!current.children.has(dir)) {
          current.children.set(dir, { name: dir, children: new Map(), files: [] });
        }
        current = current.children.get(dir);
      }

      current.files.push({
        name: parts[parts.length - 1],
        path: path,
        status: file.status,
      });
    }

    return root;
  }

  function renderFileTree(files) {
    fileTreeContent.innerHTML = "";
    if (!files || files.length === 0) {
      fileTreeContent.innerHTML =
        '<div class="loading">No differences found</div>';
      return;
    }
    const tree = buildFileTree(files);
    const fragment = document.createDocumentFragment();
    renderTreeNode(tree, fragment, 0, true);
    fileTreeContent.appendChild(fragment);
  }

  function renderTreeNode(node, parent, depth, isRoot) {
    // Render folders sorted alphabetically
    const sortedChildren = Array.from(node.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    for (const [, child] of sortedChildren) {
      const folder = document.createElement("div");
      folder.className = "tree-folder";

      const label = document.createElement("div");
      label.className = "tree-folder-label";
      label.style.setProperty("--indent-pad", `${12 + depth * 16}px`);

      label.innerHTML = `
        <span class="arrow">&#9660;</span>
        <span class="folder-icon">&#128193;</span>
        <span class="folder-name">${escapeHtml(child.name)}</span>
      `;

      label.addEventListener("click", () => {
        folder.classList.toggle("collapsed");
      });

      folder.appendChild(label);

      const children = document.createElement("div");
      children.className = "tree-folder-children";
      renderTreeNode(child, children, depth + 1, false);
      folder.appendChild(children);

      parent.appendChild(folder);
    }

    // Render files sorted alphabetically
    const sortedFiles = [...node.files].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const file of sortedFiles) {
      const el = document.createElement("div");
      el.className = "tree-file";
      el.dataset.path = file.path;
      el.style.setProperty("--indent-pad", `${(isRoot ? 12 : 28) + depth * 16}px`);

      const statusChar = {
        added: "+",
        modified: "M",
        deleted: "\u2212",
        renamed: "R",
        unchanged: "=",
      }[file.status] || "?";

      el.innerHTML = `
        <span class="status-indicator ${file.status}">${statusChar}</span>
        <span class="file-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
      `;

      el.addEventListener("click", () => {
        scrollToFile(file.path);
        setActiveTreeFile(file.path);
      });

      parent.appendChild(el);
    }
  }

  function setActiveTreeFile(path) {
    activeFile = path;
    const allFiles = fileTreeContent.querySelectorAll(".tree-file");
    for (const f of allFiles) {
      f.classList.toggle("active", f.dataset.path === path);
    }
  }

  // --- Diff Content ---

  function renderDiffContent(files) {
    diffContent.innerHTML = "";
    if (!files || files.length === 0) {
      diffContent.innerHTML = '<div class="loading">No differences found - files are identical!</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const file of files) {
      fragment.appendChild(renderFileSection(file));
    }
    diffContent.appendChild(fragment);
    adjustSplitTableWidths();
  }

  function renderFileSection(file) {
    const section = document.createElement("div");
    section.className = "file-section";
    const path =
      file.status === "deleted" ? file.oldName : file.newName || file.oldName;
    section.id = `file-${cssId(path)}`;

    // Count additions and deletions
    let additions = 0;
    let deletions = 0;
    if (file.hunks) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.type === "add") additions++;
          if (line.type === "delete") deletions++;
        }
      }
    }

    // File header
    const header = document.createElement("div");
    header.className = "file-header";

    const displayPath =
      file.status === "renamed"
        ? `${file.oldName} \u2192 ${file.newName}`
        : path;

    let statsHtml = "";
    if (!file.isBinary) {
      const parts = [];
      if (additions > 0) parts.push(`<span class="additions">+${additions}</span>`);
      if (deletions > 0) parts.push(`<span class="deletions">&minus;${deletions}</span>`);
      if (parts.length > 0) {
        statsHtml = `<span class="change-stats">${parts.join(" ")}</span>`;
      }
    }

    header.innerHTML = `
      <span class="collapse-arrow">&#9660;</span>
      <span class="status-badge ${file.status}">${file.status}</span>
      <span class="file-path">${escapeHtml(displayPath)}</span>
      ${statsHtml}
    `;

    header.addEventListener("click", () => {
      section.classList.toggle("collapsed");
    });

    section.appendChild(header);

    // File body
    const body = document.createElement("div");
    body.className = "file-body";

    if (file.isBinary) {
      const binaryText = file.status === "unchanged" 
        ? "Binary files are identical"
        : "Binary files differ";
      body.innerHTML = `<div class="binary-notice">${binaryText}</div>`;
    } else if (file.status === "unchanged") {
      body.innerHTML = '<div class="binary-notice">Files are identical</div>';
    } else if (file.hunks && file.hunks.length > 0) {
      const table = document.createElement("table");
      table.className = `diff-table ${viewMode}`;

      if (viewMode === "split") {
        const colgroup = document.createElement("colgroup");
        colgroup.innerHTML = `
          <col style="width: 50px">
          <col style="width: calc(50% - 50px)">
          <col style="width: 1px">
          <col style="width: 50px">
          <col style="width: calc(50% - 50px)">
        `;
        table.appendChild(colgroup);
      }

      const tbody = document.createElement("tbody");
      for (const hunk of file.hunks) {
        if (viewMode === "split") {
          renderHunkSplit(hunk, tbody);
        } else {
          renderHunkUnified(hunk, tbody);
        }
      }
      table.appendChild(tbody);
      body.appendChild(table);
    }

    section.appendChild(body);
    return section;
  }

  // --- Hunk Rendering: Split View ---

  function renderHunkSplit(hunk, tbody) {
    // Hunk header row
    const headerRow = document.createElement("tr");
    headerRow.className = "hunk-header";
    const headerCell = document.createElement("td");
    headerCell.colSpan = 5;
    headerCell.textContent = hunk.header;
    headerRow.appendChild(headerCell);
    tbody.appendChild(headerRow);

    // Group lines into pairs for split view
    const lines = hunk.lines;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.type === "context") {
        // Context: show on both sides
        const tr = document.createElement("tr");
        tr.className = "line-context";
        tr.innerHTML = `
          <td class="line-num old-num">${line.oldNum || ""}</td>
          <td class="line-content old-content">${escapeHtml(line.content)}</td>
          <td class="split-divider"></td>
          <td class="line-num new-num">${line.newNum || ""}</td>
          <td class="line-content new-content">${escapeHtml(line.content)}</td>
        `;
        tbody.appendChild(tr);
        i++;
      } else if (line.type === "delete") {
        // Collect consecutive deletes
        const deletes = [];
        while (i < lines.length && lines[i].type === "delete") {
          deletes.push(lines[i]);
          i++;
        }
        // Collect consecutive adds after deletes
        const adds = [];
        while (i < lines.length && lines[i].type === "add") {
          adds.push(lines[i]);
          i++;
        }
        // Pair them side by side
        const maxLen = Math.max(deletes.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          const del = j < deletes.length ? deletes[j] : null;
          const add = j < adds.length ? adds[j] : null;
          const tr = document.createElement("tr");

          if (del && add) {
            // Modification: delete on left, add on right
            tr.innerHTML = `
              <td class="line-num old-num old-del">${del.oldNum || ""}</td>
              <td class="line-content old-content old-del">${escapeHtml(del.content)}</td>
              <td class="split-divider"></td>
              <td class="line-num new-num new-add">${add.newNum || ""}</td>
              <td class="line-content new-content new-add">${escapeHtml(add.content)}</td>
            `;
          } else if (del) {
            // Delete only
            tr.innerHTML = `
              <td class="line-num old-num old-del">${del.oldNum || ""}</td>
              <td class="line-content old-content old-del">${escapeHtml(del.content)}</td>
              <td class="split-divider"></td>
              <td class="line-num new-num empty-cell"></td>
              <td class="line-content new-content empty-cell"></td>
            `;
          } else {
            // Add only
            tr.innerHTML = `
              <td class="line-num old-num empty-cell"></td>
              <td class="line-content old-content empty-cell"></td>
              <td class="split-divider"></td>
              <td class="line-num new-num new-add">${add.newNum || ""}</td>
              <td class="line-content new-content new-add">${escapeHtml(add.content)}</td>
            `;
          }
          tbody.appendChild(tr);
        }
      } else if (line.type === "add") {
        // Standalone add (not preceded by delete)
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="line-num old-num empty-cell"></td>
          <td class="line-content old-content empty-cell"></td>
          <td class="split-divider"></td>
          <td class="line-num new-num new-add">${line.newNum || ""}</td>
          <td class="line-content new-content new-add">${escapeHtml(line.content)}</td>
        `;
        tbody.appendChild(tr);
        i++;
      } else {
        i++;
      }
    }
  }

  // --- Hunk Rendering: Unified View ---

  function renderHunkUnified(hunk, tbody) {
    // Hunk header row
    const headerRow = document.createElement("tr");
    headerRow.className = "hunk-header";
    const headerCell = document.createElement("td");
    headerCell.colSpan = 3;
    headerCell.textContent = hunk.header;
    headerRow.appendChild(headerCell);
    tbody.appendChild(headerRow);

    for (const line of hunk.lines) {
      const tr = document.createElement("tr");

      if (line.type === "context") {
        tr.className = "line-context";
        tr.innerHTML = `
          <td class="line-num">${line.oldNum || ""}</td>
          <td class="line-num">${line.newNum || ""}</td>
          <td class="line-content">${escapeHtml(line.content)}</td>
        `;
      } else if (line.type === "add") {
        tr.className = "line-add";
        tr.innerHTML = `
          <td class="line-num"></td>
          <td class="line-num">${line.newNum || ""}</td>
          <td class="line-content">${escapeHtml(line.content)}</td>
        `;
      } else if (line.type === "delete") {
        tr.className = "line-delete";
        tr.innerHTML = `
          <td class="line-num">${line.oldNum || ""}</td>
          <td class="line-num"></td>
          <td class="line-content">${escapeHtml(line.content)}</td>
        `;
      }

      tbody.appendChild(tr);
    }
  }

  // --- Interactions ---

  function toggleViewMode(mode) {
    if (mode === viewMode) return;
    viewMode = mode;

    btnSplit.classList.toggle("active", mode === "split");
    btnUnified.classList.toggle("active", mode === "unified");

    // Re-render diffs only (keep file tree as-is)
    renderDiffContent(currentFiles);
  }

  function scrollToFile(filename) {
    const id = `file-${cssId(filename)}`;
    const el = document.getElementById(id);
    if (el) {
      // Ensure the section is expanded
      el.classList.remove("collapsed");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // --- Helpers ---

  function adjustSplitTableWidths() {
    const tables = diffContent.querySelectorAll(".diff-table.split");
    for (const table of tables) {
      // Reset any previous adjustment
      table.style.minWidth = "";

      // Measure the widest content on each side using a temporary
      // off-screen element to get the natural (unwrapped) width.
      const probe = document.createElement("span");
      probe.style.cssText =
        "position:absolute;visibility:hidden;white-space:pre;" +
        "font-family:var(--font-mono);font-size:var(--font-size);padding:0 10px";
      document.body.appendChild(probe);

      let maxWidth = 0;
      const cells = table.querySelectorAll(".line-content");
      for (const cell of cells) {
        if (cell.classList.contains("empty-cell")) continue;
        probe.textContent = cell.textContent;
        if (probe.offsetWidth > maxWidth) {
          maxWidth = probe.offsetWidth;
        }
      }
      document.body.removeChild(probe);

      // Each side needs: lineNum (50px) + content (maxWidth)
      // Total: 2 * (50 + maxWidth) + 1px divider
      const needed = 2 * (50 + maxWidth) + 1;
      const container = table.closest(".file-body");
      if (container && needed > container.clientWidth) {
        table.style.minWidth = needed + "px";
      }
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cssId(path) {
    return path.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  // --- Event Listeners ---

  btnSplit.addEventListener("click", () => toggleViewMode("split"));
  btnUnified.addEventListener("click", () => toggleViewMode("unified"));

  // --- Init ---
  showView("landing");
})();
