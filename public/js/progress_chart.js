// Stacked-area drawing of the per-session snapshots: green fills from the
// bottom as cards are mastered, gray drains from the top, and the weighted
// completion is drawn over it as a line.

const NS = 'http://www.w3.org/2000/svg'

// Indexed like the snapshots themselves: gray, red, orange, yellow, lightgreen,
// green. Stacked green first so mastery fills upward.
export const COLORS = ['#778787', '#ed3b3b', '#f29132', '#c2bb3b', '#7fe851', '#0a8f45']
const STACK = [5, 4, 3, 2, 1, 0]

// Weighted completion, the same figure the category cards show: a card counts
// for its label, out of a deck where every card is green.
export function completion(dist) {
  const total = 4 * dist.reduce((a, b) => a + b, 0)
  if (!total) { return 0 }

  return 100 * (4 * dist[5] + 3 * dist[4] + 2 * dist[3] + dist[2]) / total
}

// One bucket per column of the drawing, carrying the last known state forward
// over the stretches where nothing was studied. Those flat runs are the point:
// skipping them is what made the old view look busier than the history was.
//
// Bucketing to the drawing rather than to a calendar unit is what keeps three
// years and three weeks the same size to compute and to look at.
export function bucketize(series, from, to, count) {
  const buckets = []
  let carry = series[0].dist
  let index = 0

  for (let i = 0; i < count; i++) {
    const end = from + (to - from) * (i + 1) / count
    while (index < series.length && series[index].time < end) { carry = series[index++].dist }
    buckets.push(carry)
  }

  return buckets
}

// Effort is a flow rather than a state, so an empty bucket is zero — carrying
// the last value forward the way the area chart does would invent work.
export function bucketSum(events, from, to, count, value) {
  const buckets = new Array(count).fill(0)
  const step = (to - from) / count || 1

  for (const event of events) {
    if (event.time < from || event.time > to) { continue }
    buckets[Math.min(count - 1, Math.floor((event.time - from) / step))] += value(event)
  }

  return buckets
}

function element(name, attributes) {
  const node = document.createElementNS(NS, name)
  for (const [key, value] of Object.entries(attributes)) { node.setAttribute(key, value) }

  return node
}

// Effort over the same span as the area above it, scaled to its own busiest
// bucket: the question is which stretches were worked, not how many cards that
// was against some absolute.
export function bars(events, { from, to, value, width = 600, height = 60, columns = 160 }) {
  const buckets = bucketSum(events, from, to, columns, value)
  const peak = Math.max(...buckets) || 1
  const slot = width / columns

  const svg = element('svg', {
    viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none',
    class: 'progress-bars', 'aria-hidden': 'true'
  })

  buckets.forEach((total, i) => {
    if (!total) { return }
    const bar = height * total / peak
    svg.appendChild(element('rect', {
      x: (i * slot).toFixed(2), y: (height - bar).toFixed(2),
      width: Math.max(slot * 0.7, 0.5).toFixed(2), height: bar.toFixed(2)
    }))
  })

  return svg
}

// `series` is [{ time, dist }] sorted oldest first.
export function chart(series, { from, to, width = 600, height = 120, columns = 120 }) {
  const points = bucketize(series, from, to, columns)
  const x = (i) => (width * i / (columns - 1)).toFixed(1)
  const y = (fraction) => (height - height * fraction).toFixed(1)

  const svg = element('svg', {
    viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none',
    class: 'progress-svg', 'aria-hidden': 'true'
  })

  // Cumulative edges, then drawn largest first so each band is left as the
  // ring between its own edge and the next one down.
  let cumulative = new Array(columns).fill(0)
  const layers = []
  for (const band of STACK) {
    cumulative = points.map((dist, i) => {
      const total = dist.reduce((a, b) => a + b, 0) || 1
      return cumulative[i] + dist[band] / total
    })
    layers.push({ band: band, edge: cumulative })
  }

  for (const layer of layers.reverse()) {
    const edge = layer.edge.map((value, i) => `${x(i)},${y(value)}`).join(' ')
    svg.appendChild(element('polygon', {
      points: `${edge} ${width},${height} 0,${height}`, fill: COLORS[layer.band]
    }))
  }

  // The box is stretched to whatever height it is given, so the stroke has to
  // opt out of that scaling or it thins and thickens with the chart.
  svg.appendChild(element('polyline', {
    points: points.map((dist, i) => `${x(i)},${y(completion(dist) / 100)}`).join(' '),
    class: 'progress-line', fill: 'none', 'vector-effect': 'non-scaling-stroke'
  }))

  return svg
}
