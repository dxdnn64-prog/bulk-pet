// Бульк: физика (ходьба по полу, стенам, потолку и окнам, падение, бросок) и поведение

export const S = 1.4          // масштаб персонажа
const WALK = 70               // скорость ходьбы, px/s
const CLIMB = 55              // скорость лазания по стене
const GRAVITY = 1900
const HUNGRY_AFTER = 3 * 60 * 60 * 1000

const PHRASES = [
  "бульк!", "я тут гуляю", "как дела?", "работаешь? я тоже... почти",
  "хочу на ручки", "тут уютно", "ля-ля-ля", "не забудь попить водички",
]
const WINDOW_PHRASES = ["отличный вид отсюда!", "это окно теперь моё", "тут высоко..."]
const EVENING_PHRASES = ["уф, вечер", "скоро спать", "зеваю..."]
const HUNGRY_PHRASES = ["кушать хочу...", "покорми меня 🥺", "где моя печенька?"]
const GIGGLE_PHRASES = ["хи-хи!", "щекотно!", "бульк!", "эй!"]

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function hour() {
  return new Date().getHours()
}
const isNight = () => hour() >= 23 || hour() < 7
const isEvening = () => hour() >= 19 && hour() < 23

// вектор экрана → локальные координаты Булька (x — вправо, y — к опоре)
function toLocal(vx, vy, down) {
  return [vx * down[1] - vy * down[0], vx * down[0] + vy * down[1]]
}

function angleDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export class Pet {
  constructor(world, storage) {
    this.world = world
    this.storage = storage

    this.x = world.width * 0.5
    this.y = 60 * S
    this.mode = "air"          // ground | wall | ceiling | air | drag
    this.surface = null        // "floor" или id окна
    this.relX = 0              // смещение от левого края окна, на котором стоим
    this.side = 0              // стена: -1 левая, 1 правая
    this.dir = 1               // направление движения вдоль опоры
    this.vx = 0
    this.vy = 0
    this.angle = 0

    this.act = "walk"
    this.actT = 0
    this.actDur = 0
    this.thinkT = 2
    this.target = null
    this.react = null          // { face, t } — реакция поверх любого режима
    this.squash = 0

    this.time = 0
    this.phase = 0
    this.blinkT = 2
    this.blinking = 0

    this.bubble = null
    this.zs = []
    this.crumbs = []
    this.cookie = null
    this.drag = null

    this.lastFed = Number(storage.getItem("lastFed")) || Date.now()
    this.onSleepChange = () => {}
    this.cursor = { x: -9999, y: -9999 }
  }

  // ---------- вспомогательное ----------

  get down() {
    if (this.mode === "ceiling") return [0, -1]
    if (this.mode === "wall") return [this.side, 0]
    return [0, 1]
  }

  head() {
    const d = this.down
    return { x: this.x - d[0] * 26 * S, y: this.y - d[1] * 26 * S }
  }

  hitTest(x, y) {
    const h = this.head()
    return Math.hypot(x - h.x, y - h.y) < 30 * S
  }

  hungry() {
    return Date.now() - this.lastFed > HUNGRY_AFTER
  }

  speak(text, dur = 3) {
    this.bubble = { text, t: 0, dur }
  }

  setAct(name, dur = 0) {
    if (this.act === "sleep" && name !== "sleep") this.onSleepChange(false)
    if (name === "sleep" && this.act !== "sleep") this.onSleepChange(true)
    this.act = name
    this.actT = 0
    this.actDur = dur
  }

  // ---------- переходы между опорами ----------

  fall(text) {
    // со стены/потолка сначала "отлипаем" внутрь экрана
    if (this.mode === "wall") {
      this.x = this.side < 0 ? 22 * S : this.world.width - 22 * S
      this.vx = -this.side * 80
    }
    if (this.mode === "ceiling") this.y = 60 * S
    this.mode = "air"
    this.surface = null
    if (text) this.speak(text, 2)
    if (this.act === "sleep" || this.act === "sit") this.setAct("walk")
  }

  jump(vx, vy, text) {
    this.mode = "air"
    this.surface = null
    this.vx = vx
    this.vy = vy
    if (text) this.speak(text, 1.5)
  }

  // прыжок так, чтобы приземлиться в точку (x, y) сверху
  jumpTo(x, y, text) {
    const rise = Math.max(30, this.y - y + 50)
    const vy = -Math.sqrt(2 * GRAVITY * rise)
    const tUp = -vy / GRAVITY
    const tDown = Math.sqrt((2 * (rise - (this.y - y))) / GRAVITY)
    this.jump((x - this.x) / (tUp + tDown), vy, text)
  }

  land(p) {
    const impact = this.vy
    this.mode = "ground"
    this.surface = p.id
    this.y = p.y
    if (p.id !== "floor") this.relX = this.x - this.world.winById.get(p.id).left
    this.vx = 0
    this.vy = 0
    this.squash = Math.min(1, impact / 1300)
    if (impact > 1500) {
      this.setAct("dizzy", 1.8)
      this.speak(pick(["ой-ой-ой", "больно...", "голова кружится"]), 2)
    } else if (this.target) {
      this.setAct("toTarget")
    } else {
      this.setAct("land", 0.3)
    }
  }

  // самая верхняя опора под точкой (x, y)
  surfaceBelow(x, y) {
    let best = { id: "floor", y: this.world.floorY }
    for (const p of this.world.platforms) {
      if (x >= p.x1 && x <= p.x2 && p.y >= y && p.y < best.y) best = p
    }
    return best
  }

  // ---------- команды из меню и мыши ----------

  click() {
    if (this.act === "sleep") {
      this.setAct("idle", 2.5)
      this.react = { face: "tired", t: 1.5 }
      this.speak("ммм?.. я не сплю", 2.5)
      return
    }
    this.react = { face: "joy", t: 1.2 }
    this.speak(pick(GIGGLE_PHRASES), 1.5)
  }

  hop() {
    if (this.mode !== "ground") return
    this.jump(this.dir * 140, -650, "хоп!")
  }

  startDrag(cx, cy) {
    if (this.act === "sleep") this.setAct("walk")
    this.mode = "drag"
    this.surface = null
    this.target = null
    this.drag = { dx: this.x - cx, dy: this.y - cy, lastX: cx, lastY: cy }
    this.vx = 0
    this.vy = 0
    this.speak(pick(["ой!", "куда?!", "на ручки!"]), 1.5)
  }

  dragTo(cx, cy, dt) {
    if (!this.drag) return
    const nx = cx + this.drag.dx
    const ny = cy + this.drag.dy
    if (dt > 0) {
      this.vx = this.vx * 0.6 + ((nx - this.x) / dt) * 0.4
      this.vy = this.vy * 0.6 + ((ny - this.y) / dt) * 0.4
    }
    this.x = nx
    this.y = ny
  }

  release() {
    this.drag = null
    this.mode = "air"
    this.vx = clamp(this.vx, -2500, 2500)
    this.vy = clamp(this.vy, -2500, 2500)
    if (Math.hypot(this.vx, this.vy) > 900) this.speak("уиииии!", 1.5)
  }

  feed() {
    const w = this.world
    this.cookie = {
      x: clamp(this.x + this.dir * 160, 40, w.width - 40),
      y: 0,
      vy: 0,
      surface: null,
      relX: 0,
      t: 0,
    }
    if (this.act === "sleep") this.setAct("walk")
    this.speak("еда?!", 1.5)
    if (this.mode === "wall" || this.mode === "ceiling") this.fall()
  }

  callTo(x, y) {
    if (this.act === "sleep") this.setAct("walk")
    const p = this.surfaceBelow(x, y)
    this.target = { x, surface: p.id, y: p.y }
    this.speak("иду!", 1.5)
    if (this.mode === "wall" || this.mode === "ceiling") this.fall()
    else if (this.mode === "ground") this.setAct("toTarget")
  }

  goSleep() {
    if (this.mode !== "ground") this.fall()
    this.target = null
    this.setAct("sleep")
    this.speak("спокойной ночи...", 2)
  }

  wake() {
    if (this.act !== "sleep") return
    this.setAct("idle", 2)
    this.speak("доброе утро!", 2)
  }

  // ---------- главный цикл ----------

  update(dt) {
    this.dtLast = dt
    this.time += dt
    this.actT += dt
    this.squash = Math.max(0, this.squash - dt * 3)

    if (this.act !== "sleep") {
      this.blinkT -= dt
      if (this.blinkT < 0) {
        this.blinking = 0.13
        this.blinkT = 2 + Math.random() * 4
      }
      this.blinking = Math.max(0, this.blinking - dt)
    }

    if (this.react) {
      this.react.t -= dt
      if (this.react.t <= 0) this.react = null
    }

    if (this.bubble) {
      this.bubble.t += dt
      if (this.bubble.t > this.bubble.dur) this.bubble = null
    }

    // пока реагирует на клик — стоит на месте
    if (!this.react || this.mode === "air" || this.mode === "drag") {
      if (this.mode === "ground") this.updateGround(dt)
      else if (this.mode === "wall") this.updateWall(dt)
      else if (this.mode === "ceiling") this.updateCeiling(dt)
      else if (this.mode === "air") this.updateAir(dt)
    }

    this.updateCookie(dt)
    this.updateParticles(dt)
  }

  // ---------- по полу и по окнам ----------

  updateGround(dt) {
    const w = this.world
    let x1 = 0
    let x2 = w.width
    let win = null

    if (this.surface === "floor") {
      this.y = w.floorY
    } else {
      win = w.winById.get(this.surface)
      if (!win) return this.fall(pick(["ааа!", "куда делось окно?!"]))
      this.x = win.left + this.relX
      this.y = win.top
      const seg = w.platforms.find((p) => p.id === this.surface && this.x >= p.x1 - 1 && this.x <= p.x2 + 1)
      if (!seg) return this.fall("ой-ой!")
      x1 = seg.x1
      x2 = seg.x2
    }

    // временные состояния
    if (["land", "dizzy", "idle", "sit", "eat"].includes(this.act) && this.actDur && this.actT > this.actDur) {
      if (this.act === "eat") this.speak("спасибо! 💚", 2)
      this.setAct(this.target ? "toTarget" : "walk")
    }

    if (this.act === "sleep") {
      if (!isNight() && this.actT > 30 && Math.random() < dt / 20) this.wake()
      return
    }

    // идём к печеньке, если она лежит
    if (this.cookie && this.cookie.surface && this.act !== "eat") {
      const c = this.cookie
      this.target = { x: c.x, surface: c.surface, y: c.y, cookie: true }
      if (this.act !== "toTarget" && this.act !== "dizzy") this.setAct("toTarget")
    }

    const margin = 14 * S

    if (this.act === "walk" || this.act === "toTarget") {
      if (this.act === "toTarget" && this.target) {
        const t = this.target
        const dx = t.x - this.x
        const sameSurface = t.surface === this.surface
        if (sameSurface && Math.abs(dx) < 6) {
          return this.arrive()
        }
        // цель выше и почти над нами — прыгаем на неё
        if (!sameSurface && t.y < this.y - 10 && Math.abs(dx) < 140) {
          return this.jumpTo(t.x, t.y, "хоп!")
        }
        this.dir = dx >= 0 ? 1 : -1
      }

      let nx = this.x + this.dir * WALK * dt
      if (nx < x1 + margin || nx > x2 - margin) {
        const atLeft = nx < x1 + margin
        if (this.act === "toTarget" && this.target && this.target.y > this.y && win) {
          // цель ниже — спрыгиваем с окна в её сторону
          this.x = nx
          this.vx = this.dir * 110
          this.vy = -150
          return this.fall("вжух!")
        }
        if (!win && this.act === "walk" && Math.random() < 0.6) {
          // край экрана — лезем на стену
          this.mode = "wall"
          this.side = atLeft ? -1 : 1
          this.x = atLeft ? 0 : w.width
          this.y = w.floorY - 22 * S
          this.dir = -1
          return
        }
        if (win && this.act === "walk" && Math.random() < 0.35) {
          this.x = nx
          this.vx = this.dir * 90
          this.vy = -120
          return this.fall(pick(["вжух!", "прыг!"]))
        }
        this.dir = atLeft ? 1 : -1
        nx = clamp(nx, x1 + margin, x2 - margin)
      }
      this.x = nx
      this.phase += dt * 10
      if (win) this.relX = this.x - win.left
    }

    this.thinkT -= dt
    if (this.thinkT <= 0 && this.act !== "toTarget") {
      this.thinkT = 3 + Math.random() * 5
      this.thinkGround(win)
    }
  }

  arrive() {
    const t = this.target
    this.target = null
    if (t && t.cookie && this.cookie) {
      this.cookie = null
      this.setAct("eat", 2)
      this.speak("ням-ням!", 2)
      this.lastFed = Date.now()
      this.storage.setItem("lastFed", String(this.lastFed))
      for (let i = 0; i < 6; i++) {
        this.crumbs.push({
          x: this.x + (Math.random() - 0.5) * 30,
          y: this.y - 14 * S,
          vx: (Math.random() - 0.5) * 120,
          vy: -Math.random() * 160,
          floor: this.y,
          age: 0,
        })
      }
      return
    }
    this.setAct("idle", 2)
  }

  thinkGround(win) {
    if (this.act === "dizzy" || this.act === "eat" || this.act === "land") return

    if (isNight() && Math.random() < 0.4) return this.goSleep()

    const r = Math.random()
    if (this.hungry() && r < 0.2) {
      this.speak(pick(HUNGRY_PHRASES), 3)
      return this.setAct("idle", 2.5)
    }
    if (r < 0.35) {
      if (Math.random() < 0.3) this.dir = -this.dir
      return this.setAct("walk")
    }
    if (r < 0.48) return this.setAct("idle", 2.5)
    if (r < 0.56) return this.setAct("sit", 5)
    if (r < 0.64) return this.hop()
    if (r < 0.74) {
      // запрыгнуть на окно сверху, если оно рядом
      const p = this.world.platforms.find(
        (p) => p.y < this.y - 40 && p.y > this.y - 380 && Math.abs((p.x1 + p.x2) / 2 - this.x) < 300
      )
      if (p) return this.jumpTo(clamp(this.x, p.x1 + 30, p.x2 - 30), p.y, "туда!")
    }
    if (r < 0.82 && Math.abs(this.cursor.y - this.y) < 200) {
      this.target = { x: clamp(this.cursor.x, 30, this.world.width - 30), surface: this.surface, y: this.y }
      this.speak("что там у тебя?", 2)
      return this.setAct("toTarget")
    }
    const pool = win ? WINDOW_PHRASES : isEvening() ? EVENING_PHRASES : PHRASES
    this.speak(pick(pool), 3)
    this.setAct("walk")
  }

  // ---------- стены и потолок ----------

  updateWall(dt) {
    const w = this.world
    this.x = this.side < 0 ? 0 : w.width
    if (this.act !== "idle" || this.actT > this.actDur) {
      if (this.act === "idle") this.setAct("walk")
      this.y += this.dir * CLIMB * dt
      this.phase += dt * 9
    }

    if (this.y < 22 * S) {
      this.mode = "ceiling"
      this.y = 0
      this.x = this.side < 0 ? 22 * S : w.width - 22 * S
      this.dir = this.side < 0 ? 1 : -1
      return
    }
    if (this.y > w.floorY - 22 * S && this.dir > 0) {
      this.mode = "ground"
      this.surface = "floor"
      this.y = w.floorY
      this.x = this.side < 0 ? 22 * S : w.width - 22 * S
      this.dir = this.side < 0 ? 1 : -1
      return
    }

    this.thinkT -= dt
    if (this.thinkT <= 0) {
      this.thinkT = 3 + Math.random() * 4
      const r = Math.random()
      if (r < 0.15 || isNight()) return this.fall("аай!")
      if (r < 0.35) return this.setAct("idle", 1.5)
      if (r < 0.45) this.dir = -this.dir
    }
  }

  updateCeiling(dt) {
    const w = this.world
    this.y = 0
    this.x += this.dir * WALK * dt
    this.phase += dt * 10

    if (this.x < 22 * S || this.x > w.width - 22 * S) {
      this.mode = "wall"
      this.side = this.x < w.width / 2 ? -1 : 1
      this.y = 22 * S
      this.dir = 1
      return
    }

    this.thinkT -= dt
    if (this.thinkT <= 0) {
      this.thinkT = 3 + Math.random() * 4
      if (Math.random() < 0.3 || isNight()) this.fall(pick(["ой!", "отклеился!"]))
      else if (Math.random() < 0.3) this.speak("я вверх ногами!", 2)
    }
  }

  // ---------- полёт ----------

  updateAir(dt) {
    const w = this.world
    const prevY = this.y
    this.vy += GRAVITY * dt
    this.x += this.vx * dt
    this.y += this.vy * dt

    const m = 16 * S
    if (this.x < m) {
      this.x = m
      this.vx = Math.abs(this.vx) * 0.5
    }
    if (this.x > w.width - m) {
      this.x = w.width - m
      this.vx = -Math.abs(this.vx) * 0.5
    }
    if (this.y < 58 * S && this.vy < 0) {
      this.y = 58 * S
      this.vy = -this.vy * 0.3
    }

    if (this.vy > 0) {
      let best = null
      for (const p of w.platforms) {
        if (prevY <= p.y + 0.5 && this.y >= p.y && this.x >= p.x1 && this.x <= p.x2 && (!best || p.y < best.y)) {
          best = p
        }
      }
      if (!best && this.y >= w.floorY) best = { id: "floor", y: w.floorY }
      if (best) this.land(best)
    }
  }

  // ---------- печенька и частицы ----------

  updateCookie(dt) {
    const c = this.cookie
    if (!c) return
    const w = this.world
    c.t += dt
    if (c.t > 25) {
      this.cookie = null
      this.target = null
      this.speak("эх, не успел...", 2)
      return
    }

    if (c.surface) {
      if (c.surface === "floor") {
        c.y = w.floorY
        return
      }
      const win = w.winById.get(c.surface)
      const seg = win && w.platforms.find((p) => p.id === c.surface && win.left + c.relX >= p.x1 && win.left + c.relX <= p.x2)
      if (!seg) {
        c.surface = null
        return
      }
      c.x = win.left + c.relX
      c.y = win.top
      return
    }

    const prevY = c.y
    c.vy += GRAVITY * dt
    c.y += c.vy * dt
    let best = null
    for (const p of w.platforms) {
      if (prevY <= p.y + 0.5 && c.y >= p.y && c.x >= p.x1 && c.x <= p.x2 && (!best || p.y < best.y)) best = p
    }
    if (!best && c.y >= w.floorY) best = { id: "floor", y: w.floorY }
    if (best) {
      c.surface = best.id
      c.y = best.y
      c.vy = 0
      if (best.id !== "floor") c.relX = c.x - w.winById.get(best.id).left
    }
  }

  updateParticles(dt) {
    if (this.act === "sleep") {
      this.zTimer = (this.zTimer || 0) - dt
      if (this.zTimer < 0) {
        this.zTimer = 1.1
        const h = this.head()
        this.zs.push({ x: h.x + 14 * S, y: h.y - 8 * S, age: 0 })
      }
    }
    for (const z of this.zs) {
      z.age += dt
      z.y -= 18 * dt
      z.x += 8 * dt + Math.sin(z.age * 3) * 0.3
    }
    this.zs = this.zs.filter((z) => z.age < 3)

    for (const c of this.crumbs) {
      c.age += dt
      c.vy += GRAVITY * dt
      c.x += c.vx * dt
      c.y = Math.min(c.floor, c.y + c.vy * dt)
    }
    this.crumbs = this.crumbs.filter((c) => c.age < 1.2)
  }

  // ---------- как его сейчас нарисовать ----------

  pose() {
    const d = this.down
    let targetAngle = Math.atan2(-d[0], d[1])
    const h = this.head()

    const o = {
      face: isEvening() ? "tired" : "happy",
      look: [0, 0],
      sx: 1,
      sy: 1,
      lift: 0,
      liftL: 0,
      liftR: 0,
      leaf: Math.sin(this.time * 2.5) * 0.12,
      blink: this.blinking > 0,
      time: this.time,
    }

    // куда смотрит: на курсор, если он рядом, иначе — по ходу движения
    const cdx = this.cursor.x - h.x
    const cdy = this.cursor.y - h.y
    if (Math.hypot(cdx, cdy) < 400) {
      const l = toLocal(cdx, cdy, d)
      const n = Math.hypot(l[0], l[1]) || 1
      o.look = [l[0] / n, l[1] / n]
    } else if (this.mode === "wall") {
      o.look = toLocal(0, this.dir, d)
    } else {
      o.look = toLocal(this.dir, 0, d)
    }

    const walking =
      ((this.mode === "ground" && (this.act === "walk" || this.act === "toTarget")) ||
        this.mode === "ceiling" ||
        (this.mode === "wall" && this.act !== "idle")) &&
      !this.react
    if (walking) {
      const s = Math.sin(this.phase)
      o.liftL = s > 0 ? s * 3 : 0
      o.liftR = s < 0 ? -s * 3 : 0
      o.sy = 1 + 0.05 * Math.sin(this.phase * 2)
      o.sx = 1 - 0.04 * Math.sin(this.phase * 2)
    }

    if (this.mode === "air") {
      targetAngle = clamp(this.vx * 0.0006, -0.5, 0.5)
      o.face = "surprised"
      o.sy = 1 + Math.min(0.25, Math.abs(this.vy) / 4000)
      o.sx = 1 / o.sy
      o.liftL = 2 + Math.sin(this.time * 20) * 2
      o.liftR = 2 - Math.sin(this.time * 20) * 2
    } else if (this.mode === "drag") {
      targetAngle = clamp(-this.vx * 0.0005, -0.6, 0.6)
      o.face = Math.hypot(this.vx, this.vy) > 600 ? "joy" : "surprised"
      o.sy = 1.15
      o.sx = 0.9
      o.liftL = 2 + Math.sin(this.time * 12) * 2.5
      o.liftR = 2 - Math.sin(this.time * 12) * 2.5
      o.shadow = false
    } else if (this.act === "sleep") {
      o.face = "sleep"
      o.sy = 0.92 + 0.04 * Math.sin(this.time * 2)
      o.sx = 1.06 - 0.03 * Math.sin(this.time * 2)
      o.leaf = Math.sin(this.time) * 0.08 - 0.25
    } else if (this.act === "sit") {
      o.sy = 0.9
      o.sx = 1.08
      o.look = [Math.sin(this.time * 0.7) * 0.6, 0]
    } else if (this.act === "idle" && this.mode === "ground") {
      o.look = [Math.sin(this.actT * 2.5), -0.2]
    } else if (this.act === "dizzy") {
      o.face = "tired"
      targetAngle += Math.sin(this.time * 9) * 0.18
      o.look = [Math.cos(this.time * 8), Math.sin(this.time * 8)]
    } else if (this.act === "eat") {
      o.face = "eat"
    }

    if (this.hungry() && o.face === "happy" && this.act === "idle") o.face = "sad"
    if (this.squash > 0) {
      o.sy *= 1 - 0.35 * this.squash
      o.sx *= 1 + 0.3 * this.squash
    }

    if (this.react) {
      o.face = this.react.face
      if (this.react.face === "joy") {
        o.sx *= 1 + 0.06 * Math.sin(this.time * 30)
        o.sy *= 1 - 0.06 * Math.sin(this.time * 30)
      }
    }

    // плавный поворот на углах
    this.angle += angleDiff(targetAngle, this.angle) * Math.min(1, this.dtLast * 14 || 1)

    return { x: this.x, y: this.y, angle: this.angle, scale: S, o }
  }
}
