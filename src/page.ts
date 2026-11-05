export function boardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Project brain</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1c1915;
      --muted: #5e584f;
      --line: #ddd6c8;
      --paper: #f6f3ec;
      --card: #fffdf8;
      --accent: #0f6e56;
      --accent-ink: #e7f6f1;
      --warn: #8a4b08;
      --warn-bg: #f8ecd9;
      --change: #0f6e56;
      --proposal: #8a4b08;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 16px/1.45 "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--paper);
    }
    header, main { width: min(1100px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 28px 0 8px; }
    h1 { font-family: Georgia, serif; font-size: 34px; font-weight: 600; margin: 0 0 6px; }
    h2 { font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 10px; color: var(--muted); }
    p { margin: 0; }
    .sub { color: var(--muted); max-width: 62ch; }
    .layout { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; padding: 18px 0 48px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
    .stack { display: grid; gap: 14px; }
    label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
    textarea, input, select, button { font: inherit; color: inherit; }
    textarea, input[type="text"], select {
      width: 100%;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 10px;
      padding: 10px 12px;
    }
    textarea { min-height: 96px; resize: vertical; }
    button {
      border: 0;
      background: var(--accent);
      color: var(--accent-ink);
      border-radius: 999px;
      padding: 9px 14px;
      cursor: pointer;
    }
    button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .writer { display: flex; gap: 8px; flex-wrap: wrap; }
    .writer button { background: #fff; color: var(--ink); border: 1px solid var(--line); }
    .writer button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
    .banner { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: 10px 12px; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #f3efe6;
      border-radius: 10px;
      padding: 12px;
      margin: 0;
      max-height: 420px;
      overflow: auto;
      font: 13px/1.45 ui-monospace, Consolas, monospace;
    }
    .item { border-top: 1px solid var(--line); padding: 10px 0; }
    .item:first-child { border-top: 0; }
    .meta { color: var(--muted); font-size: 13px; }
    .badge { font-size: 12px; border-radius: 999px; padding: 2px 8px; background: var(--warn-bg); color: var(--proposal); }
    .badge.change { background: var(--accent-ink); color: var(--change); }
    .error { color: #8d1d1d; }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1 id="title">Project brain</h1>
    <p class="sub">One project state for Cursor, Claude, ChatGPT, and Grok. You choose who is allowed to write code.</p>
  </header>
  <main class="layout">
    <section class="stack">
      <article class="card">
        <h2>Who writes code</h2>
        <div id="writer-banner" class="banner" hidden></div>
        <div class="writer" id="writers" style="margin-top: 12px"></div>
      </article>
      <article class="card">
        <h2>Goal</h2>
        <textarea id="goal"></textarea>
        <div class="row" style="margin-top: 8px"><button id="save-goal" type="button">Save goal</button></div>
      </article>
      <article class="card">
        <h2>Current task</h2>
        <textarea id="now"></textarea>
        <div class="row" style="margin-top: 8px"><button id="save-now" type="button">Save task</button></div>
      </article>
      <article class="card">
        <h2>Ask a model</h2>
        <p class="sub">The model receives the shared brief. It writes files only if you assigned code writing to it. Otherwise the answer is saved as a proposal.</p>
        <label for="ask-model" style="margin-top: 12px">Model</label>
        <select id="ask-model">
          <option value="claude">Claude</option>
          <option value="gpt">ChatGPT</option>
          <option value="grok">Grok</option>
        </select>
        <label for="ask-task" style="margin-top: 10px">Task</label>
        <textarea id="ask-task" placeholder="What should this model do with the shared context?"></textarea>
        <div class="row" style="margin-top: 8px"><button id="ask" type="button">Send with shared context</button></div>
        <p class="meta" style="margin-top: 8px">Uses the model's own sign-in. Sign in from the desktop app first.</p>
        <p id="ask-error" class="error"></p>
        <pre id="ask-result" hidden></pre>
      </article>
    </section>
    <section class="stack">
      <article class="card">
        <div class="row" style="justify-content: space-between">
          <h2>Brief every model sees</h2>
          <button id="copy" class="ghost" type="button">Copy pack</button>
        </div>
        <pre id="brief"></pre>
      </article>
      <article class="card">
        <h2>Decisions</h2>
        <div id="decisions"></div>
        <label for="decision" style="margin-top: 8px">Add a decision</label>
        <input id="decision" type="text" placeholder="We will keep auth in the API, not the page." />
        <div class="row" style="margin-top: 8px"><button id="save-decision" type="button">Record decision</button></div>
      </article>
      <article class="card">
        <h2>Handoffs</h2>
        <div id="handoffs"></div>
      </article>
    </section>
  </main>
  <script>
    const writers = [
      ["", "Not chosen"],
      ["me", "I write it"],
      ["cursor", "Cursor"],
      ["claude", "Claude"],
      ["gpt", "ChatGPT"],
      ["grok", "Grok"]
    ];
    const $ = (id) => document.getElementById(id);
    let pack = "";

    function badge(kind) {
      return '<span class="badge' + (kind === "change" ? " change" : "") + '">' + kind + "</span>";
    }

    async function refresh() {
      const state = await fetch("/api/state").then((res) => res.json());
      $("title").textContent = state.name || "Project brain";
      $("goal").value = state.goal;
      $("now").value = state.now;
      $("brief").textContent = state.brief;
      pack = state.pack;
      const chosen = state.codeWriter || "";
      $("writer-banner").hidden = Boolean(chosen);
      $("writer-banner").textContent = "Pick who writes code. Until you do, every model is told not to edit files.";
      $("writers").innerHTML = writers.map(([id, label]) =>
        '<button type="button" data-writer="' + id + '" aria-pressed="' + (id === chosen) + '">' + label + "</button>"
      ).join("");
      $("decisions").innerHTML = state.decisions.length
        ? state.decisions.map((item) =>
            '<div class="item"><div class="meta">' + escapeHtml(item.model) + " · " + item.at.slice(0, 16) + "</div><div>" + escapeHtml(item.decision) + "</div></div>"
          ).join("")
        : '<p class="meta">No decisions yet.</p>';
      $("handoffs").innerHTML = state.handoffs.length
        ? state.handoffs.map((item) =>
            '<div class="item"><div class="meta">' + escapeHtml(item.model) + " · " + item.at.slice(0, 16) + " " + badge(item.kind) + "</div><div>" + escapeHtml(item.did) + "</div></div>"
          ).join("")
        : '<p class="meta">No handoffs yet.</p>';
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    }

    $("writers").addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      await post("/api/writer", { writer: button.dataset.writer || null });
      await refresh();
    });
    $("save-goal").onclick = async () => { await post("/api/goal", { text: $("goal").value }); await refresh(); };
    $("save-now").onclick = async () => { await post("/api/now", { text: $("now").value }); await refresh(); };
    $("save-decision").onclick = async () => {
      await post("/api/decision", { decision: $("decision").value, model: "user" });
      $("decision").value = "";
      await refresh();
    };
    $("copy").onclick = async () => {
      await navigator.clipboard.writeText(pack);
      $("copy").textContent = "Copied";
      setTimeout(() => { $("copy").textContent = "Copy pack"; }, 1200);
    };
    $("ask").onclick = async () => {
      $("ask-error").textContent = "";
      $("ask-result").hidden = true;
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: $("ask-model").value, task: $("ask-task").value })
      });
      const body = await response.json();
      if (!response.ok) {
        $("ask-error").textContent = body.error || "The request failed.";
        return;
      }
      $("ask-result").hidden = false;
      $("ask-result").textContent = body.answer;
      await refresh();
    };

    async function post(url, body) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Save failed");
      }
    }

    refresh();
  </script>
</body>
</html>`;
}
