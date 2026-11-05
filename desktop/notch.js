const writers = [
  ["", "None"],
  ["me", "You"],
  ["auto", "Auto"],
  ["cursor", "Cursor"],
  ["claude", "Claude"],
  ["gpt", "GPT"],
  ["grok", "Grok"],
  ["gemini", "Gemini"],
];
const closed = { w: 112, h: 24, r: 12 };
// Wide enough for nine "Writes" choices and five sign-in buttons on one line each.
const bar = { w: 660, h: 210, r: 26 };
const chat = { w: 660, h: 360, r: 28 };

const wrap = document.getElementById("wrap");
const body = document.getElementById("body");
const panel = document.getElementById("panel");
const writersEl = document.getElementById("writers");
const modesEl = document.getElementById("modes");
const accountsEl = document.getElementById("accounts");
const thread = document.getElementById("thread");
const threadInner = document.getElementById("thread-inner");
const ask = document.getElementById("ask");
const task = document.getElementById("task");
const sendButton = ask.querySelector("button");

let stickToBottom = true;
let pinning = false;

function pinThread() {
  if (!stickToBottom) return;
  pinning = true;
  thread.scrollTop = thread.scrollHeight;
  pinning = false;
}

thread.addEventListener("scroll", () => {
  if (pinning) return;
  const gap = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
  stickToBottom = gap < 32;
});

new ResizeObserver(() => pinThread()).observe(thread);

class Axis {
  constructor(value) {
    this.x = value;
    this.v = 0;
    this.t = value;
  }
  step(dt, collapsing) {
    const damp = collapsing && this.t < this.x ? 29 * 1.3 : 29;
    const force = -380 * (this.x - this.t) - damp * this.v;
    this.v += force * dt;
    this.x += this.v * dt;
    if (Math.abs(this.x - this.t) < 0.04 && Math.abs(this.v) < 0.08) {
      this.x = this.t;
      this.v = 0;
    }
  }
}

const width = new Axis(closed.w);
const height = new Axis(closed.h);
const radius = new Axis(closed.r);
let target = closed;
let last = 0;

function tick(now) {
  const dt = Math.min(1 / 20, Math.max(0, (now - last) / 1000 || 1 / 60));
  last = now;
  const collapsing = target.w < width.x - 0.5;
  let left = dt;
  while (left > 0) {
    const step = Math.min(1 / 240, left);
    width.step(step, collapsing);
    height.step(step, collapsing);
    radius.step(step, collapsing);
    left -= step;
  }
  body.style.width = `${width.x}px`;
  body.style.height = `${height.x}px`;
  body.style.borderBottomLeftRadius = `${radius.x}px`;
  body.style.borderBottomRightRadius = `${radius.x}px`;
  const grown = width.x > 220;
  body.classList.toggle("open", grown);
  panel.classList.toggle("on", grown);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

let hovering = false;
let locked = false;
let busy = false;
let leftWhileBusy = false;
let messages = [];
let showAsk = false;
let capturing = false;

writersEl.innerHTML = writers
  .map(([id, label]) => `<button class="choice" type="button" data-writer="${id}">${label}</button>`)
  .join("");
// Eight modes do not fit as buttons in the notch, so it uses a compact picker.
const modeSelect = document.createElement("select");
modeSelect.className = "mode-select";
modeSelect.setAttribute("aria-label", "Mode");
modesEl.replaceChildren(modeSelect);

function paint(state) {
  for (const button of writersEl.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String((button.dataset.writer || "") === (state.codeWriter || "")));
  }
  const modes = state.modes || [];
  if (modeSelect.options.length !== modes.length) {
    modeSelect.replaceChildren(
      ...modes.map((mode) => {
        const option = document.createElement("option");
        option.value = mode.id;
        option.textContent = mode.label;
        option.title = mode.summary;
        return option;
      }),
    );
  }
  modeSelect.value = state.mode;
  const current = modes.find((mode) => mode.id === state.mode);
  modeSelect.title = current?.summary || "";
  accountsEl.innerHTML = state.accounts
    .map((account) => {
      const status = account.loggedIn ? "on" : "";
      const name = account.loggedIn ? account.label : `Sign in ${account.label}`;
      return `<button class="account ${status}" type="button" data-provider="${account.provider}">${name}</button>`;
    })
    .join("");
  const folder = state.folder || "";
  document.getElementById("folder").textContent = folder.split(/[\\/]/).filter(Boolean).pop() || "Choose folder";
  // Only Work needs a model writer; every other mode can always be asked.
  // The message box is always there. Any two signed-in models are enough; until then it says so.
  const ready = (state.accounts || []).filter((account) => account.loggedIn && state.enabled?.[account.provider] !== false).length;
  showAsk = true;
  ask.hidden = false;
  task.placeholder =
    ready < 2
      ? `Sign in to ${2 - ready} more model${ready === 1 ? "" : "s"} to start. Any of them works.`
      : `${current?.label ?? "Ask"}: e.g. ${current?.example ?? ""}`;
  layout();
}

function engaged() {
  return hovering;
}

function overNotch(x, y) {
  const rect = body.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const w = hovering ? Math.max(rect.width, target.w) : rect.width;
  const h = hovering ? Math.max(rect.height, target.h) : rect.height;
  return x >= cx - w / 2 - 18 && x <= cx + w / 2 + 18 && y >= -2 && y <= h + 10;
}

