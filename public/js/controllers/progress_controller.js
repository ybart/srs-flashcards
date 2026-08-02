import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Category from '../models/category.js'
import Session from '../models/session.js'
import RelativeDate from '../models/relative_date.js'
import { LABELS } from '../migrations.js'
import { chart, completion } from '../progress_chart.js'

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
  static MONTH = 30 * 24 * 60 * 60 * 1000
  static PREVIEW_COLUMNS = 90
  static DETAIL_COLUMNS = 160

  async connect() {
    const [categories, snapshots] = await Promise.all([Category.all(), Session.history()])

    this.series = new Map()
    for (const row of snapshots) {
      const progress = JSON.parse(row.progress)
      const point = {
        time: RelativeDate.dateFromSqliteTimestamp(row.started_at).getTime(),
        dist: LABELS.map((label) => progress[label] || 0)
      }
      if (!this.series.has(row.category_id)) { this.series.set(row.category_id, []) }
      this.series.get(row.category_id).push(point)
    }

    this.listTarget.innerHTML = ''
    for (const category of categories) { this.append(category) }
    if (!this.listTarget.children.length) { this.renderEmpty() }
  }

  append(category) {
    // A single snapshot is a point, not a trajectory; nothing to draw yet.
    const series = this.series.get(category.id)
    if (!series || series.length < 2) { return }

    const item = document.querySelector('#progress-item').cloneNode(true)
    item.removeAttribute('style')
    item.id = `progress-${category.id}`
    item.dataset.category = category.id
    item.querySelector('[data-role=name]').innerText = category.name
    item.querySelector('[data-role=percent]').innerText =
      `${completion(series.at(-1).dist).toFixed(0)} %`

    this.listTarget.appendChild(item)
    this.draw(item, null)
  }

  // Redraws in place; `months` null means the whole history.
  draw(item, months) {
    const series = this.series.get(Number(item.dataset.category))
    const expanded = item.classList.contains('expanded')
    const to = series.at(-1).time
    const from = months ? to - months * this.constructor.MONTH : series[0].time

    const container = item.querySelector('[data-role=chart]')
    container.innerHTML = ''
    container.appendChild(chart(series, {
      from: from,
      to: to,
      columns: expanded ? this.constructor.DETAIL_COLUMNS : this.constructor.PREVIEW_COLUMNS
    }))

    if (!expanded) { return }

    item.querySelector('[data-role=from]').innerText = this.monthLabel(from)
    item.querySelector('[data-role=to]').innerText = this.monthLabel(to)
    this.appendRanges(item, months, series[0].time, to)
  }

  monthLabel(time) {
    return new Date(time).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }

  // Ranges longer than the history itself would all draw the same chart.
  appendRanges(item, current, first, last) {
    const ranges = item.querySelector('[data-role=ranges]')
    ranges.innerHTML = ''

    for (const range of this.constructor.RANGES) {
      if (range.months && last - range.months * this.constructor.MONTH < first) { continue }

      const button = document.createElement('a')
      button.href = '#'
      button.innerText = range.label
      button.className = range.months === current ? 'progress-range selected' : 'progress-range'
      button.dataset.action = 'click->progress#selectRange'
      button.dataset.months = range.months || ''
      ranges.appendChild(button)
    }
  }

  toggle(event) {
    event.preventDefault()

    const item = event.currentTarget.closest('.progress-item')
    const opening = !item.classList.contains('expanded')

    for (const other of this.listTarget.children) {
      if (other === item || !other.classList.contains('expanded')) { continue }
      other.classList.remove('expanded')
      other.querySelector('[data-role=detail]').style.display = 'none'
      this.draw(other, null)
    }

    item.classList.toggle('expanded', opening)
    item.querySelector('[data-role=detail]').style.display = opening ? '' : 'none'
    this.draw(item, null)
  }

  selectRange(event) {
    event.preventDefault()

    const item = event.currentTarget.closest('.progress-item')
    this.draw(item, Number(event.currentTarget.dataset.months) || null)
  }

  renderEmpty() {
    const message = document.createElement('p')
    message.classList.add('message')
    message.append('No study history yet')
    this.listTarget.appendChild(message)
  }
}
