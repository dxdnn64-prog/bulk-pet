// Рисование Булька и всего вокруг него на canvas

export const COL = {
  body: "#8EE3C8",
  bodyDark: "#4DB894",
  outline: "#2E7D66",
  leaf: "#7BD35A",
  stem: "#4E9A36",
  pupil: "#1B1B2F",
  blush: "rgba(255,143,163,0.6)",
  mouth: "#5A2236",
}

function ell(ctx, x, y, rx, ry, color) {
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function poly(ctx, pts, color, w) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.stroke()
}

function quad(ctx, x1, y1, cx, cy, x2, y2, color, w) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(cx, cy, x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = "round"
  ctx.stroke()
}

// p: { x, y, angle, scale } — точка касания опоры и поворот ("низ" Булька смотрит в опору)
// o: { face, look, sx, sy, lift, liftL, liftR, leaf, blink, chew, shadow }
// Лица: happy, tired, sleep, surprised, strain, joy, sad, eat
export function drawBulk(ctx, p, o) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.angle)
  ctx.scale(p.scale, p.scale)

  if (o.shadow !== false) {
    ell(ctx, 0, -1, Math.max(6, 16 * o.sx - o.lift * 0.3), 3, "rgba(0,0,0,0.25)")
  }

  ctx.translate(0, -o.lift)
  ctx.scale(o.sx, o.sy)

  // лапки
  ell(ctx, -8, -3 - o.liftL, 6, 3.5, COL.bodyDark)
  ell(ctx, 8, -3 - o.liftR, 6, 3.5, COL.bodyDark)

  // тело-капелька
  ctx.beginPath()
  ctx.moveTo(-18, -10)
  ctx.bezierCurveTo(-20, -27, -9, -38, 0, -42)
  ctx.bezierCurveTo(9, -38, 20, -27, 18, -10)
  ctx.bezierCurveTo(17, -4, 8, -3, 0, -3)
  ctx.bezierCurveTo(-8, -3, -17, -4, -18, -10)
  ctx.closePath()
  ctx.fillStyle = COL.body
  ctx.fill()
  ctx.strokeStyle = COL.outline
  ctx.lineWidth = 1.6
  ctx.stroke()
  ell(ctx, -9, -29, 2.5, 4.5, "rgba(255,255,255,0.55)")

  // росток (покачивается)
  ctx.save()
  ctx.translate(0, -42)
  ctx.rotate(o.leaf)
  ctx.translate(0, 42)
  quad(ctx, 0, -42, -1, -46, 2, -49, COL.stem, 2)
  ctx.fillStyle = COL.leaf
  ctx.beginPath()
  ctx.moveTo(2, -49)
  ctx.bezierCurveTo(4, -55, 9, -57, 12, -53)
  ctx.bezierCurveTo(11, -49, 6, -47, 2, -49)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(1, -47)
  ctx.bezierCurveTo(-1, -52, -5, -53, -6, -51)
  ctx.bezierCurveTo(-6, -48, -3, -46, 1, -47)
  ctx.fill()
  ctx.restore()

  // румянец
  const bl = o.face === "joy" || o.face === "eat" ? 1.3 : 1
  ell(ctx, -12.5, -15, 3.5 * bl, 2 * bl, COL.blush)
  ell(ctx, 12.5, -15, 3.5 * bl, 2 * bl, COL.blush)

  // глаза
  const px = o.look[0] * 1.6
  const py = o.look[1] * 1.6
  for (const ex of [-7, 7]) {
    if (o.face === "sleep") {
      quad(ctx, ex - 4, -22, ex, -18.5, ex + 4, -22, COL.outline, 1.6)
      continue
    }
    if (o.face === "joy" || o.face === "eat") {
      quad(ctx, ex - 4, -21, ex, -27, ex + 4, -21, COL.outline, 1.8)
      continue
    }
    if (o.face === "strain") {
      const d = ex < 0 ? 1 : -1
      poly(ctx, [[ex - 3 * d, -26], [ex + 2.5 * d, -22.5], [ex - 3 * d, -19]], COL.outline, 1.8)
      continue
    }
    if (o.blink) {
      poly(ctx, [[ex - 4, -22.5], [ex + 4, -22.5]], COL.outline, 1.6)
      continue
    }
    const big = o.face === "surprised"
    ell(ctx, ex, -23, big ? 5.5 : 5, big ? 6.8 : 6, "#FFFFFF")
    ell(ctx, ex + px, -22 + py, big ? 2 : 2.8, big ? 2.3 : 3.2, COL.pupil)
    ell(ctx, ex + px - 0.8, -24 + py, 0.9, 0.9, "#FFFFFF")
    if (o.face === "tired") {
      ctx.beginPath()
      ctx.moveTo(ex - 6, -22.5)
      ctx.bezierCurveTo(ex - 6, -31.5, ex + 6, -31.5, ex + 6, -22.5)
      ctx.closePath()
      ctx.fillStyle = COL.body
      ctx.fill()
      poly(ctx, [[ex - 5.5, -22.5], [ex + 5.5, -22.5]], COL.outline, 1.4)
    }
  }

  // рот
  if (o.face === "sleep") {
    ell(ctx, 0, -13, 1.8, 2.2 + Math.sin(o.time * 2) * 0.4, COL.mouth)
  } else if (o.face === "surprised") {
    ell(ctx, 0, -12.5, 2.6, 3.2, COL.mouth)
  } else if (o.face === "tired") {
    poly(ctx, [[-3, -13.5], [3, -13.5]], COL.mouth, 1.6)
  } else if (o.face === "strain") {
    poly(ctx, [[-5, -13.5], [5, -13.5]], COL.mouth, 2)
  } else if (o.face === "sad") {
    quad(ctx, -3.5, -12, 0, -16, 3.5, -12, COL.mouth, 1.6)
  } else if (o.face === "eat") {
    const open = Math.abs(Math.sin(o.time * 14))
    ell(ctx, 0, -13, 3, 0.6 + open * 2.4, COL.mouth)
  } else {
    ctx.beginPath()
    ctx.moveTo(-4, -15)
    ctx.quadraticCurveTo(0, -8, 4, -15)
    ctx.closePath()
    ctx.fillStyle = COL.mouth
    ctx.fill()
  }

  ctx.restore()
}

