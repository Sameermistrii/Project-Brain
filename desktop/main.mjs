import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import updater from "electron-updater";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { accountStates, beginSignIn, installNeeded, isProvider, setUsageListener, signOutModels, stopAll, toolHealth } from "../dist/accounts.js";
import {
  accessFolder,
  deleteMemory,
  enabledModels,
  findProjectRoot,
  initBrain,
  loadBrain,
  searchBrain,
  setAccessFolder,
  setGoal,
  setMode,
  setModelEnabled,
  setNow,
  setWriter,
  updateDecision,
} from "../dist/brain.js";
import { appendChat, createThread, currentThreadId, listChat, listThreads, openThread } from "../dist/chat.js";
import { DirtyError, hasGit, lastUndoable } from "../dist/checkpoints.js";
import { writerLabel } from "../dist/policy.js";
import { applyProposal, latestDebateId, submitToBrain, summarizeMemory, undoChange } from "../dist/session.js";
import { syncMemory, teamStatus } from "../dist/team.js";
import { recordUsage, usageSummary } from "../dist/usage.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAC = process.platform === "darwin";

/**
 * The app's own brain. It keeps app settings: which folder is open, which models are on, setup, and usage.
 * An installed app cannot write inside its own package, so it uses the per-user app data folder instead.
 */
function appRoot() {
  if (app.isPackaged) return app.getPath("userData");
  return findProjectRoot(process.cwd()) || path.resolve(here, "..");
}

/** The open folder. Its .brain holds that project's goal, decisions, handoffs, chats, writer, and mode. */
function workRoot() {
  const folder = accessFolder(appRoot());
  // Idempotent: creates a missing brain, and adds the team-sharing files to an older one.
  initBrain(folder, path.basename(folder));
  return folder;
}

function appConfigPath() {
  return path.join(appRoot(), ".brain", "config.json");
}

