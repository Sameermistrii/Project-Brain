const writers = [
  ["", "None"],
  ["me", "You"],
  ["cursor", "Cursor"],
  ["claude", "Claude"],
  ["gpt", "GPT"],
  ["grok", "Grok"],
];
const modes = [
  ["work", "Work"],
  ["debate", "Debate"],
];
const about = {
  cursor: "Reads this folder. Writes the code when you assign it.",
  claude: "Reads this folder. Writes only when you assign it.",
  gpt: "Reads this folder. Writes only when you assign it.",
  grok: "Reads this folder. Writes only when you assign it.",
};

const $ = (id) => document.getElementById(id);
const nav = $("nav");
const menu = $("menu");
const user = $("user");
const thread = $("thread");
const composer = $("composer");
const message = $("message");
const models = $("models");
const connectNote = $("connect-note");
const menuNote = $("menu-note");

for (const [id, el] of [["writers", $("writers")], ["setup-writers", $("setup-writers")]]) {
  el.replaceChildren(
    ...writers.map(([value, label]) => {
      const button = document.createElement("button");
      button.className = "choice";
      button.type = "button";
      button.dataset.writer = value;
      button.textContent = label;
      return button;
    }),
  );
  el.dataset.group = id;
}
$("modes").replaceChildren(
  ...modes.map(([value, label]) => {
    const button = document.createElement("button");
    button.className = "choice mode";
    button.type = "button";
    button.dataset.mode = value;
    button.textContent = label;
    return button;
  }),
);

let state = null;
let signInPoll;
let currentPage = "home";

function show(page) {
  currentPage = page;
  for (const section of document.querySelectorAll(".page")) {
    section.hidden = section.dataset.page !== page;
  }
  for (const button of nav.querySelectorAll("button")) {
    button.setAttribute("aria-current", button.dataset.page === page ? "page" : "false");
  }
  menu.hidden = true;
  user.setAttribute("aria-expanded", "false");
  if (page === "chat") loadChat().catch(showChatError);
  if (page === "memory") loadMemory().catch(showMemoryError);
  if (page === "settings") loadTeam();
}

function readableError(error) {
  const text = error instanceof Error ? error.message : "That did not finish.";
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function paint(next) {
  state = next;
  const name = next.profile?.name || "You";
  $("user-name").textContent = name;
  $("avatar").textContent = name.slice(0, 1).toUpperCase();
  const folder = next.folder || next.root || "";
  const folderName = folder.split(/[\\/]/).filter(Boolean).pop() || "Folder";
  $("folder-name").textContent = folderName;
  $("folder-path").textContent = folder;
  $("chat-folder").textContent = `The models can read ${folder}. Only the assigned writer can change files.`;
  for (const button of document.querySelectorAll("[data-writer]")) {
    button.setAttribute("aria-pressed", String((button.dataset.writer || "") === (next.codeWriter || "")));
  }
  for (const button of $("modes").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === next.mode));
  }
  paintModels();
  paintHealthBanner();
  paintSetup();
  paintWorking(next.working);
}

function paintModels() {
  if (!state) return;
  models.replaceChildren();
  const head = document.createElement("div");
  head.className = "head";
  for (const label of ["Model", "What it does", "Status", "Usage, 7 days", "On"]) {
    const cell = document.createElement("span");
    cell.textContent = label;
    head.append(cell);
  }
  models.append(head);
  for (const account of state.accounts) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = account.label;
    const does = document.createElement("span");
    does.textContent = about[account.provider] || "";
    const check = (state.health || []).find((item) => item.provider === account.provider);
    if (check && check.state !== "ready") {
      const note = document.createElement("span");
      note.className = `health${check.state === "needs-update" ? " bad" : ""}`;
      note.textContent = check.detail;
      does.append(note);
    } else if (account.problem) {
      const note = document.createElement("span");
      note.className = "health bad";
      note.textContent = `Last sign-in failed: ${account.problem}`;
      does.append(note);
    }
    const status = document.createElement("span");
    if (account.loggedIn) {
      status.className = "status";
      status.textContent = "Connected";
    } else {
      const connect = document.createElement("button");
      connect.className = "connect";
      connect.type = "button";
      connect.dataset.provider = account.provider;
      connect.textContent = "Connect";
      status.append(connect);
    }
    const usage = document.createElement("span");
    usage.className = "usage";
    const used = (state.usage || []).find((item) => item.provider === account.provider);
    if (used && used.asksWeek) {
      const parts = [`${used.asksWeek} ask${used.asksWeek === 1 ? "" : "s"}`];
      if (used.tokensWeek) parts.push(`${formatTokens(used.tokensWeek)} tokens`);
      if (used.failedWeek) parts.push(`${used.failedWeek} failed`);
      usage.textContent = parts.join(" · ");
    } else {
      usage.textContent = "Not used yet";
    }
    if (used?.lastLimitAt) {
      const limit = document.createElement("span");
      limit.className = "limit";
      limit.textContent = `Hit a limit ${timeAgo(used.lastLimitAt)}`;
      usage.append(limit);
    }
    const toggle = document.createElement("button");
    toggle.className = "switch";
    toggle.type = "button";
    toggle.dataset.provider = account.provider;
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(state.enabled[account.provider] !== false));
    toggle.setAttribute("aria-label", `${account.label} on`);
    toggle.append(document.createElement("i"));
    row.append(name, does, status, usage, toggle);
    models.append(row);
  }
}

