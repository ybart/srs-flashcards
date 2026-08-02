// Study reminders as calendar events instead of notifications: we hand the user
// an .ics file, their calendar fires the alert. No server, no push subscription,
// no permission prompt, and it works the same on every platform.
//
// Note that a link tapped from the calendar opens the browser, not the installed
// PWA — on iOS that is a different storage context, which is why the app shows
// the demo ribbon there.
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

  static calendar({ at, summary, description, url }) {
    const end = new Date(at.getTime() + this.DURATION_MINUTES * 60 * 1000)
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
      `SUMMARY:${this.escape(summary)}`,
      `DESCRIPTION:${this.escape(description)}`,
      url ? `URL:${this.escape(url)}` : null,
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
