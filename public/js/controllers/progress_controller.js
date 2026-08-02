import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Category from '../models/category.js'
import Session from '../models/session.js'
import RelativeDate from '../models/relative_date.js'
import { LABELS } from '../migrations.js'
import { bars, chart, completion } from '../progress_chart.js'

export default class extends Controller {
  static targets = ['list']

  // Zooming in is a range, not a change of scale along the axis: an axis whose
  // units change as it goes cannot be read as a shape.
  static RANGES = [
    { label: 'All', months: null },
    { label: '1 year', months: 12 },
    { label: '3 months', months: 3 },
    { label: '1 month', months: 1 }
  ]
  static METRICS = [
    { key: 'cards', label: 'Cards', value: (event) => event.cards },
    { key: 'time', label: 'Time', value: (event) => event.seconds }
  ]
  static MONTH = 30 * 24 * 60 * 60 * 1000
  static PREVIEW_COLUMNS = 90
  static DETAIL_COLUMNS = 160
  // Zooming multiplies the column count, so it needs a ceiling.
  static MAX_COLUMNS = 1200

  async connect() {
    const [categories, snapshots, effort] = await Promise.all([
      Category.all(), Session.history(), Session.effort()
    ])

    this.series = this.group(snapshots, (row) => {
      const progress = JSON.parse(row.progress)

      return {
        time: RelativeDate.dateFromSqliteTimestamp(row.started_at).getTime(),
        dist: LABELS.map((label) => progress[label] || 0)
      }
    })
    this.effort = this.group(effort, (row) => ({
      time: RelativeDate.dateFromSqliteTimestamp(row.started_at).getTime(),
      cards: row.cards, seconds: row.seconds || 0
    }))

    this.listTarget.innerHTML = ''
    for (const category of categories) { this.append(category) }
    if (!this.listTarget.children.length) { this.renderEmpty() }
  }

  group(rows, build) {
    const grouped = new Map()
    for (const row of rows) {
      if (!grouped.has(row.category_id)) { grouped.set(row.category_id, []) }
      grouped.get(row.category_id).push(build(row))
    }

    return grouped
  }

  append(category) {
    // A single snapshot is a point, not a trajectory; nothing to draw yet.
    const series = this.series.get(category.id)
    if (!series || series.length < 2) { return }

    const item = document.querySelector('#progress-item').cloneNode(true)
    item.removeAttribute('style')
    item.id = `progress-${category.id}`
    item.dataset.category = category.id
    item.dataset.metric = this.constructor.METRICS[0].key
    item.querySelector('[data-role=name]').innerText = category.name
    item.querySelector('[data-role=percent]').innerText =
      `${completion(series.at(-1).dist).toFixed(0)} %`

    // Totals on the collapsed row: the list should be worth reading without
    // opening anything, and expanding is for the shape over time.
    const events = this.effort.get(category.id) || []
    const cards = events.reduce((sum, event) => sum + event.cards, 0)
    const seconds = events.reduce((sum, event) => sum + event.seconds, 0)
    item.querySelector('[data-role=summary]').innerText =
      `${this.formatTotal('cards', cards)} · ${this.formatTotal('time', seconds)}`

    this.listTarget.appendChild(item)
    this.draw(item)
  }

