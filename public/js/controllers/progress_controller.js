import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Category from '../models/category.js'
import Session from '../models/session.js'
import RelativeDate from '../models/relative_date.js'
import { LABELS } from '../migrations.js'
import { GRID, bars, chart, completion, fraction } from '../progress_chart.js'
import { download } from '../progress_image.js'
import { languageTag, t, tn } from '../i18n.js'

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
    { key: 'reviews', label: 'Reviews', value: (event) => event.reviews },
    { key: 'cards', label: 'Cards', value: (event) => event.cards },
    { key: 'time', label: 'Time', value: (event) => event.seconds }
  ]
  static MONTH = 30 * 24 * 60 * 60 * 1000
  static PREVIEW_COLUMNS = 90
  static DETAIL_COLUMNS = 160
  // Zooming multiplies the column count, so it needs a ceiling.
  static MAX_COLUMNS = 1200
  static MAX_RULES = 5
  // The exported chart is 1010px across, so this is roughly five pixels a step.
  static EXPORT_COLUMNS = 200
  // Round in the way the unit is read, which for time is not round in base ten.
  static TIME_STEPS = [15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800]

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
      reviews: row.reviews || 0, cards: row.cards || 0, seconds: row.seconds || 0
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
    const reviews = events.reduce((sum, event) => sum + event.reviews, 0)
    const seconds = events.reduce((sum, event) => sum + event.seconds, 0)
    // The deck size leads either way: it is the thing the rest is measured
    // against, and the only one of the three that is a count of cards.
    const deck = this.formatTotal('cards', category.cards_count)
    item.querySelector('[data-role=summary]').innerText = studied
      ? `${deck} · ${this.formatTotal('reviews', reviews)} · ${this.formatTotal('time', seconds)}`
      : t('%{deck}, not started', { deck: deck })

    if (!studied) {
      item.classList.add('empty')
      // Hidden rather than removed: taking it out would slide the export icon
      // over and break the column the other rows line up in.
      item.querySelector('.progress-caret').style.visibility = 'hidden'
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
      const current = worked.get(dayOf(event.time)) || { reviews: 0, cards: 0, seconds: 0 }
      current.reviews += event.reviews
      current.cards += event.cards
      current.seconds += event.seconds
      worked.set(dayOf(event.time), current)
    }

    const days = [...snapshots.keys()]

    return {
      series: days.map((day, index) => ({ time: index, dist: snapshots.get(day).dist })),
      events: days.map((day, index) => ({
        time: index, ...(worked.get(day) || { reviews: 0, cards: 0, seconds: 0 })
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
    let columns = Math.min(this.constructor.MAX_COLUMNS, Math.round(
      (expanded ? this.constructor.DETAIL_COLUMNS : this.constructor.PREVIEW_COLUMNS) * zoom
    ))
    // On the day axis a day is the point, so it gets a column of its own: more
    // than one would redraw the same value over and over and put every day
    // half a column off its own label, and it is what leaves the bars wide
    // enough to read. Fewer, on a history longer than the cap, means several
    // days to a column and nothing to line up with.
    if (compressed) {
      columns = Math.max(2, Math.min(this.constructor.MAX_COLUMNS, compressed.dates.length))
    }

    item.querySelector('[data-role=canvas]').style.width = `${(zoom * 100).toFixed(2)}%`
    this.replace(item, 'chart', chart(series, { from: from, to: to, columns: columns }))

    // Everything the export needs, recorded before the collapsed rows leave:
    // a shut row still exports, it just exports the whole history.
    this.drawn.set(category, {
      series: series, events: events, from: from, to: to,
      metric: item.dataset.metric, dates: compressed ? compressed.dates : null,
      first: all[0].time, last: all.at(-1).time
    })

    // Left in place when the row shuts: the fold animates them away, and it has
    // nothing to animate if they are torn out first. They are replaced on the
    // way back open.
    if (!expanded) { return this.scrollToLatest(item) }

    const effort = item.querySelector('[data-role=effort]')
    const axis = item.querySelector('[data-role=axis]')
    effort.innerHTML = ''
    axis.innerHTML = ''

    const metric = this.constructor.METRICS.find((m) => m.key === item.dataset.metric)
    const drawn = bars(events, {
      from: from, to: to, columns: columns, value: metric.value,
      scale: (peak) => this.rules(metric.key, peak)
    })
    effort.appendChild(drawn)
    this.appendScale(item, metric.key, drawn)
    // Positions on the day axis are indices into the days studied, so they are
    // labelled by which day it was rather than by the date it fell on.
    this.appendAxis(axis, zoom, compressed
      // A tick names a whole day, so it is moved onto that day rather than left
      // where the even spacing put it: the rounding is worth half a day, which
      // on a canvas zoomed to a week is half the width of a screen divided by
      // seven — tens of pixels, and plainly beside the bar it belongs to.
      ? (position) => {
        const index = Math.round(position * (compressed.dates.length - 1))
        return {
          position: fraction(index, compressed.dates.length),
          label: t('day %{number}', { number: index + 1 })
        }
      }
      : (position) => ({
        position: position,
        label: this.tickLabel(from + span * position, span / zoom, {
          year: new Date(from).getFullYear() !== new Date(to).getFullYear()
        })
      }))


    const ranges = compressed ? this.constructor.DAY_RANGES : this.constructor.RANGES
    const zooms = ranges
      // A window wider than the history would draw the same chart as All.
      .filter((range) => !range.size || range.size < total)
      .map((range) => ({
        label: range.label, selected: (range.size || null) === window,
        action: 'click->progress#selectRange', data: { window: range.size || '' }
      }))

    // Last in the row but pinned to its right edge: how many windows precede it
    // depends on how long the history is, and a control that moves between
    // categories is one you have to look for every time.
    this.appendChoices(item, 'ranges', zooms.concat({
      label: 'Study days', selected: !!compressed, className: 'progress-trailing',
      action: 'click->progress#selectAxis', data: {}
    }))

    this.appendChoices(item, 'metrics', this.constructor.METRICS.map((option) => ({
      label: option.label, selected: option.key === metric.key,
      action: 'click->progress#selectMetric', data: { metric: option.key }
    })))

    this.scrollToLatest(item)
    this.showTypical(item)
  }

  // Totals belong to the subtitle, which already carries all three; repeating
  // one here would say nothing. What a usual day amounts to is on neither
  // chart, and it describes the stretch actually on screen rather than the
  // whole history.
  showTypical(item) {
    const drawn = this.drawn.get(Number(item.dataset.category))
    if (!drawn || !item.classList.contains('expanded')) { return }

    const metric = this.constructor.METRICS.find((m) => m.key === item.dataset.metric)
    const scroll = item.querySelector('[data-role=scroll]')
    const scrollable = scroll.clientWidth > 0 && scroll.scrollWidth > scroll.clientWidth
    const start = scrollable ? scroll.scrollLeft / scroll.scrollWidth : 0
    const end = scrollable
      ? Math.min(1, (scroll.scrollLeft + scroll.clientWidth) / scroll.scrollWidth) : 1

    const reach = drawn.to - drawn.from
    const from = drawn.from + reach * start
    const to = drawn.from + reach * end
    const visible = drawn.events.filter((event) => event.time >= from && event.time <= to)

    // The middle day rather than the average: study comes in bursts, and one
    // marathon should not describe an ordinary day.
    const days = this.dailyTotals(visible, metric.value, !!drawn.dates)
    const usual = days.length ? days.sort((a, b) => a - b)[Math.floor(days.length / 2)] : 0
    item.querySelector('[data-role=total]').innerText =
      t('usually %{amount} a day', { amount: this.formatTotal(metric.key, usual) })
  }

  // Panning changes what is on screen without redrawing anything, so the figure
  // has to be refreshed on its own. Once a frame is often enough.
  panned(event) {
    const item = event.currentTarget.closest('.progress-item')
    if (this.repaint) { return }

    this.repaint = requestAnimationFrame(() => {
      this.repaint = null
      this.showTypical(item)
    })
  }

  // The picture is of what the row is showing: the same axis, the same metric,
  // and the same stretch of history that is on screen after any panning.
  async exportImage(event) {
    event.preventDefault()
    event.stopPropagation()

    const item = event.currentTarget.closest('.progress-item')
    const drawn = this.drawn.get(Number(item.dataset.category))
    if (!drawn) { return }

    // The window on screen, when there is one to speak of. A row that does not
    // scroll — or one measured before it has been laid out — exports whole
    // rather than exporting a sliver.
    const scroll = item.querySelector('[data-role=scroll]')
    const scrollable = scroll.clientWidth > 0 && scroll.scrollWidth > scroll.clientWidth
    const start = scrollable ? scroll.scrollLeft / scroll.scrollWidth : 0
    const end = scrollable
      ? Math.min(1, (scroll.scrollLeft + scroll.clientWidth) / scroll.scrollWidth) : 1

    const reach = drawn.to - drawn.from
    const from = drawn.from + reach * start
    const to = drawn.from + reach * end

    const metric = this.constructor.METRICS.find((m) => m.key === drawn.metric) ||
      this.constructor.METRICS[0]
    const name = item.querySelector('[data-role=name]').innerText

    await download({
      name: name,
      percent: item.querySelector('[data-role=percent]').innerText,
      subtitle: item.querySelector('[data-role=summary]').innerText,
      // The ticks name a day and a month, and a picture that outlives the day it
      // was taken needs the year somewhere. It goes here, once, and it is the
      // stretch on the picture rather than the whole history: on the day axis
      // the ticks count days and there is no year to be missing.
      footer: drawn.dates
        ? t('%{count} study days', { count: drawn.dates.length })
        : this.period(from, to),
      filename: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'progress',
      series: drawn.series, events: drawn.events, from: from, to: to,
      columns: this.constructor.EXPORT_COLUMNS,
      value: metric.value,
      scale: (peak) => this.rules(metric.key, peak),
      formatTick: (value) => this.formatScale(metric.key, value),
      // Same contract as the axis on screen: a tick that names a whole day is
      // moved onto that day rather than left where the even spacing put it.
      pointAt: (position) => {
        const value = from + (to - from) * position
        if (!drawn.dates) {
          return { position: position, label: this.tickLabel(value, to - from, { year: false }) }
        }

        // Held to the days the picture actually covers: the window can start
        // between two days, and rounding outwards would name one that is not
        // in the picture and put its tick where nothing is drawn.
        const index = Math.min(Math.floor(to), Math.max(Math.ceil(from), Math.round(value)))
        return {
          position: (index - from) / ((to - from) || 1),
          label: t('day %{number}', { number: index + 1 })
        }
      }
    })
  }

  // What the heights mean. The bars are scaled to their own busiest bucket, so
  // without their top value they say only which stretches were busier than
  // which; the area is a share of the deck, where the halfway rule is the one
  // worth naming. Measured off the drawings rather than repeating their sizes.
  appendScale(item, metric, drawn) {
    const scale = item.querySelector('[data-role=scale]')
    scale.innerHTML = ''
    // Nothing worth measuring against until the row has stopped moving; unfold()
    // comes back for this.
    if ('unfolding' in item.dataset) { return }

    const area = item.querySelector('[data-role=chart]').firstElementChild
    if (!area) { return }

    // Measured with rects rather than offsetTop: these are SVG elements, and
    // offsetTop belongs to HTMLElement, so it reads undefined on them.
    const origin = item.querySelector('.progress-plot').getBoundingClientRect().top
    const mark = (top, text) => {
      const label = document.createElement('span')
      label.style.top = `${Math.round(top - origin)}px`
      label.innerText = text
      scale.appendChild(label)
    }

    const areaBox = area.getBoundingClientRect()
    for (const fraction of GRID) {
      mark(areaBox.bottom - areaBox.height * fraction, `${Math.round(fraction * 100)}%`)
    }

    const barsBox = drawn.getBoundingClientRect()
    const peak = Number(drawn.dataset.peak)
    for (const tick of (drawn.dataset.ticks || '').split(',').filter(Boolean)) {
      mark(barsBox.bottom - barsBox.height * Number(tick) / peak, this.formatScale(metric, tick))
    }
  }

  // Values worth ruling: a round step in the unit being shown, few enough that
  // the chart stays a chart.
  rules(metric, peak) {
    if (!peak) { return [] }

    const step = metric === 'time'
      ? this.constructor.TIME_STEPS.find((s) => peak / s <= this.constructor.MAX_RULES)
        || this.constructor.TIME_STEPS.at(-1)
      : this.countStep(peak)

    const values = []
    for (let value = step; value < peak; value += step) { values.push(value) }

    return values
  }

  countStep(peak) {
    const magnitude = 10 ** Math.floor(Math.log10(peak / this.constructor.MAX_RULES))
    // No 2.5: these are counted things, and half a review is not a gridline.
    for (const multiple of [1, 2, 5, 10]) {
      const step = multiple * magnitude
      if (peak / step <= this.constructor.MAX_RULES) { return Math.max(1, step) }
    }

    return Math.max(1, 10 * magnitude)
  }

  // Bare enough to sit on an axis: the unit is already established by the
  // metric that is selected.
  formatScale(metric, value) {
    if (metric !== 'time') { return Math.round(value).toLocaleString() }
    if (value < 60) { return `${Math.round(value)}s` }

    const minutes = Math.round(value / 60)
    if (minutes < 60) { return `${minutes}m` }

    const hours = Math.floor(minutes / 60)
    return minutes % 60 ? `${hours}h${minutes % 60}` : `${hours}h`
  }

  // Labels ride inside the scrolling canvas, roughly two per screenful, so
  // panning never leaves you without a date in view.
  appendAxis(axis, zoom, pointAt) {
    const count = Math.max(2, Math.round(zoom * 2))

    for (let i = 0; i < count; i++) {
      // Evenly spaced to start with, but the axis has the last word on where a
      // tick ends up: it knows what its label says.
      const { position, label: text } = pointAt(i / (count - 1))
      const left = `${(position * 100).toFixed(3)}%`

      // The label is nudged inwards at the ends so it does not hang off the
      // canvas; the tick stays exactly on the point it is naming.
      const tick = document.createElement('i')
      tick.className = 'progress-tick'
      tick.style.left = left
      // Its single pixel would start at the right edge and push the canvas one
      // pixel wider, which is enough to leave "All" horizontally scrollable.
      if (position > 0.98) { tick.style.transform = 'translateX(-100%)' }
      axis.appendChild(tick)

      const label = document.createElement('span')
      label.innerText = text
      label.style.left = left
      if (position < 0.02) { label.style.transform = 'none' }
      if (position > 0.98) { label.style.transform = 'translateX(-100%)' }
      axis.appendChild(label)
    }
  }

  // Both ends in full where the stretch crosses a new year, and the year named
  // once at the end where it does not.
  period(first, last) {
    const full = { day: 'numeric', month: 'short', year: 'numeric' }
    const start = new Date(first)
    const end = new Date(last)
    const opening = start.getFullYear() === end.getFullYear()
      ? { day: 'numeric', month: 'short' } : full

    return `${start.toLocaleDateString(undefined, opening)} – ` +
      `${end.toLocaleDateString(undefined, full)}`
  }

  // Two questions, and they are answered from different things. Whether a tick
  // can name a day is set by how much of the history is on screen at once, not
  // by how much of it there is: at a month to a screen two ticks fall inside the
  // same month, and a month named twice says nothing about where you are.
  // Whether it also names the year is set by whether the history crosses one —
  // "20 mai" is only ambiguous when there are two of them. A picture never needs
  // it, having named the year in its period.
  tickLabel(time, reach, { year = true } = {}) {
    const options = reach > 400 * 24 * 60 * 60 * 1000
      ? { month: 'short', year: 'numeric' }
      : year
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : { day: 'numeric', month: 'short' }

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
      button.innerText = t(choice.label)
      button.className = ['progress-range', choice.selected && 'selected', choice.className]
        .filter(Boolean).join(' ')
      button.dataset.action = choice.action
      for (const [key, value] of Object.entries(choice.data)) { button.dataset[key] = value }
      container.appendChild(button)
    }
  }

  // On the day axis each point is already one day; on the calendar axis several
  // sessions can share one.
  dailyTotals(events, value, daily) {
    if (daily) { return events.map(value) }

    const days = new Map()
    for (const event of events) {
      const day = new Date(event.time).toDateString()
      days.set(day, (days.get(day) || 0) + value(event))
    }

    return [...days.values()]
  }

  formatTotal(metric, total) {
    if (metric !== 'time') {
      const rounded = Math.round(total)
      // Grouped by the reader's own convention, and singular where it is one:
      // "1 review", not "1 reviews".
      const count = rounded.toLocaleString(languageTag())

      return metric === 'cards'
        ? tn(rounded, '%{count} card', '%{count} cards', { count: count })
        : tn(rounded, '%{count} review', '%{count} reviews', { count: count })
    }

    const minutes = Math.round(total / 60)
    if (minutes < 60) { return `${minutes}m` }

    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  }

  // A row takes a fifth of a second to open, and the scale is measured off the
  // drawings, so a scale placed while the row is still moving is measured
  // against the height it is leaving. The gutter is left empty for as long as
  // the row is folding and filled once it has stopped, which also spares the
  // labels a slide into place. Waiting on the clock rather than on transitionend
  // so it works the same where the fold is not animated at all — and it is the
  // stylesheet's own duration, read rather than repeated.
  unfold(item) {
    const seconds = parseFloat(getComputedStyle(item).getPropertyValue('--unfold')) || 0

    item.dataset.unfolding = ''
    delete item.dataset.settled
    setTimeout(() => {
      delete item.dataset.unfolding
      this.settle(item)
    }, seconds * 1000 + 20)
  }

  settle(item) {
    const drawn = item.querySelector('[data-role=effort]').firstElementChild
    if (!drawn || !item.classList.contains('expanded')) { return }

    this.appendScale(item, item.dataset.metric, drawn)
    this.showTypical(item)
    // Fades the gutter in; see the stylesheet. A redraw that is not a toggle
    // leaves this set, so changing metric or range replaces the labels outright
    // rather than fading them in again.
    item.dataset.settled = ''
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
    } else {
      this.collapse(item)
    }
    this.unfold(item)
    this.draw(item)
  }

  collapse(item) {
    item.classList.remove('expanded')
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
    message.append(t('No study history yet'))
    this.listTarget.appendChild(message)
  }
}