function paintHealthBanner() {
  const problems = (state.health || []).filter((item) => item.state === "needs-update");
  const lines = problems.map((item) => `${item.label}: ${item.detail}`);
  if (state.git === false) lines.push("Undo is off: Git is not installed. Install it from git-scm.com.");
  $("health-banner").hidden = !lines.length;
  $("health-banner").textContent = lines.join("\n");
}

function formatTokens(value) {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
}

function timeAgo(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

async function refresh() {
  paint(await window.desk.state());
  return state;
}

/* Chat */

async function loadChat() {
  const data = await window.desk.chat();
  const items = data.messages || [];
  const list = $("chat-list");
  list.replaceChildren();
  for (const item of data.threads || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-item";
    button.dataset.id = item.id;
    button.textContent = item.title;
    button.setAttribute("aria-current", String(item.id === data.current));
    list.append(button);
  }
  thread.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No messages in this chat.";
    thread.append(empty);
    return;
  }
  for (const item of items) {
    const bubble = document.createElement("article");
    bubble.className = `bubble ${item.role}`;
    const body = document.createElement("div");
    body.textContent = item.text;
    bubble.append(body);
    if (item.actions?.length) bubble.append(actionRow(item.actions));
    const time = document.createElement("time");
    time.dateTime = item.at;
    time.textContent = new Date(item.at).toLocaleString();
    bubble.append(time);
    thread.append(bubble);
  }
  thread.scrollTop = thread.scrollHeight;
}

