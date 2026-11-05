const { contextBridge, ipcRenderer } = require("electron");

const api = {
  state: () => ipcRenderer.invoke("state"),
  setWriter: (writer) => ipcRenderer.invoke("set-writer", writer),
  setMode: (mode) => ipcRenderer.invoke("set-mode", mode),
  connect: (provider) => ipcRenderer.invoke("connect", provider),
  submit: (text) => ipcRenderer.invoke("submit", text),
  stop: () => ipcRenderer.invoke("stop"),
  undo: (checkpoint) => ipcRenderer.invoke("undo", checkpoint),
  apply: (debate, provider) => ipcRenderer.invoke("apply", debate, provider),
  health: () => ipcRenderer.invoke("health"),
  memory: (query) => ipcRenderer.invoke("memory", query),
  memorySave: (field, text) => ipcRenderer.invoke("memory-save", field, text),
  memoryEdit: (id, text) => ipcRenderer.invoke("memory-edit", id, text),
  memoryDelete: (kind, id) => ipcRenderer.invoke("memory-delete", kind, id),
  memorySummarize: () => ipcRenderer.invoke("memory-summarize"),
  team: () => ipcRenderer.invoke("team"),
  teamSync: () => ipcRenderer.invoke("team-sync"),
  finishSetup: () => ipcRenderer.invoke("finish-setup"),
  pass: (through) => ipcRenderer.invoke("pass", through),
  onPointer: (fn) => ipcRenderer.on("pointer", (_event, point) => fn(point)),
  onProgress: (fn) => ipcRenderer.on("progress", (_event, update) => fn(update)),
  onWorking: (fn) => ipcRenderer.on("working", (_event, working) => fn(working)),
  onHealth: (fn) => ipcRenderer.on("health", (_event, items) => fn(items)),
  close: () => ipcRenderer.invoke("close"),
  chat: () => ipcRenderer.invoke("chat"),
  home: () => ipcRenderer.invoke("home"),
  openRecent: (folder, id) => ipcRenderer.invoke("open-recent", folder, id),
  newChat: () => ipcRenderer.invoke("new-chat"),
  openChat: (id) => ipcRenderer.invoke("open-chat", id),
  setEnabled: (provider, enabled) => ipcRenderer.invoke("set-enabled", provider, enabled),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  logout: () => ipcRenderer.invoke("logout"),
};

contextBridge.exposeInMainWorld("notch", api);
contextBridge.exposeInMainWorld("desk", api);
