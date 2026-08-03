// Exporting a chart as a picture. The drawing on screen leans on main.css for
// the completion line and on the page for its background, and neither survives
// rasterisation, so the export is composed from scratch with every colour and
// font written into the SVG itself.

import { chart } from './progress_chart.js'

const NS = 'http://www.w3.org/2000/svg'
const WIDTH = 1200
const HEIGHT = 630
const PAD = 56
const CHART_TOP = 190
const CHART_HEIGHT = 320
const BACKGROUND = '#12151c'
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

function element(name, attributes, text) {
  const node = document.createElementNS(NS, name)
  for (const [key, value] of Object.entries(attributes)) { node.setAttribute(key, value) }
  if (text !== undefined) { node.textContent = text }

  return node
}

function label(x, y, text, { size, fill, anchor = 'start', weight = '400' }) {
  return element('text', {
    x: x, y: y, fill: fill, 'font-family': FONT, 'font-size': size,
    'font-weight': weight, 'text-anchor': anchor
  }, text)
}

export function compose({ name, percent, subtitle, footer, series, from, to, columns }) {
  const svg = element('svg', {
    xmlns: NS, viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT
  })

  svg.appendChild(element('rect', { width: WIDTH, height: HEIGHT, fill: BACKGROUND }))
  svg.appendChild(label(PAD, 92, name, { size: 54, fill: '#f2f4f7', weight: '600' }))
  svg.appendChild(label(PAD, 140, subtitle, { size: 28, fill: '#8a93a3' }))
  svg.appendChild(label(WIDTH - PAD, 92, percent, {
    size: 54, fill: '#f2f4f7', weight: '600', anchor: 'end'
  }))

  const inner = chart(series, {
    from: from, to: to, columns: columns, width: WIDTH - PAD * 2, height: CHART_HEIGHT
  })
  inner.setAttribute('x', PAD)
  inner.setAttribute('y', CHART_TOP)
  inner.setAttribute('width', WIDTH - PAD * 2)
  inner.setAttribute('height', CHART_HEIGHT)

  // On screen the line is painted by main.css and asks not to be scaled; in an
  // exported file it has to carry its own paint, and there is no scaling left
  // to opt out of because the chart is built at its final size.
  const line = inner.querySelector('.progress-line')
  line.setAttribute('stroke', '#ffffff')
  line.setAttribute('stroke-width', '4')
  line.setAttribute('stroke-linejoin', 'round')
  line.removeAttribute('vector-effect')
  svg.appendChild(inner)

  svg.appendChild(label(PAD, HEIGHT - 44, footer, { size: 26, fill: '#8a93a3' }))
  svg.appendChild(label(WIDTH - PAD, HEIGHT - 44, 'SRS Flashcards', {
    size: 26, fill: '#8a93a3', anchor: 'end'
  }))

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