// Облачко с репликой. (x, y) — куда указывает хвостик; below — рисовать под точкой
export function drawBubble(ctx, x, y, text, alpha, screenW, below = false) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = "600 14px 'Segoe UI', sans-serif"
  const w = ctx.measureText(text).width + 22
  const h = 30
  let bx = Math.min(Math.max(x - w / 2, 6), screenW - w - 6)
  let by = y - h - 10
  const tailUp = below || by < 4
  if (tailUp) by = y + 10

  ctx.fillStyle = "rgba(255,255,255,0.96)"
  ctx.strokeStyle = "rgba(46,125,102,0.9)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(bx, by, w, h, 12)
  ctx.fill()
  ctx.stroke()

  // хвостик
  const tx = Math.min(Math.max(x, bx + 14), bx + w - 14)
  ctx.beginPath()
  if (tailUp) {
    ctx.moveTo(tx - 6, by + 1)
    ctx.lineTo(x, y + 2)
    ctx.lineTo(tx + 6, by + 1)
  } else {
    ctx.moveTo(tx - 6, by + h - 1)
    ctx.lineTo(x, y - 2)
    ctx.lineTo(tx + 6, by + h - 1)
  }
  ctx.fill()

  ctx.fillStyle = "#1B1B2F"
  ctx.textBaseline = "middle"
  ctx.fillText(text, bx + 11, by + h / 2 + 1)
  ctx.restore()
}

export function drawCookie(ctx, x, y, r = 9) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y - r, r, 0, Math.PI * 2)
  ctx.fillStyle = "#D9A066"
  ctx.fill()
  ctx.strokeStyle = "#A8733F"
  ctx.lineWidth = 1.2
  ctx.stroke()
  for (const [dx, dy] of [[-3.5, -2.5], [2.5, -4], [1.5, 2.5], [-2.5, 3.5], [4.5, 1]]) {
    ell(ctx, x + dx, y - r + dy, 1.4, 1.4, "#6B3E26")
  }
  ctx.restore()
}

export function drawZ(ctx, z) {
  ctx.save()
  ctx.font = `bold ${Math.round(12 + z.age * 6)}px 'Segoe UI', sans-serif`
  ctx.fillStyle = `rgba(46,125,102,${Math.max(0, 0.85 - z.age / 3.2)})`
  ctx.fillText("z", z.x, z.y)
  ctx.restore()
}

export function drawCrumb(ctx, c) {
  ell(ctx, c.x, c.y, 1.6, 1.6, `rgba(217,160,102,${Math.max(0, 1 - c.age / 1.2)})`)
}
