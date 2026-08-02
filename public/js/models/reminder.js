// Study reminders as calendar events instead of notifications: we hand the user
// an .ics file, their calendar fires the alert. No server, no push subscription,
// no permission prompt, and it works the same on every platform.
//
// Note that a link tapped from the calendar opens the browser, not the installed
// PWA — on iOS that is a different storage context, which is why the app shows
// the demo ribbon there.
import RelativeDate from './relative_date.js'

export default class Reminder {
  static PRODID = '-//SRS Flashcards//Study reminder//EN'
  static DURATION_MINUTES = 15

  // RFC 5545 UTC timestamp: 20260805T103000Z
  static timestamp(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }

  // Backslashes, semicolons and commas are separators in a property value, and
  // newlines have to travel escaped.
  static escape(text) {
    return String(text)
      .replace(/([\\;,])/g, '\\$1')
      .replace(/\n/g, '\\n')
  }

  // Content lines are limited to 75 octets; continuations start with a space.
  static fold(line) {
    if (line.length <= 75) { return line }

    const parts = [line.slice(0, 75)]
    for (let i = 75; i < line.length; i += 74) { parts.push(` ${line.slice(i, i + 74)}`) }

    return parts.join('\r\n')
  }

  static FREQUENCIES = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }

  // Whether a link in the event can reach the installed app. On iOS it cannot:
  // a home-screen web app has no way to claim an https URL (that needs Universal
  // Links, which are for App Store apps), so Calendar hands the link to Safari —
  // a separate storage container, where the user finds the demo build and none
  // of their progress. Better no link at all than one that lands there.
  static linksReachTheApp() {
    const platform = navigator.platform || ''
    const ios = /iPad|iPhone|iPod/.test(platform) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    return !ios
  }

  static QUARTER = 15 * 60 * 1000

  // A reminder landing at 14:02:47 reads like a bug. Round up when the time has
  // to stay after something (a card coming back up), nearest otherwise.
  static ceilToQuarter(date) {
    return new Date(Math.ceil(date.getTime() / this.QUARTER) * this.QUARTER)
  }

  static roundToQuarter(date) {
    return new Date(Math.round(date.getTime() / this.QUARTER) * this.QUARTER)
  }

  // The time of day someone actually studies, from their recent real sessions.
  // Every hour scores its neighbours as well as itself, so a single long session
  // at an odd hour cannot decide the answer: on a 25k-event database this lands
  // on the same hour from five sessions up to 551, where picking the longest
  // recent session instead swings across nine hours depending on the window.
  // Returns null when there is too little history to say anything.
  static habitualTime(sessions) {
    if (!sessions || sessions.length < 3) { return null }

    const cards = new Array(24).fill(0)
    const minutes = Array.from({ length: 24 }, () => [])

    for (const session of sessions) {
      const at = RelativeDate.dateFromSqliteTimestamp(session.started_at)
      cards[at.getHours()] += session.cards
      minutes[at.getHours()].push(at.getMinutes())
    }

    let hour = 0
    let best = -1
    for (let candidate = 0; candidate < 24; candidate++) {
      const score = cards[(candidate + 23) % 24] + 2 * cards[candidate] + cards[(candidate + 1) % 24]
      if (score > best) { best = score; hour = candidate }
    }

    const sorted = minutes[hour].sort((a, b) => a - b)

    return { hour: hour, minute: sorted[Math.floor(sorted.length / 2)] || 0 }
  }

  // First occurrence of a recurring reminder: one period out, at the hour the
  // user studies at — or failing that, the time of day it is now. Firing the
  // first one immediately would just be noise.
  static nextOccurrence(repeat, habitual = null) {
    const date = new Date()

    if (repeat === 'daily') { date.setDate(date.getDate() + 1) }
    else if (repeat === 'weekly') { date.setDate(date.getDate() + 7) }
    else { date.setMonth(date.getMonth() + 1) }

    if (habitual) { date.setHours(habitual.hour, habitual.minute, 0, 0) }

    return this.roundToQuarter(date)
  }

  static calendar({ at, summary, description, url, repeat }) {
    const end = new Date(at.getTime() + this.DURATION_MINUTES * 60 * 1000)
    // Where a link cannot reach the app, say so rather than leaving the reminder
    // with nothing to act on.
    const body = this.linksReachTheApp()
      ? description
      : `${description}\nOpen SRS Flashcards from your home screen.`
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:${this.PRODID}`,
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${crypto.randomUUID()}@srs-flashcards`,
      `DTSTAMP:${this.timestamp(new Date())}`,
      `DTSTART:${this.timestamp(at)}`,
      `DTEND:${this.timestamp(end)}`,
      this.FREQUENCIES[repeat] ? `RRULE:FREQ=${this.FREQUENCIES[repeat]}` : null,
      `SUMMARY:${this.escape(summary)}`,
      `DESCRIPTION:${this.escape(body)}`,
      url && this.linksReachTheApp() ? `URL:${this.escape(url)}` : null,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${this.escape(summary)}`,
      'TRIGGER:PT0S', // at the start of the event
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]

    return lines.filter(Boolean).map((line) => this.fold(line)).join('\r\n')
  }

  // Hand the file to the OS; the calendar app takes it from there.
  static download(attributes) {
    const blob = new Blob(
      [this.calendar(attributes)], { type: 'text/calendar;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = 'srs-flashcards-reminder.ics'
    // The anchor has to be in the document when it is clicked, and the object
    // URL has to outlive the click: a detached anchor or a URL revoked in the
    // same tick both end with nothing being downloaded.
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}
