// Exporting a chart as a picture. The drawing on screen leans on main.css for
// the completion line and the bars, and on the page for its background, and
// none of that survives rasterisation — so the export is composed from scratch
// with every colour and font written into the SVG itself.
//
// It is composed from the same numbers the row is showing rather than from a
// second reading of the data, so the axis, the range and the metric all carry
// over into the file.

import { GRID, bars, chart } from './progress_chart.js'

const NS = 'http://www.w3.org/2000/svg'
const WIDTH = 1200
const HEIGHT = 630
const PAD = 56
const GUTTER = 78
const CHART_X = PAD + GUTTER
const CHART_W = WIDTH - PAD - CHART_X
const CHART_TOP = 160
const CHART_H = 225
// Deep enough that five ruled values do not crowd: at 74 they sat closer
// together than the type they are labelled with.
const EFFORT_TOP = 405
const EFFORT_H = 125
const TICK_TOP = 534
const TICK_H = 9
const AXIS_Y = 560
const BACKGROUND = '#12151c'
const INK = '#f2f4f7'
const MUTED = '#8a93a3'
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

function element(name, attributes, text) {
  const node = document.createElementNS(NS, name)
  for (const [key, value] of Object.entries(attributes)) { node.setAttribute(key, value) }
  if (text !== undefined) { node.textContent = text }

  return node
}

function label(x, y, text, { size, fill = MUTED, anchor = 'start', weight = '400' }) {
  return element('text', {
    x: x, y: y, fill: fill, 'font-family': FONT, 'font-size': size, 'font-weight': weight,
    'text-anchor': anchor, 'dominant-baseline': 'middle'
  }, text)
}

function place(svg, node, x, y, width, height) {
  node.setAttribute('x', x)
  node.setAttribute('y', y)
  node.setAttribute('width', width)
  node.setAttribute('height', height)
  svg.appendChild(node)
}

export function compose(options) {
  const svg = element('svg', {
    xmlns: NS, viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT
  })

  svg.appendChild(element('rect', { width: WIDTH, height: HEIGHT, fill: BACKGROUND }))
  svg.appendChild(label(PAD, 74, options.name, { size: 50, fill: INK, weight: '600' }))
  svg.appendChild(label(PAD, 124, options.subtitle, { size: 26 }))
  svg.appendChild(label(WIDTH - PAD, 74, options.percent, {
    size: 50, fill: INK, weight: '600', anchor: 'end'
  }))

  const area = chart(options.series, {
    from: options.from, to: options.to, columns: options.columns,
    width: CHART_W, height: CHART_H
  })
  // On screen the completion line is painted by main.css and asks not to be
  // scaled; here it carries its own paint and there is no scaling to opt out
  // of, the chart being built at its final size.
  const line = area.querySelector('.progress-line')
  line.setAttribute('stroke', '#ffffff')
  line.setAttribute('stroke-width', '4')
  line.setAttribute('stroke-linejoin', 'round')
  line.removeAttribute('vector-effect')
  place(svg, area, CHART_X, CHART_TOP, CHART_W, CHART_H)

  for (const fraction of GRID) {
    svg.appendChild(label(CHART_X - 16, CHART_TOP + CHART_H * (1 - fraction),
      `${Math.round(fraction * 100)}%`, { size: 22, anchor: 'end' }))
  }

  const effort = bars(options.events, {
    from: options.from, to: options.to, columns: options.columns,
    value: options.value, scale: options.scale, width: CHART_W, height: EFFORT_H
  })
  // currentColor for the rules; the bars carry their own fill.
  effort.setAttribute('fill', MUTED)
  effort.setAttribute('color', '#3a4150')
  for (const rect of effort.querySelectorAll('rect')) { rect.setAttribute('fill-opacity', '0.55') }
  place(svg, effort, CHART_X, EFFORT_TOP, CHART_W, EFFORT_H)

  const peak = Number(effort.dataset.peak)
  for (const tick of (effort.dataset.ticks || '').split(',').filter(Boolean)) {
    svg.appendChild(label(CHART_X - 16, EFFORT_TOP + EFFORT_H * (1 - Number(tick) / peak),
      options.formatTick(tick), { size: 22, anchor: 'end' }))
  }

  // Same count either way, so a wide export is not left with two dates. Each
  // gets a tick: the outer labels are pulled inside the frame to stay on the
  // picture, so on their own they would only point roughly.
  for (let i = 0; i < 5; i++) {
    // The axis decides where its own tick belongs: evenly spaced to begin with,
    // then moved onto whatever its label names.
    const { position, label: text } = options.pointAt(i / 4)
    const x = CHART_X + CHART_W * position
    svg.appendChild(element('line', {
      x1: x, x2: x, y1: TICK_TOP, y2: TICK_TOP + TICK_H, stroke: MUTED, 'stroke-width': 2
    }))
    svg.appendChild(label(x, AXIS_Y, text, {
      size: 22, anchor: i === 0 ? 'start' : (i === 4 ? 'end' : 'middle')
    }))
  }

  svg.appendChild(label(PAD, HEIGHT - 30, options.footer, { size: 24 }))
  svg.appendChild(label(WIDTH - PAD, HEIGHT - 30, 'SRS Flashcards', { size: 24, anchor: 'end' }))

  return svg
}

export function render(svg) {
  const source = new XMLSerializer().serializeToString(svg)
  const image = new Image()

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      canvas.getContext('2d').drawImage(image, 0, 0, WIDTH, HEIGHT)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('toBlob returned nothing')), 'image/png'
      )
    }
    image.onerror = () => reject(new Error('the chart could not be rasterised'))
    // A data URL keeps the canvas untainted, which a blob: URL would not.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  })
}

export async function download(options) {
  const blob = await render(compose(options))
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${options.filename}.png`
  // Same as the calendar file: the anchor has to be in the document when it is
  // clicked, and the URL has to outlive the click.
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