  // Redraws in place from the range and metric held on the item. The whole
  // history is always drawn; the range decides how much of it fits on screen,
  // and the rest is reachable by scrolling.
  draw(item) {
    const category = Number(item.dataset.category)
    const series = this.series.get(category)
    const months = Number(item.dataset.months) || null
    const expanded = item.classList.contains('expanded')

    const from = series[0].time
    const to = series.at(-1).time
    const span = Math.max(to - from, 1)
    const zoom = expanded && months
      ? Math.max(1, span / (months * this.constructor.MONTH)) : 1
    const columns = Math.min(this.constructor.MAX_COLUMNS, Math.round(
      (expanded ? this.constructor.DETAIL_COLUMNS : this.constructor.PREVIEW_COLUMNS) * zoom
    ))

    item.querySelector('[data-role=canvas]').style.width = `${(zoom * 100).toFixed(2)}%`
    this.replace(item, 'chart', chart(series, { from: from, to: to, columns: columns }))

    const effort = item.querySelector('[data-role=effort]')
    effort.innerHTML = ''
    if (!expanded) { return this.scrollToLatest(item) }

    item.querySelector('[data-role=from]').innerText = this.monthLabel(from)
    item.querySelector('[data-role=to]').innerText = this.monthLabel(to)

    const metric = this.constructor.METRICS.find((m) => m.key === item.dataset.metric)
    const events = this.effort.get(category) || []
    effort.appendChild(bars(events, {
      from: from, to: to, columns: columns, value: metric.value
    }))

    const total = events.reduce((sum, event) => sum + metric.value(event), 0)
    item.querySelector('[data-role=total]').innerText = this.formatTotal(metric.key, total)

    this.appendChoices(item, 'ranges', this.constructor.RANGES.filter((range) => {
      // A window wider than the history would draw the same chart as All.
      return !range.months || range.months * this.constructor.MONTH < span
    }).map((range) => ({
      label: range.label, selected: (range.months || null) === months,
      action: 'click->progress#selectRange', data: { months: range.months || '' }
    })))

    this.appendChoices(item, 'metrics', this.constructor.METRICS.map((option) => ({
      label: option.label, selected: option.key === metric.key,
      action: 'click->progress#selectMetric', data: { metric: option.key }
    })))

    this.scrollToLatest(item)
  }

  // Zooming in should land on the most recent stretch, which is the one worth
  // looking at; earlier history is a scroll away.
  scrollToLatest(item) {
    const scroll = item.querySelector('[data-role=scroll]')
    scroll.scrollLeft = scroll.scrollWidth
  }

  replace(item, role, node) {
    const container = item.querySelector(`[data-role=${role}]`)
    container.innerHTML = ''
    container.appendChild(node)
  }

  appendChoices(item, role, choices) {
    const container = item.querySelector(`[data-role=${role}]`)
    container.innerHTML = ''

    for (const choice of choices) {
      const button = document.createElement('a')
      button.href = '#'
      button.innerText = choice.label
      button.className = choice.selected ? 'progress-range selected' : 'progress-range'
      button.dataset.action = choice.action
      for (const [key, value] of Object.entries(choice.data)) { button.dataset[key] = value }
      container.appendChild(button)
    }
  }

  monthLabel(time) {
    return new Date(time).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }

  formatTotal(metric, total) {
    if (metric !== 'time') { return `${Math.round(total).toLocaleString()} cards` }

    const minutes = Math.round(total / 60)
    if (minutes < 60) { return `${minutes}m` }

    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  }

  toggle(event) {
    event.preventDefault()

    const item = event.currentTarget.closest('.progress-item')
    const opening = !item.classList.contains('expanded')

    // Only one open at a time, so the list stays scannable.
    for (const other of this.listTarget.children) {
      if (other === item || !other.classList.contains('expanded')) { continue }
      this.collapse(other)
      this.draw(other)
    }

    if (opening) {
      item.classList.add('expanded')
      item.querySelector('[data-role=detail]').style.display = ''
    } else {
      this.collapse(item)
    }
    this.draw(item)
  }

  collapse(item) {
    item.classList.remove('expanded')
    item.querySelector('[data-role=detail]').style.display = 'none'
    delete item.dataset.months
  }

  selectRange(event) {
    event.preventDefault()
    event.stopPropagation()

    const item = event.currentTarget.closest('.progress-item')
    item.dataset.months = event.currentTarget.dataset.months
    this.draw(item)
  }

  selectMetric(event) {
    event.preventDefault()
    event.stopPropagation()

    const item = event.currentTarget.closest('.progress-item')
    item.dataset.metric = event.currentTarget.dataset.metric
    this.draw(item)
  }

  renderEmpty() {
    const message = document.createElement('p')
    message.classList.add('message')
    message.append('No study history yet')
    this.listTarget.appendChild(message)
  }
}
