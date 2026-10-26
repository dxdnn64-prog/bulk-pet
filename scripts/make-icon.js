// Рисует иконку приложения из того же кода, что и самого Булька: build/icon.png (512×512)
// Запуск: npm run icon

const { app, BrowserWindow } = require("electron")
const fs = require("fs")
const path = require("path")

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadFile(path.join(__dirname, "icon.html"))
  const dataUrl = await win.webContents.executeJavaScript("window.iconData")

  const out = path.join(__dirname, "..", "build", "icon.png")
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"))
  console.log(`icon saved: ${out}`)
  app.quit()
})
