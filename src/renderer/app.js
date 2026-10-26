// Renderer: цикл анимации, мышь, окна Windows как платформы

import { Pet, S } from "./pet.js"
import { drawBulk, drawBubble, drawCookie, drawZ, drawCrumb } from "./bulk-draw.js"

const api = window.bulkApi
const canvas = document.getElementById("stage")
const ctx = canvas.getContext("2d")

const world = {
  width: window.innerWidth,
  height: window.innerHeight,
  floorY: window.innerHeight - 48,
  topY: 0,
  winById: new Map(),
  platforms: [],
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  canvas.style.width = window.innerWidth + "px"
  canvas.style.height = window.innerHeight + "px"
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function applyDisplay(d) {
  world.width = d.width
  world.height = d.height
  world.floorY = d.floorY
  world.topY = d.topY
  resize()
}

// Верхние края окон → платформы. Перекрытые другими окнами куски вырезаем.
function subtract(segs, a, b) {
  const out = []
  for (const [x1, x2] of segs) {
    if (b <= x1 || a >= x2) out.push([x1, x2])
    else {
      if (a > x1) out.push([x1, a])
      if (b < x2) out.push([b, x2])
    }
  }
  return out
}

function computePlatforms(wins) {
  const plats = []
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i]
    // развёрнутые на весь экран и слишком низкие окна не годятся
    if (w.top < world.topY + 62 * S || w.top > world.floorY - 30) continue
    let segs = [[Math.max(0, w.left), Math.min(world.width, w.right)]]
    for (let j = 0; j < i; j++) {
      const a = wins[j]
      if (a.top < w.top && a.bottom >= w.top) segs = subtract(segs, a.left, a.right)
    }
    for (const [x1, x2] of segs) {
      if (x2 - x1 > 60) plats.push({ id: w.id, x1, x2, y: w.top })
    }
  }
  return plats
}

api.onWindows((list) => {
  world.winById = new Map(list.map((w) => [w.id, w]))
  world.platforms = computePlatforms(list)
})

api.onDisplay(applyDisplay)

const pet = new Pet(world, window.localStorage)
pet.onSleepChange = (v) => api.setSleeping(v)

api.onCommand((c) => {
  if (c.type === "feed") pet.feed()
  if (c.type === "call") pet.callTo(c.x, c.y)
  if (c.type === "sleep") pet.goSleep()
  if (c.type === "wake") pet.wake()
})

// ---------- мышь ----------
// Окно прозрачно для кликов, пока курсор не над Бульком.

let interactive = false
let pressed = null
let dragging = false
let lastMove = performance.now()

function setInteractive(v) {
  if (v === interactive) return
  interactive = v
  api.setInteractive(v)
}

window.addEventListener("mousemove", (e) => {
  const now = performance.now()
  const dt = (now - lastMove) / 1000
  lastMove = now
  pet.cursor = { x: e.clientX, y: e.clientY }

  if (pressed && !dragging && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 6) {
    dragging = true
    pet.startDrag(pressed.x, pressed.y)
  }
  if (dragging) {
    pet.dragTo(e.clientX, e.clientY, dt)
    return
  }
  setInteractive(pet.hitTest(e.clientX, e.clientY))
})

window.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !pet.hitTest(e.clientX, e.clientY)) return
  pressed = { x: e.clientX, y: e.clientY }
})

window.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return
  if (dragging) pet.release()
  else if (pressed) pet.click()
  pressed = null
  dragging = false
  setInteractive(pet.hitTest(e.clientX, e.clientY))
})

window.addEventListener("dblclick", () => pet.hop())

window.addEventListener("contextmenu", (e) => {
  e.preventDefault()
  if (pet.hitTest(e.clientX, e.clientY)) api.showMenu()
})

// ---------- рисование ----------

function render() {
  ctx.clearRect(0, 0, world.width, world.height)

  if (pet.cookie) drawCookie(ctx, pet.cookie.x, pet.cookie.y)
  for (const c of pet.crumbs) drawCrumb(ctx, c)

  const p = pet.pose()
  drawBulk(ctx, p, p.o)

  for (const z of pet.zs) drawZ(ctx, z)

  if (pet.bubble) {
    const b = pet.bubble
    const alpha = Math.min(1, b.t * 6, (b.dur - b.t) * 3)
    const d = pet.down
    const ax = pet.x - d[0] * 64 * S
    const ay = pet.y - d[1] * 64 * S
    drawBubble(ctx, ax, ay, b.text, alpha, world.width, pet.mode === "ceiling")
  }
}

// иконка для трея — нарисованный Бульк
function makeTrayIcon() {
  const c = document.createElement("canvas")
  c.width = 32
  c.height = 32
  const g = c.getContext("2d")
  drawBulk(
    g,
    { x: 16, y: 31, angle: 0, scale: 0.55 },
    { face: "happy", look: [0, 0], sx: 1, sy: 1, lift: 0, liftL: 0, liftR: 0, leaf: 0, blink: false, time: 0, shadow: false }
  )
  api.setTrayIcon(c.toDataURL("image/png"))
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  pet.update(dt)
  render()
  requestAnimationFrame(frame)
}

async function start() {
  applyDisplay(await api.getDisplay())
  window.addEventListener("resize", resize)
  makeTrayIcon()
  pet.speak("привет! я Бульк 💚", 3)
  requestAnimationFrame(frame)
}

start()
