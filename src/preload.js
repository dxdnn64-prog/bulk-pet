const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("bulkApi", {
  getDisplay: () => ipcRenderer.invoke("get-display"),
  onDisplay: (cb) => ipcRenderer.on("display", (_, d) => cb(d)),
  onWindows: (cb) => ipcRenderer.on("windows", (_, list) => cb(list)),
  onCommand: (cb) => ipcRenderer.on("command", (_, c) => cb(c)),
  setInteractive: (value) => ipcRenderer.send("set-interactive", value),
  showMenu: () => ipcRenderer.send("show-menu"),
  setSleeping: (value) => ipcRenderer.send("sleep-state", value),
  setTrayIcon: (dataUrl) => ipcRenderer.send("tray-icon", dataUrl),
})
