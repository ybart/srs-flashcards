import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Category from '../models/category.js'
import Session from '../models/session.js'
import RelativeDate from '../models/relative_date.js'
import { LABELS } from '../migrations.js'
import { bars, chart, completion } from '../progress_chart.js'
import { download } from '../progress_image.js'

export default class extends Controller {
  static targets = ['list']

  // Zooming in is a range, not a change of scale along the axis: an axis whose
  // units change as it goes cannot be read as a shape.
  static RANGES = [
    { label: 'All', size: null },
    { label: '1 year', size: 12 },
    { label: '3 months', size: 3 },
    { label: '1 month', size: 1 }
  ]
  // The day axis counts days studied, so its windows do too.
  static DAY_RANGES = [
    { label: 'All', size: null },
    { label: '90 days', size: 90 },
    { label: '30 days', size: 30 },
    { label: '7 days', size: 7 }
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

    // What each expanded chart is currently showing, so the export can be the
    // picture on screen rather than a second guess at it.
    this.drawn = new Map()

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
    // A category with nothing behind it still gets a row and a flat, wholly
    // unstudied chart: the deck it has not started is part of the picture, and
    // an empty chart says that better than an absence does. One snapshot is a
    // point rather than a trajectory, so it is drawn the same way.
    const history = this.series.get(category.id)
    const studied = history && history.length >= 2
    if (!studied) {
      const dist = history ? history[0].dist : [category.cards_count, 0, 0, 0, 0, 0]
      this.series.set(category.id, [{ time: 0, dist: dist }, { time: 1, dist: dist }])
    }

    const series = this.series.get(category.id)
    const item = document.querySelector('#progress-item').cloneNode(true)
    item.removeAttribute('style')
    item.id = `progress-${category.id}`
    item.dataset.category = category.id
    item.dataset.metric = this.constructor.METRICS[0].key
    item.querySelector('[data-role=name]').innerText = category.name
    item.querySelector('[data-role=percent]').innerText =
      `${completion(series.at(-1).dist).toFixed(0)} %`

    // Totals on the collapsed row: the list should be worth reading without
    // opening anything, and expanding is for the shape over time. There is no
    // shape without a history, so those rows do not open at all.
    const events = this.effort.get(category.id) || []
    const cards = events.reduce((sum, event) => sum + event.cards, 0)
    const seconds = events.reduce((sum, event) => sum + event.seconds, 0)
    item.querySelector('[data-role=summary]').innerText = studied
      ? `${this.formatTotal('cards', cards)} · ${this.formatTotal('time', seconds)}`
      : `${this.formatTotal('cards', category.cards_count)}, not started`

    if (!studied) {
      item.classList.add('empty')
      item.querySelector('.progress-caret').remove()
    }

    this.listTarget.appendChild(item)
    this.draw(item)
  }

  // One point per day studied, with the empty stretches between them dropped.
  // On a calendar axis those gaps are the honest answer and usually most of the
  // width; on this one the question is what happened when you did turn up.
  studyDays(series, events) {
    const dayOf = (time) => new Date(time).toDateString()

    const snapshots = new Map()
    for (const point of series) { snapshots.set(dayOf(point.time), point) }

    const worked = new Map()
    for (const event of events) {
      const current = worked.get(dayOf(event.time)) || { cards: 0, seconds: 0 }
      current.cards += event.cards
      current.seconds += event.seconds
      worked.set(dayOf(event.time), current)
    }

    const days = [...snapshots.keys()]

    return {
      series: days.map((day, index) => ({ time: index, dist: snapshots.get(day).dist })),
      events: days.map((day, index) => ({
        time: index, ...(worked.get(day) || { cards: 0, seconds: 0 })
      })),
      dates: days.map((day) => snapshots.get(day).time),
      first: snapshots.get(days[0]).time,
      last: snapshots.get(days.at(-1)).time
    }
  }

