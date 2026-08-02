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
  // to stay after something (a card coming back up), down when it has to stay
  // before something (the start of a usual session).
  static ceilToQuarter(date) {
    return new Date(Math.ceil(date.getTime() / this.QUARTER) * this.QUARTER)
  }

  static floorToQuarter(date) {
    return new Date(Math.floor(date.getTime() / this.QUARTER) * this.QUARTER)
  }

  // A short memory, so a change of habit is picked up within a couple of weeks.
  // Measured on a 25k-event database the answer is the same at every window from
  // 3 to 30 study days, so there is nothing to gain by remembering longer.
  static WINDOW_DAYS = 15
  // Sessions vote with the cards they covered. That weighting is the whole
  // method: on a real history it holds the same hour across every window, where
  // counting sessions equally wanders across five. Smoothing each hour with its
  // neighbours was tried and removed — it changed not one answer that the
  // weighting had not already fixed.
  static MINIMUM_SESSIONS = 3
  // A habit is something done on more than one day. Three sessions in a single
  // afternoon would otherwise fix a daily reminder to that afternoon.
  static MINIMUM_DAYS = 2

  // The hour of day someone actually studies, from their recent real sessions.
  // Whole hours, because finer buckets let one busy quarter of an hour outvote a
  // habit spread over a wider band — and the answer is rounded to the quarter
  // hour on its way into the event anyway.
  //
  // Returns null when there is too little history to say anything.
  static habitualTime(sessions) {
    if (!sessions || sessions.length < this.MINIMUM_SESSIONS) { return null }

    const dated = sessions.map((session) => ({
      at: RelativeDate.dateFromSqliteTimestamp(session.started_at), cards: session.cards
    }))

    // The query hands them over newest first, so counting days as we go keeps
    // the most recent ones. Days studied, not days elapsed: a fortnight away
    // from the app should not empty the window.
    const recent = []
    const days = new Set()
    for (const session of dated) {
      const day = session.at.toDateString()
      if (!days.has(day)) {
        if (days.size >= this.WINDOW_DAYS) { break }
        days.add(day)
      }
      recent.push(session)
    }

    // Someone who studies rarely still gets an answer, just a longer-baselined one.
    const pool = recent.length >= this.MINIMUM_SESSIONS ? recent : dated
    const spread = new Set(pool.map((session) => session.at.toDateString()))
    if (pool.length < this.MINIMUM_SESSIONS || spread.size < this.MINIMUM_DAYS) { return null }

    const cards = new Array(24).fill(0)
    const minutes = Array.from({ length: 24 }, () => [])

    for (const session of pool) {
      cards[session.at.getHours()] += session.cards
      minutes[session.at.getHours()].push(session.at.getMinutes())
    }

    // The hour carries the signal; the minute only decides how far before the
    // usual start the reminder lands, once the caller floors it to a quarter.
    const hour = cards.indexOf(Math.max(...cards))
    const sorted = minutes[hour].sort((a, b) => a - b)

    return { hour: hour, minute: sorted[Math.floor(sorted.length / 2)] || 0 }
  }

  // First occurrence of a recurring reminder: one period out, at the time the
  // user studies at — or failing that, the time of day it is now. Flooring to
  // the quarter puts it at most 14 minutes before the usual start and never
  // after it: a reminder that arrives once the session would already be under
  // way has missed its job, and "now" is itself a time the user is mid-study.
  // Firing the first one immediately would just be noise.
  static nextOccurrence(repeat, habitual = null) {
    const date = new Date()

    if (repeat === 'daily') { date.setDate(date.getDate() + 1) }
    else if (repeat === 'weekly') { date.setDate(date.getDate() + 7) }
    else { date.setMonth(date.getMonth() + 1) }

    if (habitual) { date.setHours(habitual.hour, habitual.minute, 0, 0) }

    return this.floorToQuarter(date)
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