function actionRow(actions) {
  const row = document.createElement("div");
  row.className = "actions";
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action ${action.kind}`;
    if (action.kind === "undo") {
      button.dataset.undo = action.checkpoint;
      button.textContent = action.available ? "Undo these changes" : "Undo no longer available";
    } else {
      button.dataset.apply = action.debate;
      button.dataset.provider = action.provider;
      button.textContent = action.available ? `Apply ${action.label}'s` : `${action.label}'s (older debate)`;
    }
    button.disabled = !action.available;
    row.append(button);
  }
  return row;
}

function showChatError(error) {
  const note = document.createElement("p");
  note.className = "empty";
  note.textContent = readableError(error);
  thread.replaceChildren(note);
}

async function afterAction(run) {
  try {
    await run();
  } catch (error) {
    await loadChat().catch(() => {});
    const note = document.createElement("p");
    note.className = "empty";
    note.textContent = readableError(error);
    thread.append(note);
    thread.scrollTop = thread.scrollHeight;
    return;
  }
  await loadChat();
}

thread.addEventListener("click", (event) => {
  const button = event.target.closest(".action");
  if (!button || button.disabled) return;
  button.disabled = true;
  if (button.dataset.undo) afterAction(() => window.desk.undo(button.dataset.undo));
  else if (button.dataset.apply) {
    show("chat");
    afterAction(() => window.desk.apply(button.dataset.apply, button.dataset.provider));
  }
});

/* Live progress and Stop */

let workingSince = 0;
let tick;

function paintWorking(working) {
  const box = $("working");
  clearInterval(tick);
  if (!working) {
    box.hidden = true;
    composer.querySelector("button").disabled = false;
    return;
  }
  box.hidden = false;
  workingSince = working.started || Date.now();
  $("working-what").textContent = `Working on ${working.what}`;
  if (working.latest) paintProgress(working.latest);
  const update = () => {
    const seconds = Math.floor((Date.now() - workingSince) / 1000);
    $("working-time").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  update();
  tick = setInterval(update, 1000);
  composer.querySelector("button").disabled = true;
}

function paintProgress(update) {
  $("working-line").textContent = `${update.label}: ${update.line}`;
}

window.desk.onWorking((working) => {
  paintWorking(working);
  if (!working && currentPage === "chat") loadChat().catch(() => {});
});
window.desk.onProgress(paintProgress);
window.desk.onHealth(() => refresh().catch(() => {}));

$("stop").addEventListener("click", async () => {
  $("working-line").textContent = await window.desk.stop();
});

/* Memory */

async function loadMemory(query) {
  paintMemory(await window.desk.memory(query ?? $("memory-search").value));
}

function showMemoryError(error) {
  $("memory-note").textContent = readableError(error);
}

function paintMemory(memory) {
  if (document.activeElement !== $("memory-goal")) $("memory-goal").value = memory.goal;
  if (document.activeElement !== $("memory-now")) $("memory-now").value = memory.now;
  $("memory-summary").textContent = memory.summary || "No summary yet. Once there are more than 8 handoffs, summarize the older ones so every model still knows about them.";
  $("memory-decisions").replaceChildren(...(memory.decisions.length ? memory.decisions.map((item) => memoryItem("decisions", item, item.decision, item.why ? `Why: ${item.why}` : "")) : [emptyNote("No decisions yet.")]));
  $("memory-handoffs").replaceChildren(...(memory.handoffs.length ? memory.handoffs.map((item) => memoryItem("handoffs", item, [item.task ? `Task: ${item.task}` : "", item.did].filter(Boolean).join("\n"), item.files?.length ? `Files: ${item.files.join(", ")}` : "")) : [emptyNote("No handoffs yet.")]));
  const hits = $("memory-hits");
  hits.hidden = !memory.hits;
  if (memory.hits) hits.replaceChildren(...(memory.hits.length ? memory.hits.map((text) => emptyNote(text)) : [emptyNote("No matches.")]));
}

function emptyNote(text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  return p;
}

function memoryItem(kind, item, text, extra) {
  const row = document.createElement("div");
  row.className = "item";
  const body = document.createElement("div");
  body.className = "text";
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${item.model}${item.kind ? ` · ${item.kind}` : ""} · ${new Date(item.at).toLocaleString()}`;
  const main = document.createElement("span");
  main.className = "main";
  main.textContent = text;
  body.append(meta, main);
  if (extra) {
    const more = document.createElement("span");
    more.className = "meta";
    more.textContent = extra;
    body.append(more);
  }
  const tools = document.createElement("div");
  tools.className = "tools";
  if (kind === "decisions") {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "action";
    edit.textContent = "Edit";
    edit.addEventListener("click", async () => {
      if (main.isContentEditable) {
        try {
          paintMemory(await window.desk.memoryEdit(item.id, main.textContent));
        } catch (error) {
          showMemoryError(error);
        }
        return;
      }
      main.contentEditable = "true";
      main.focus();
      edit.textContent = "Save";
    });
    tools.append(edit);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "action";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (remove.dataset.sure !== "1") {
      remove.dataset.sure = "1";
      remove.textContent = "Delete for every model?";
      return;
    }
    try {
      paintMemory(await window.desk.memoryDelete(kind, item.id));
    } catch (error) {
      showMemoryError(error);
    }
  });
  tools.append(remove);
  row.append(body, tools);
  return row;
}

for (const button of document.querySelectorAll("[data-save]")) {
  button.addEventListener("click", async () => {
    const field = button.dataset.save;
    try {
      paintMemory(await window.desk.memorySave(field, $(`memory-${field}`).value));
      $("memory-note").textContent = field === "goal" ? "Saved the goal." : "Saved the task.";
    } catch (error) {
      showMemoryError(error);
    }
  });
}

let searchTimer;
$("memory-search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadMemory().catch(showMemoryError), 200);
});

$("memory-summarize").addEventListener("click", async () => {
  $("memory-note").textContent = "Writing the summary…";
  try {
    paintMemory(await window.desk.memorySummarize());
    $("memory-note").textContent = "Summary saved. Every model's brief now includes it.";
  } catch (error) {
    showMemoryError(error);
  }
});

/* Team memory */

async function loadTeam() {
  try {
    const team = await window.desk.team();
    $("team-status").textContent = !team.inGit
      ? "This folder is not a Git repository. Team memory is shared through Git."
      : team.remote
        ? `Shared through Git (${team.branch || "no branch"} on ${team.remote}). Your writer, mode, chats, and Undo history stay on this computer.`
        : "In Git, but there is no remote named origin yet, so there is nobody to share with.";
    $("team-sync").disabled = !team.inGit;
  } catch (error) {
    $("team-status").textContent = readableError(error);
  }
}

$("team-sync").addEventListener("click", async () => {
  $("team-note").textContent = "Syncing…";
  try {
    $("team-note").textContent = await window.desk.teamSync();
  } catch (error) {
    $("team-note").textContent = readableError(error);
  }
});

/* First-run setup */

function paintSetup() {
  if (!state) return;
  const done = {
    folder: state.folderChosen,
    connect: state.accounts.some((account) => account.loggedIn),
    writer: Boolean(state.codeWriter),
  };
  for (const [step, ok] of Object.entries(done)) {
    document.querySelector(`[data-step="${step}"]`)?.classList.toggle("done", ok);
  }
  $("setup-folder").textContent = state.folderChosen ? state.folder : "The models will read this folder.";
  $("setup-try").disabled = !done.folder || !done.connect;
}