function readAppConfig() {
  try {
    return JSON.parse(fs.readFileSync(appConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeAppConfig(patch) {
  const next = { ...readAppConfig(), ...patch };
  fs.writeFileSync(appConfigPath(), `${JSON.stringify(next, null, 2)}\n`);
}

/** Buttons under replies, with whether each can still be used. */
function chatState() {
  const folder = workRoot();
  const undoable = lastUndoable(folder)?.id ?? null;
  const debate = latestDebateId(folder);
  const messages = listChat(folder).map((message) => ({
    ...message,
    actions: (message.actions ?? []).map((action) => ({
      ...action,
      available: action.kind === "undo" ? action.checkpoint === undoable : action.debate === debate,
    })),
  }));
  return { threads: listThreads(folder), current: currentThreadId(folder), messages, working: running };
}

function notchBounds() {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.min(460, bounds.height),
  };
}

let win;
let appWin;
let profileName = os.userInfo().username || "You";
let health = [];
let gitReady = true;
/** What is working right now, so both windows can show progress and a Stop button. */
let running = null;

function loadProfileName() {
  const [command, args] = MAC
    ? ["id", ["-F"]]
    : process.platform === "win32"
      ? ["powershell.exe", ["-NoProfile", "-Command", "(Get-LocalUser -Name $env:USERNAME).FullName"]]
      : ["getent", ["passwd", os.userInfo().username]];
  execFile(command, args, { windowsHide: true, timeout: 4000 }, (_error, stdout) => {
    let full = String(stdout || "").trim();
    if (command === "getent") full = full.split(":")[4]?.split(",")[0] ?? "";
    if (full) profileName = full;
  });
}

function broadcast(channel, payload) {
  for (const target of [win, appWin]) {
    if (target && !target.isDestroyed()) target.webContents.send(channel, payload);
  }
}

// Tool output can arrive hundreds of times a second; the windows only need a few updates a second.
let pendingProgress = null;
let progressTimer = null;
function progress(label, line) {
  pendingProgress = { label, line };
  if (running) running.latest = pendingProgress;
  if (progressTimer) return;
  progressTimer = setTimeout(() => {
    progressTimer = null;
    if (pendingProgress) broadcast("progress", pendingProgress);
  }, 150);
}

/** Runs one model job at a time. Both windows get "working" and "done" events, and Stop ends it. */
async function work(what, job) {
  if (running) throw new Error(`Still working on ${running.what}. Press Stop to end it first.`);
  running = { what, started: Date.now(), latest: null };
  broadcast("working", running);
  try {
    return await job({ enabled: enabledModels(appRoot()), onProgress: progress });
  } finally {
    running = null;
    pendingProgress = null;
    broadcast("working", null);
  }
}

async function refreshHealth() {
  [health, gitReady] = await Promise.all([toolHealth().catch(() => []), hasGit()]);
  return health;
}

function createWindow() {
  win = new BrowserWindow({
    ...notchBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    // On a Mac the notch must not show up as a window in Mission Control or the app switcher.
    ...(MAC ? { type: "panel", roundedCorners: false } : {}),
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(here, "notch.html"));
}

function createAppWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1120, area.width - 80);
  const height = Math.min(760, area.height - 80);
  appWin = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 560,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    title: "Project brain",
    backgroundColor: "#101010",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  appWin.once("ready-to-show", () => appWin.show());
  appWin.loadFile(path.join(here, "app.html"));
}

async function snapshot() {
  const root = appRoot();
  const folder = workRoot();
  const brain = loadBrain(folder);
  const accounts = await accountStates();
  return {
    name: brain.manifest.name,
    codeWriter: brain.manifest.codeWriter,
    writerLabel: writerLabel(brain.manifest.codeWriter),
    mode: brain.manifest.mode,
    accounts,
    enabled: enabledModels(root),
    profile: { name: profileName },
    root,
    folder,
    folderChosen: Boolean(readAppConfig().folder),
    setupDone: Boolean(readAppConfig().setupDone),
    health,
    git: gitReady,
    usage: usageSummary(root),
    working: running,
    platform: process.platform,
  };
}

function memoryState(query = "") {
  const folder = workRoot();
  const snap = loadBrain(folder);
  return {
    goal: snap.goal,
    now: snap.now,
    summary: snap.summary,
    decisions: [...snap.decisions].reverse(),
    handoffs: [...snap.handoffs].reverse(),
    hits: query.trim() ? searchBrain(snap, query) : null,
  };
}

function dialogParent() {
  return appWin && !appWin.isDestroyed() ? appWin : null;
}

async function ask(options) {
  const parent = dialogParent();
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return response;
}

/** Saves a reply to the open folder's chat and returns it. */
function saveReply(folder, result) {
  appendChat(folder, { role: "brain", text: result.text, actions: result.actions });
  return result.text;
}

function failReply(folder, error) {
  const message = error instanceof Error ? error.message : "That did not finish.";
  appendChat(folder, { role: "brain", text: message });
  throw error;
}

function startUpdates() {
  if (!app.isPackaged) return;
  const { autoUpdater } = updater;
  // Downloads in the background and installs when the app quits. A failed check (offline, no release yet) is not an error for the person.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  // A fresh copy has no .brain yet; the app settings need one.
  initBrain(appRoot(), "Project brain");
  setUsageListener((event) => {
    try {
      recordUsage(appRoot(), event);
    } catch {
      // Usage counts are a convenience; never fail a model answer over them.
    }
  });
  loadProfileName();
  createWindow();
  createAppWindow();
  refreshHealth().then(() => broadcast("health", health));
  startUpdates();
  screen.on("display-metrics-changed", () => {
    if (win) win.setBounds(notchBounds());
  });

  ipcMain.handle("state", () => snapshot());
  ipcMain.handle("set-writer", (_event, writer) => {
    setWriter(workRoot(), writer || null);
    return snapshot();
  });
  ipcMain.handle("set-mode", (_event, mode) => {
    setMode(workRoot(), mode === "debate" ? "debate" : "work");
    return snapshot();
  });
  ipcMain.handle("connect", async (_event, provider) => {
    if (!isProvider(provider)) throw new Error("Unknown model.");
    const install = installNeeded(provider);
    if (install) {
      const response = await ask({
        type: "question",
        buttons: ["Install", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: `Sign in to ${install.label}`,
        message: `${install.label} needs ${install.tool} to sign in. It is not installed yet.`,
        detail: `Project brain will download it from ${install.site} and install it for your user account. This takes about a minute.`,
      });
      if (response !== 0) return "Nothing was installed.";
    }
    return beginSignIn(provider);
  });
  ipcMain.handle("chat", () => chatState());
  ipcMain.handle("new-chat", () => {
    createThread(workRoot());
    return chatState();
  });
  ipcMain.handle("open-chat", (_event, id) => {
    openThread(workRoot(), String(id ?? ""));
    return chatState();
  });
  ipcMain.handle("choose-folder", async () => {
    const root = appRoot();
    const options = {
      title: "Choose a folder",
      defaultPath: accessFolder(root),
      properties: ["openDirectory", "createDirectory"],
    };
    const parent = dialogParent();
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (!picked.canceled && picked.filePaths[0]) setAccessFolder(root, picked.filePaths[0]);
    return snapshot();
  });
  ipcMain.handle("set-enabled", (_event, provider, enabled) => {
    if (!isProvider(provider)) throw new Error("Unknown model.");
    setModelEnabled(appRoot(), provider, Boolean(enabled));
    return snapshot();
  });
  ipcMain.handle("logout", async () => {
    const message = await signOutModels();
    return { message, state: await snapshot() };
  });
  ipcMain.handle("submit", async (_event, text) => {
    const folder = workRoot();
    const task = String(text ?? "");
    if (task.trim()) appendChat(folder, { role: "user", text: task });
    try {
      return saveReply(folder, await work("your message", (options) => submitToBrain(folder, task, options)));
    } catch (error) {
      return failReply(folder, error);
    }
  });
  ipcMain.handle("stop", () => {
    const stopped = stopAll();
    return stopped ? "Stopping." : "Nothing is running.";
  });
  ipcMain.handle("undo", async (_event, checkpoint) => {
    const folder = workRoot();
    const id = String(checkpoint ?? "");
    try {
      return saveReply(folder, await undoChange(folder, id));
    } catch (error) {
      if (!(error instanceof DirtyError)) return failReply(folder, error);
      const response = await ask({
        type: "warning",
        buttons: ["Undo anyway", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Undo",
        message: "Some files changed after that task.",
        detail: `${error.message} Undo anyway puts every file back to how it was before the task.`,
      });
      if (response !== 0) return "Nothing was undone.";
      return saveReply(folder, await undoChange(folder, id, true));
    }
  });
  ipcMain.handle("apply", async (_event, debate, provider) => {
    if (!isProvider(provider)) throw new Error("Unknown model.");
    const folder = workRoot();
    appendChat(folder, { role: "user", text: `Apply the ${provider === "gpt" ? "ChatGPT" : provider[0].toUpperCase() + provider.slice(1)} proposal.` });
    try {
      return saveReply(folder, await work("the proposal", (options) => applyProposal(folder, String(debate ?? ""), provider, options)));
    } catch (error) {
      return failReply(folder, error);
    }
  });
  ipcMain.handle("health", async () => {
    await refreshHealth();
    return snapshot();
  });
  ipcMain.handle("memory", (_event, query) => memoryState(String(query ?? "")));
  ipcMain.handle("memory-save", (_event, field, text) => {
    const folder = workRoot();
    if (field === "goal") setGoal(folder, String(text ?? ""));
    else if (field === "now") setNow(folder, String(text ?? ""));
    else throw new Error("Unknown field.");
    return memoryState();
  });
  ipcMain.handle("memory-edit", (_event, id, text) => {
    updateDecision(workRoot(), String(id ?? ""), String(text ?? ""));
    return memoryState();
  });
  ipcMain.handle("memory-delete", (_event, kind, id) => {
    deleteMemory(workRoot(), kind, String(id ?? ""));
    return memoryState();
  });
  ipcMain.handle("memory-summarize", async () => {
    await work("the summary", (options) => summarizeMemory(workRoot(), options));
    return memoryState();
  });
  ipcMain.handle("team", async () => teamStatus(workRoot()));
  ipcMain.handle("team-sync", async () => syncMemory(workRoot()));
  ipcMain.handle("finish-setup", () => {
    writeAppConfig({ setupDone: true });
    return snapshot();
  });
  ipcMain.handle("pass", (_event, through) => {
    if (!win) return;
    win.setIgnoreMouseEvents(Boolean(through), { forward: true });
  });
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    win.webContents.send("pointer", {
      x: point.x - bounds.x,
      y: point.y - bounds.y,
    });
  }, 40);
  ipcMain.handle("close", () => app.quit());
});

app.on("window-all-closed", () => app.quit());
// Quitting mid-task would leave a model tool running with nobody to read its answer.
app.on("before-quit", () => stopAll());
