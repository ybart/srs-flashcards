import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Category from '../models/category.js'
import Session from '../models/session.js'
import RelativeDate from '../models/relative_date.js'
import { LABELS } from '../migrations.js'

export default class extends Controller {
  static targets = ['history', 'title']

  // Stacked-bar colours, in the order of `LABELS`.
  static COLORS = ['#778787', '#ed3b3b', '#f29132', '#c2bb3b', '#7fe851', '#0a8f45']
  static DAY = 24 * 60 * 60 * 1000
  static MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  async connect() {
    const fragment = document.location.hash.substring(1)
    const params = Object.fromEntries(new URLSearchParams(fragment))
    this.category = params.category

    const category = this.category ? await Category.find(this.category) : null
    if (category) { this.titleTarget.innerText = category.name }

    const sessions = await this.sessions()
    if (sessions.length === 0) { return this.renderEmpty() }

    this.render(this.bucketize(sessions))
  }

  // One entry per recorded snapshot: { time, dist }, where dist counts
  // [gray, red, orange, yellow, lightgreen, green].
  async sessions() {
    if (!this.category) { return [] }

    const rows = await Session.history(this.category)

    return rows.map((row) => {
      const progress = JSON.parse(row.progress)

      return {
        time: RelativeDate.dateFromSqliteTimestamp(row.started_at).getTime(),
        dist: LABELS.map((label) => progress[label] || 0)
      }
    })
  }

  renderEmpty() {
    const message = document.createElement('p')
    message.classList.add('message')
    message.append('No study history yet')
    this.historyTarget.appendChild(message)
  }

  granularity(age) {
    const DAY = this.constructor.DAY
    if (age > 365 * DAY) return 'quarter'
    if (age > 30 * DAY) return 'month'
    if (age > 7 * DAY) return 'week'
    return 'day'
  }

  bucketKey(d, gran) {
    const y = d.getFullYear()
    if (gran === 'quarter') return `${y}-Q${Math.floor(d.getMonth() / 3)}`
    if (gran === 'month') return `${y}-M${d.getMonth()}`
    if (gran === 'week') return `${y}-W${this.isoWeek(d)}`
    return d.toISOString().slice(0, 10)
  }

  isoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayNum + 3)
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
    return 1 + Math.round((date - firstThursday) / (7 * this.constructor.DAY))
  }

  // Keep the last session in each bucket, newest first. Empty buckets are absent.
  bucketize(sessions) {
    const now = Date.now()
    const buckets = new Map()
    for (const session of sessions) {
      const time = session.time
      const gran = this.granularity(now - time)
      const key = this.bucketKey(new Date(time), gran)
      const current = buckets.get(key)
      if (!current || time > current.time) buckets.set(key, { time, dist: session.dist, gran })
    }
    return [...buckets.values()].sort((a, b) => b.time - a.time)
  }

  render(buckets) {
    const el = this.historyTarget
    el.innerHTML = ''
    let lastYear = null
    let lastMonth = null

    for (const bucket of buckets) {
      const d = new Date(bucket.time)
      const year = d.getFullYear()
      const month = d.getMonth()
      const fine = bucket.gran === 'week' || bucket.gran === 'day'

      if (year !== lastYear) {
        this.appendHeader(el, `${year}`, 0)
        lastYear = year
        lastMonth = null
      }
      if (fine) {
        if (month !== lastMonth) {
          this.appendHeader(el, this.constructor.MONTHS[month], 1)
          lastMonth = month
        }
      } else {
        lastMonth = null // a later week/day re-emits its month header
      }

      // Coarse buckets (month/quarter) have no sub-bars, so bold their label as
      // its own title; fine buckets (week/day) sit under a month header.
      this.appendBar(el, this.subLabel(bucket.gran, d), bucket.dist, !fine)
    }
  }

  subLabel(gran, d) {
    if (gran === 'quarter') {
      const q = Math.floor(d.getMonth() / 3)
      return `${this.constructor.MONTHS[q * 3]}-${this.constructor.MONTHS[q * 3 + 2]}`
    }
    if (gran === 'month') return this.constructor.MONTHS[d.getMonth()]
    if (gran === 'week') return this.weekRange(d)
    return String(d.getDate()).padStart(2, '0')
  }

  // Day-of-month range (Mon..Sun) of the bucket's week, e.g. "01-07".
  weekRange(d) {
    const pad = (n) => String(n).padStart(2, '0')
    const monday = new Date(d)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return `${pad(monday.getDate())}-${pad(sunday.getDate())}`
  }

  appendHeader(el, text, level) {
    const h = document.createElement('div')
    h.className = `ph-header ph-lvl-${level}`
    h.textContent = text
    el.appendChild(h)
  }

  appendBar(el, label, dist, strong = false) {
    const total = dist.reduce((a, b) => a + b, 0) || 1

    const bar = document.createElement('div')
    bar.className = 'ph-bar'
    // Green first (left), gray last, so progress grows leftward.
    for (let i = dist.length - 1; i >= 0; i--) {
      if (dist[i] <= 0) continue
      const seg = document.createElement('span')
      seg.className = 'ph-seg'
      seg.style.width = `${100 * dist[i] / total}%`
      seg.style.background = this.constructor.COLORS[i]
      bar.appendChild(seg)
    }

    const lab = document.createElement('span')
    lab.className = strong ? 'ph-label ph-strong' : 'ph-label'
    lab.textContent = label

    const row = document.createElement('div')
    row.className = 'ph-row'
    row.append(lab, bar)
    el.appendChild(row)
  }
}