$("setup-choose-folder").addEventListener("click", () => chooseFolder());
document.querySelector('[data-go="integrations"]').addEventListener("click", () => show("integrations"));
$("setup-try").addEventListener("click", async () => {
  // A question in Work mode goes to the writer, who may edit. Debate mode only reads, so the first try is safe.
  if (state.mode !== "debate") paint(await window.desk.setMode("debate"));
  show("chat");
  message.value = "What is in this folder? Answer in three short lines.";
  composer.requestSubmit();
  document.querySelector('[data-step="try"]').classList.add("done");
});
$("setup-done").addEventListener("click", async () => {
  if (!state.folderChosen) {
    $("setup-note").textContent = "Choose a folder first.";
    return;
  }
  paint(await window.desk.finishSetup());
  show("chat");
});

/* Navigation, folder, menu */

nav.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  show(button.dataset.page);
});

user.addEventListener("click", () => {
  menu.hidden = !menu.hidden;
  user.setAttribute("aria-expanded", String(!menu.hidden));
});

$("open-settings").addEventListener("click", () => show("settings"));

async function chooseFolder() {
  paint(await window.desk.chooseFolder());
  if (currentPage === "chat") await loadChat().catch(showChatError);
  if (currentPage === "memory") await loadMemory().catch(showMemoryError);
  if (currentPage === "settings") loadTeam();
}

$("new-chat").addEventListener("click", async () => {
  await window.desk.newChat();
  await loadChat();
  message.focus();
});

$("chat-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".chat-item");
  if (!button) return;
  await window.desk.openChat(button.dataset.id);
  await loadChat();
});
for (const id of ["choose-folder", "choose-folder-chat", "choose-folder-settings"]) $(id).addEventListener("click", () => chooseFolder());

document.addEventListener("click", (event) => {
  if (menu.hidden) return;
  if (user.contains(event.target) || menu.contains(event.target)) return;
  menu.hidden = true;
  user.setAttribute("aria-expanded", "false");
});

$("logout").addEventListener("click", async () => {
  menuNote.hidden = false;
  menuNote.textContent = "Signing out…";
  const result = await window.desk.logout();
  paint(result.state);
  menu.hidden = false;
  user.setAttribute("aria-expanded", "true");
  menuNote.hidden = false;
  menuNote.textContent = result.message;
});

document.addEventListener("click", async (event) => {
  const writer = event.target.closest("[data-writer]");
  if (writer) {
    paint(await window.desk.setWriter(writer.dataset.writer || null));
    return;
  }
  const mode = event.target.closest("[data-mode]");
  if (mode) paint(await window.desk.setMode(mode.dataset.mode));
});

$("check-health").addEventListener("click", async () => {
  connectNote.hidden = false;
  connectNote.textContent = "Checking each tool…";
  paint(await window.desk.health());
  connectNote.textContent = "Checked.";
});

models.addEventListener("click", async (event) => {
  const connect = event.target.closest(".connect");
  if (connect) {
    connectNote.hidden = false;
    connectNote.textContent = "Opening the browser…";
    const provider = connect.dataset.provider;
    try {
      connectNote.textContent = await window.desk.connect(provider);
    } catch (error) {
      connectNote.textContent = readableError(error);
      return;
    }
    clearInterval(signInPoll);
    signInPoll = setInterval(async () => {
      await refresh().catch(() => {});
      const account = state?.accounts.find((item) => item.provider === provider);
      if (account?.loggedIn || account?.problem) clearInterval(signInPoll);
    }, 2000);
    setTimeout(() => clearInterval(signInPoll), 15 * 60 * 1000);
    return;
  }
  const toggle = event.target.closest(".switch");
  if (!toggle) return;
  const on = toggle.getAttribute("aria-checked") !== "true";
  paint(await window.desk.setEnabled(toggle.dataset.provider, on));
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = message.value.trim();
  if (!text) return;
  const send = composer.querySelector("button");
  send.disabled = true;
  message.value = "";
  // Show the message right away; the reply streams in through the progress bar.
  const pending = document.createElement("article");
  pending.className = "bubble user";
  pending.textContent = text;
  thread.querySelector(".empty")?.remove();
  thread.append(pending);
  thread.scrollTop = thread.scrollHeight;
  await afterAction(() => window.desk.submit(text));
  message.focus();
});

message.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

refresh()
  .then(() => show(state.setupDone ? "home" : "welcome"))
  .catch((error) => {
    show("home");
    connectNote.hidden = false;
    connectNote.textContent = readableError(error);
  });
