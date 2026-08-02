import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

export default class extends Controller {
  static targets = ['history']

  // Stacked-bar colours, in order: gray, red, orange, yellow, lightgreen, green.
  // Matches the category progress bar palette.
  static COLORS = ['#778787', '#ed3b3b', '#f29132', '#c2bb3b', '#7fe851', '#0a8f45']

  static DAY = 24 * 60 * 60 * 1000

  connect() {
    // TODO: replace with persisted per-session snapshots (reconstructed history
    // + snapshots stored going forward). Mock data for now to build the view.
    const sessions = this.mockSessions()
    this.render(this.bucketize(sessions))
  }

  // Assign a session's date to a bucket, coarser the older it is.
  bucketFor(time, now) {
    const age = now - time
    const d = new Date(time)
    const year = d.getFullYear()

    if (age > 365 * this.constructor.DAY) {
      const quarter = Math.floor(d.getMonth() / 3)
      return { key: `${year}-Q${quarter}`, label: `'${String(year).slice(2)}` }
    }
    if (age > 30 * this.constructor.DAY) {
      return { key: `${year}-M${d.getMonth()}`, label: d.toLocaleDateString('en', { month: 'short' }) }
    }
    if (age > 7 * this.constructor.DAY) {
      const week = this.isoWeek(d)
      return { key: `${year}-W${week}`, label: `W${week}` }
    }
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en', { weekday: 'short' }) }
  }

  isoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayNum + 3)
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
    return 1 + Math.round((date - firstThursday) / (7 * this.constructor.DAY))
  }

  // Keep the last session in each bucket (its state is "after all sessions up
  // to it"). Ordered oldest -> newest. Empty buckets simply don't appear.
  bucketize(sessions) {
    const now = Date.now()
    const buckets = new Map()
    for (const s of sessions) {
      const time = new Date(s.started_at).getTime()
      const b = this.bucketFor(time, now)
      const current = buckets.get(b.key)
      if (!current || time > current.time) {
        buckets.set(b.key, { label: b.label, time, dist: s.dist })
      }
    }
    return [...buckets.values()].sort((a, b) => a.time - b.time)
  }

  render(buckets) {
    this.historyTarget.innerHTML = ''
    let lastLabel = null
    for (const bucket of buckets) {
      const total = bucket.dist.reduce((a, b) => a + b, 0) || 1

      const bar = document.createElement('div')
      bar.className = 'ph-bar'
      bucket.dist.forEach((count, i) => {
        if (count <= 0) return
        const seg = document.createElement('span')
        seg.className = 'ph-seg'
        seg.style.width = `${100 * count / total}%`
        seg.style.background = this.constructor.COLORS[i]
        bar.appendChild(seg)
      })

      // Only show a label when it changes, so repeats (e.g. two quarters in the
      // same year) read as one boundary marker.
      const label = document.createElement('span')
      label.className = 'ph-label'
      label.textContent = bucket.label === lastLabel ? '' : bucket.label
      lastLabel = bucket.label

      const row = document.createElement('div')
      row.className = 'ph-row'
      row.append(label, bar)
      this.historyTarget.appendChild(row)
    }
  }

  // TEMP: representative history (gray shrinking, green growing) sampled denser
  // toward now, so all bucket granularities are exercised. Removed once real
  // snapshots exist. dist = [gray, red, orange, yellow, lightgreen, green].
  mockSessions() {
    const now = Date.now()
    const totalCards = 1900
    const sessions = []
    for (let i = 0; i <= 40; i++) {
      const daysAgo = Math.round(400 * Math.pow(1 - i / 40, 1.3))
      const time = now - daysAgo * this.constructor.DAY
      const p = i / 40
      const green = Math.round(totalCards * 0.70 * p)
      const lightgreen = Math.round(totalCards * 0.10 * p)
      const yellow = Math.round(totalCards * 0.05 * p)
      const orange = Math.round(totalCards * 0.05 * p)
      const red = Math.round(totalCards * 0.05 * (1 - p)) + 20
      const gray = Math.max(0, totalCards - green - lightgreen - yellow - orange - red)
      sessions.push({ started_at: new Date(time).toISOString(), dist: [gray, red, orange, yellow, lightgreen, green] })
    }
    return sessions
  }
}
