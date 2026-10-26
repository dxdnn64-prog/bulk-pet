// Мотиватор: если ты долго ничего не делаешь, Бульк предлагает заняться чем-то полезным

import { MOTIVATION, READING, QUESTIONS } from "./content.js"
import { S } from "./pet.js"

const SNOOZE_MS = 30 * 60 * 1000
const CARD_W = 300

const pick = (a) => a[Math.floor(Math.random() * a.length)]

function shuffled(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
}

export class Coach {
  constructor(pet, world, api, idleSeconds) {
    this.pet = pet
    this.world = world
    this.api = api
    this.idleSeconds = idleSeconds
    this.el = document.getElementById("card")
    this.open = false
    this.idleNotified = false
    this.snoozeUntil = 0
    this.deck = []
    this.question = null

    this.el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]")
      if (btn) this.handle(btn.dataset.action, btn.dataset.arg)
    })
  }

  // ---------- реакция на бездействие ----------

  onIdle(seconds) {
    const night = new Date().getHours() >= 23 || new Date().getHours() < 7
    if (seconds >= this.idleSeconds) {
      if (!this.idleNotified && !this.open && !night && Date.now() > this.snoozeUntil) {
        this.idleNotified = true
        this.motivate()
      }
    } else if (seconds < 10 && this.idleNotified) {
      this.idleNotified = false
      if (this.open) this.pet.react = { face: "joy", t: 1.2 }
    }
  }

  // ---------- экраны карточки ----------

  motivate() {
    this.show(`
      <p class="title">${esc(pick(MOTIVATION))}</p>
      <div class="buttons">
        <button data-action="claude">🤖 Поучиться с Claude</button>
        <button data-action="question">💼 Вопрос к собеседованию</button>
        <button data-action="reading">📚 Что почитать</button>
        <button data-action="later" class="ghost">Позже</button>
      </div>`)
  }

  nextQuestion() {
    if (!this.deck.length) this.deck = shuffled(QUESTIONS)
    this.question = this.deck.pop()
    this.show(`
      <p class="label">Вопрос к собеседованию</p>
      <p class="title">${esc(this.question.q)}</p>
      <p class="hint">Попробуй ответить вслух, а потом проверь себя 😉</p>
      <div class="buttons">
        <button data-action="answer">Показать ответ</button>
        <button data-action="question" class="ghost">Другой вопрос</button>
        <button data-action="close" class="ghost">Закрыть</button>
      </div>`)
  }

  showAnswer() {
    if (!this.question) return
    this.pet.react = { face: "joy", t: 1 }
    this.show(`
      <p class="label">Вопрос к собеседованию</p>
      <p class="title">${esc(this.question.q)}</p>
      <p class="answer">${esc(this.question.a)}</p>
      <div class="buttons">
        <button data-action="question">Ещё вопрос</button>
        <button data-action="close" class="ghost">Хватит на сегодня</button>
      </div>`)
  }

  reading() {
    const items = shuffled(READING).slice(0, 3)
    this.show(`
      <p class="title">Вот что можно почитать:</p>
      <div class="buttons">
        ${items.map((r) => `<button data-action="open" data-arg="${esc(r.url)}">${esc(r.title)}</button>`).join("")}
        <button data-action="close" class="ghost">Закрыть</button>
      </div>`)
  }

  handle(action, arg) {
    if (action === "claude") {
      this.api.openUrl("https://claude.ai/new")
      this.close("удачи! я в тебя верю 💚")
    } else if (action === "question") {
      this.nextQuestion()
    } else if (action === "answer") {
      this.showAnswer()
    } else if (action === "reading") {
      this.reading()
    } else if (action === "open") {
      this.api.openUrl(arg)
      this.close("приятного чтения 📖")
    } else if (action === "later") {
      this.snoozeUntil = Date.now() + SNOOZE_MS
      this.close("ладно... но я ещё вернусь 👀")
    } else if (action === "close") {
      this.close("молодец! 💪")
    }
  }

  show(html) {
    this.el.innerHTML = html
    this.el.hidden = false
    this.open = true
    this.pet.bubble = null
    if (this.pet.act === "sleep") this.pet.setAct("walk")
    if (this.pet.mode === "wall" || this.pet.mode === "ceiling") this.pet.fall()
  }

  close(text) {
    this.el.hidden = true
    this.open = false
    this.question = null
    if (this.pet.act === "coach") this.pet.setAct("walk")
    if (text) this.pet.speak(text, 2.5)
  }

  hitTest(x, y) {
    if (!this.open) return false
    const r = this.el.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  // каждый кадр: Бульк стоит рядом, карточка висит над ним
  update() {
    if (!this.open) return
    const pet = this.pet
    if (pet.mode === "ground" && pet.act !== "coach" && pet.act !== "eat") {
      pet.target = null
      pet.setAct("coach")
    }

    const h = this.el.offsetHeight
    const left = Math.min(Math.max(pet.x - CARD_W / 2, 8), this.world.width - CARD_W - 8)
    let top = pet.y - 66 * S - h - 12
    if (top < 8) top = Math.min(pet.y + 12, this.world.height - h - 8)
    this.el.style.left = `${Math.round(left)}px`
    this.el.style.top = `${Math.round(top)}px`
  }
}
