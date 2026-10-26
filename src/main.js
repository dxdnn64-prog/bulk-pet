// Главный процесс: прозрачное окно на весь экран, трей, меню, список окон для Булька

const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require("electron")
const path = require("path")
const { createWindowTracker } = require("./windows")

const WINDOWS_POLL_MS = 150

let overlay = null
let tray = null
let tracker = null
let ownHwnd = 0n
let sleeping = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

function displayInfo() {
  const d = screen.getPrimaryDisplay()
  const b = d.bounds
  const wa = d.workArea
  return {
    width: b.width,
    height: b.height,
    // пол — верх панели задач, в координатах нашего окна
    floorY: wa.y + wa.height - b.y,
    topY: wa.y - b.y,
  }
}

function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay()
  overlay = new BrowserWindow({
    ...bounds,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
  })

  overlay.setAlwaysOnTop(true, "screen-saver")
  overlay.setIgnoreMouseEvents(true, { forward: true })
  overlay.loadFile(path.join(__dirname, "renderer", "index.html"))
  overlay.once("ready-to-show", () => overlay.showInactive())

  if (!app.isPackaged) {
    overlay.webContents.on("console-message", (e) => console.log(`[renderer] ${e.message}`))
  }

  ownHwnd = overlay.getNativeWindowHandle().readBigUInt64LE(0)
}

// Окна Windows → прямоугольники в координатах нашего окна (DIP)
function sendWindows() {
  if (!overlay || overlay.isDestroyed()) return
  const b = screen.getPrimaryDisplay().bounds
  const list = tracker.list(ownHwnd).map((w) => {
    const r = screen.screenToDipRect(null, {
      x: w.left,
      y: w.top,
      width: w.right - w.left,
      height: w.bottom - w.top,
    })
    return {
      id: w.id,
      left: r.x - b.x,
      top: r.y - b.y,
      right: r.x + r.width - b.x,
      bottom: r.y + r.height - b.y,
    }
  })
  overlay.webContents.send("windows", list)
}

function onDisplayChanged() {
  if (!overlay) return
  overlay.setBounds(screen.getPrimaryDisplay().bounds)
  overlay.webContents.send("display", displayInfo())
}

// ---------- меню (по правому клику на Булька и в трее) ----------

function autostartEnabled() {
  return app.getLoginItemSettings().openAtLogin
}

function setAutostart(enabled) {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    })
  } else {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [app.getAppPath()],
    })
  }
}

function command(type, extra = {}) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send("command", { type, ...extra })
}

function cursorInOverlay() {
  const p = screen.getCursorScreenPoint()
  const b = screen.getPrimaryDisplay().bounds
  return { x: p.x - b.x, y: p.y - b.y }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: "Покормить 🍪", click: () => command("feed") },
    { label: "Позвать к курсору", click: () => command("call", cursorInOverlay()) },
    sleeping
      ? { label: "Разбудить", click: () => command("wake") }
      : { label: "Уложить спать", click: () => command("sleep") },
    { type: "separator" },
    {
      label: "Запускать вместе с Windows",
      type: "checkbox",
      checked: autostartEnabled(),
      click: (item) => setAutostart(item.checked),
    },
    { type: "separator" },
    { label: "Выход", click: () => app.quit() },
  ])
}

// ---------- IPC ----------

ipcMain.handle("get-display", () => displayInfo())

ipcMain.on("set-interactive", (_, interactive) => {
  if (!overlay) return
  if (interactive) overlay.setIgnoreMouseEvents(false)
  else overlay.setIgnoreMouseEvents(true, { forward: true })
})

ipcMain.on("show-menu", () => {
  buildMenu().popup({ window: overlay })
})

ipcMain.on("sleep-state", (_, value) => {
  sleeping = value
})

// иконку для трея рисует сам Бульк в renderer
ipcMain.on("tray-icon", (_, dataUrl) => {
  const icon = nativeImage.createFromDataURL(dataUrl)
  if (tray) {
    tray.setImage(icon)
    return
  }
  tray = new Tray(icon)
  tray.setToolTip("Бульк")
  tray.on("click", () => tray.popUpContextMenu(buildMenu()))
  tray.on("right-click", () => tray.popUpContextMenu(buildMenu()))
})

// ---------- старт ----------

app.whenReady().then(() => {
  tracker = createWindowTracker()
  createOverlay()
  setInterval(sendWindows, WINDOWS_POLL_MS)
  screen.on("display-metrics-changed", onDisplayChanged)
  screen.on("display-added", onDisplayChanged)
  screen.on("display-removed", onDisplayChanged)
})

app.on("window-all-closed", () => app.quit())