  // Redraws in place from the axis, range and metric held on the item. On the
  // calendar axis the whole history is always drawn and the range decides how
  // much of it fits on screen, the rest being a scroll away.
  draw(item) {
    const category = Number(item.dataset.category)
    const expanded = item.classList.contains('expanded')
    const byDay = item.dataset.axis === 'days'
    const all = this.series.get(category)
    const allEvents = this.effort.get(category) || []

    const compressed = byDay ? this.studyDays(all, allEvents) : null
    const series = compressed ? compressed.series : all
    const events = compressed ? compressed.events : allEvents

    const from = series[0].time
    const to = series.at(-1).time
    const span = Math.max(to - from, 1)

    // The window is counted in the axis's own unit: months of calendar, or days
    // studied. Either way it says how much of the history fits on screen.
    const window = Number(item.dataset.window) || null
    const total = compressed ? compressed.dates.length : span / this.constructor.MONTH
    const zoom = expanded && window ? Math.max(1, total / window) : 1
    const columns = Math.min(this.constructor.MAX_COLUMNS, Math.round(
      (expanded ? this.constructor.DETAIL_COLUMNS : this.constructor.PREVIEW_COLUMNS) * zoom
    ))

    item.querySelector('[data-role=canvas]').style.width = `${(zoom * 100).toFixed(2)}%`
    this.replace(item, 'chart', chart(series, { from: from, to: to, columns: columns }))

    const effort = item.querySelector('[data-role=effort]')
    const axis = item.querySelector('[data-role=axis]')
    effort.innerHTML = ''
    axis.innerHTML = ''
    if (!expanded) { return this.scrollToLatest(item) }

    const metric = this.constructor.METRICS.find((m) => m.key === item.dataset.metric)
    const drawn = bars(events, {
      from: from, to: to, columns: columns, value: metric.value
    })
    effort.appendChild(drawn)
    const peak = this.formatTotal(metric.key, Number(drawn.dataset.peak))
    // Positions on the day axis are indices into the days studied, so they are
    // labelled by which day it was rather than by the date it fell on.
    this.appendAxis(axis, zoom, compressed
      ? (position) => `day ${Math.round(position * (compressed.dates.length - 1)) + 1}`
      : (position) => this.tickLabel(from + span * position, span))

    // The bars are scaled to their own busiest bucket, so that value is their
    // scale and belongs beside the total rather than floating over them.
    const worked = allEvents.reduce((sum, event) => sum + metric.value(event), 0)
    item.querySelector('[data-role=total]').innerText =
      `${this.formatTotal(metric.key, worked)} · peak ${peak}`

    const ranges = compressed ? this.constructor.DAY_RANGES : this.constructor.RANGES
    const zooms = ranges
      // A window wider than the history would draw the same chart as All.
      .filter((range) => !range.size || range.size < total)
      .map((range) => ({
        label: range.label, selected: (range.size || null) === window,
        action: 'click->progress#selectRange', data: { window: range.size || '' }
      }))

    this.appendChoices(item, 'ranges', zooms.concat({
      label: 'Study days', selected: !!compressed,
      action: 'click->progress#selectAxis', data: {}
    }))

    this.appendChoices(item, 'metrics', this.constructor.METRICS.map((option) => ({
      label: option.label, selected: option.key === metric.key,
      action: 'click->progress#selectMetric', data: { metric: option.key }
    })))

    this.drawn.set(category, {
      series: series, from: from, to: to, columns: columns,
      first: all[0].time, last: all.at(-1).time
    })
    this.scrollToLatest(item)
  }

  async exportImage(event) {
    event.preventDefault()
    event.stopPropagation()

    const item = event.currentTarget.closest('.progress-item')
    const drawn = this.drawn.get(Number(item.dataset.category))
    if (!drawn) { return }

    const name = item.querySelector('[data-role=name]').innerText
    const span = drawn.last - drawn.first

    await download({
      name: name,
      percent: item.querySelector('[data-role=percent]').innerText,
      subtitle: item.querySelector('[data-role=summary]').innerText,
      footer: `${this.tickLabel(drawn.first, span)} – ${this.tickLabel(drawn.last, span)}`,
      filename: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'progress',
      series: drawn.series, from: drawn.from, to: drawn.to, columns: drawn.columns
    })
  }

  // Labels ride inside the scrolling canvas, roughly two per screenful, so
  // panning never leaves you without a date in view.
  appendAxis(axis, zoom, labelAt) {
    const count = Math.max(2, Math.round(zoom * 2))

    for (let i = 0; i < count; i++) {
      const position = i / (count - 1)
      const left = `${(position * 100).toFixed(3)}%`

      // The label is nudged inwards at the ends so it does not hang off the
      // canvas; the tick stays exactly on the point it is naming.
      const tick = document.createElement('i')
      tick.className = 'progress-tick'
      tick.style.left = left
      axis.appendChild(tick)

      const label = document.createElement('span')
      label.innerText = labelAt(position)
      label.style.left = left
      if (position < 0.02) { label.style.transform = 'none' }
      if (position > 0.98) { label.style.transform = 'translateX(-100%)' }
      axis.appendChild(label)
    }
  }

  tickLabel(time, span) {
    const options = span > 400 * 24 * 60 * 60 * 1000
      ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }

    return new Date(time).toLocaleDateString(undefined, options)
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

  formatTotal(metric, total) {
    if (metric !== 'time') { return `${Math.round(total).toLocaleString()} cards` }

    const minutes = Math.round(total / 60)
    if (minutes < 60) { return `${minutes}m` }

    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  }

  toggle(event) {
    event.preventDefault()

    const item = event.currentTarget.closest('.progress-item')
    if (item.classList.contains('empty')) { return }

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
    delete item.dataset.window
    delete item.dataset.axis
  }

  selectRange(event) {
    event.preventDefault()
    event.stopPropagation()

    const item = event.currentTarget.closest('.progress-item')
    item.dataset.window = event.currentTarget.dataset.window
    this.draw(item)
  }

  selectAxis(event) {
    event.preventDefault()
    event.stopPropagation()

    const item = event.currentTarget.closest('.progress-item')
    // Off is the calendar, so the toggle only has to flip.
    if (item.dataset.axis === 'days') { delete item.dataset.axis }
    else { item.dataset.axis = 'days' }

    // The windows are counted in the axis's own unit, so they do not carry over.
    delete item.dataset.window
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