function place(x, y) {
  const inside = overNotch(x, y);
  setCapture(inside);
  if (inside) {
    if (hovering) return;
    hovering = true;
    leftWhileBusy = false;
    layout();
    return;
  }
  if (document.activeElement === task) task.blur();
  if (!hovering) return;
  hovering = false;
  locked = false;
  if (busy) leftWhileBusy = true;
  layout();
}

function layout() {
  const open = engaged();
  const chatting = open && (busy || messages.length > 0);
  thread.hidden = !chatting;
  target = !open ? closed : chatting ? chat : bar;
  width.t = target.w;
  height.t = target.h;
  radius.t = target.r;
}

let pendingText = "";

function renderThread(pending) {
  pendingText = pending || "";
  threadInner.replaceChildren();
  for (const item of messages) {
    const bubble = document.createElement("article");
    bubble.className = `bubble ${item.role === "user" ? "user" : "brain"}`;
    if (item.role === "user") bubble.textContent = item.text;
    else bubble.append(window.renderMarkdown(item.text));
    if (item.actions?.length) {
      const row = document.createElement("div");
      row.className = "actions";
      for (const action of item.actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action";
        button.disabled = !action.available;
        if (action.kind === "undo") {
          button.dataset.undo = action.checkpoint;
          button.textContent = action.available ? "Undo" : "Undo used";
        } else {
          button.dataset.apply = action.debate;
          button.dataset.provider = action.provider;
          button.textContent = `Apply ${action.label}'s`;
        }
        row.append(button);
      }
      bubble.append(row);
    }
    threadInner.append(bubble);
  }
  if (pending) {
    const bubble = document.createElement("article");
    bubble.className = "bubble brain";
    bubble.textContent = pending;
    threadInner.append(bubble);
    stickToBottom = true;
  }
  pinThread();
}

async function loadChat() {
  const data = await window.notch.chat();
  messages = Array.isArray(data) ? data : data.messages || [];
  renderThread(busy ? pendingText : "");
  layout();
}

function setBusy(on) {
  busy = on;
  // While a model works, Send becomes Stop.
  sendButton.textContent = on ? "Stop" : "Send";
  sendButton.classList.toggle("stop", on);
  sendButton.type = on ? "button" : "submit";
}

sendButton.addEventListener("click", async () => {
  // Only a model job turns Send into Stop; a sign-in in progress does not.
  if (!sendButton.classList.contains("stop")) return;
  renderThread("Stopping…");
  await window.notch.stop();
});

window.notch.onProgress((update) => {
  if (busy) renderThread(`${update.label}: ${update.line}`);
});

// Work started from the main window shows here too, with its progress and Stop.
window.notch.onWorking((working) => {
  if (working && !busy) {
    setBusy(true);
    renderThread(`Working on ${working.what}…`);
    layout();
  } else if (!working && busy && !ownJob) {
    setBusy(false);
    loadChat().catch(() => layout());
  }
});

let ownJob = false;

threadInner.addEventListener("click", async (event) => {
  const button = event.target.closest(".action");
  if (!button || button.disabled || busy) return;
  button.disabled = true;
  ownJob = true;
  setBusy(true);
  renderThread(button.dataset.undo ? "Undoing…" : "Applying…");
  layout();
  try {
    if (button.dataset.undo) await window.notch.undo(button.dataset.undo);
    else await window.notch.apply(button.dataset.apply, button.dataset.provider);
  } catch {
    // The reply, including a failure, is stored in the chat.
  } finally {
    ownJob = false;
    setBusy(false);
    await loadChat().catch(() => layout());
  }
});

async function refresh() {
  const state = await window.notch.state();
  paint(state);
  return state;
}

function setCapture(on) {
  if (on === capturing) return;
  capturing = on;
  window.notch.pass(!on);
}

window.notch.onPointer((point) => {
  if (!point || typeof point.x !== "number") return;
  place(point.x, point.y);
});

document.getElementById("folder").addEventListener("click", async () => {
  paint(await window.notch.chooseFolder());
  await loadChat();
});

writersEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  paint(await window.notch.setWriter(button.dataset.writer || null));
});

modeSelect.addEventListener("change", async () => {
  paint(await window.notch.setMode(modeSelect.value));
  task.focus();
});

let signInPoll;
accountsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || button.classList.contains("on")) return;
  busy = true;
  renderThread("Opening Chrome…");
  layout();
  try {
    renderThread(await window.notch.connect(button.dataset.provider));
  } catch (error) {
    renderThread(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Sign-in did not start.");
  } finally {
    busy = false;
    if (leftWhileBusy) {
      leftWhileBusy = false;
      hovering = false;
    }
    layout();
  }
  const provider = button.dataset.provider;
  clearInterval(signInPoll);
  signInPoll = setInterval(async () => {
    const state = await refresh().catch(() => null);
    if (state?.accounts.some((account) => account.provider === provider && account.loggedIn)) clearInterval(signInPoll);
  }, 2000);
  setTimeout(() => clearInterval(signInPoll), 15 * 60 * 1000);
});

ask.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = task.value.trim();
  if (!text || busy) return;
  ownJob = true;
  setBusy(true);
  messages = [...messages, { role: "user", text }];
  task.value = "";
  renderThread("Working…");
  layout();
  try {
    await window.notch.submit(text);
  } catch {
    // The reply, including a failure, is stored in the chat.
  } finally {
    ownJob = false;
    setBusy(false);
    if (leftWhileBusy) {
      leftWhileBusy = false;
      hovering = false;
    }
    await loadChat().catch(() => layout());
  }
});

document.getElementById("close").onclick = () => window.notch.close();
refresh().catch(() => layout());
loadChat().catch(() => {});
