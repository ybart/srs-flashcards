import { languageTag } from '../i18n.js'

export default class RelativeDate {
  constructor(date) {
    this.date = date
  }

  static dateFromSqliteTimestamp(timestamp) {
    return new Date(timestamp.replace(' ', 'T') + 'Z')
  }

  // The chosen language rather than the browser's, so that overriding the one
  // also moves "in 3 days" and "yesterday".
  static formatter = new Intl.RelativeTimeFormat(languageTag(), {
    numeric: "auto",
  })

  static DIVISIONS = [
    { amount: 60, name: "seconds" },
    { amount: 60, name: "minutes" },
    { amount: 24, name: "hours" },
    { amount: 7, name: "days" },
    { amount: 4.34524, name: "weeks" },
    { amount: 12, name: "months" },
    { amount: Number.POSITIVE_INFINITY, name: "years" },
  ]

  format() {
    let duration = (this.date - new Date()) / 1000

    for (let i = 0; i < this.constructor.DIVISIONS.length; i++) {
      const division = this.constructor.DIVISIONS[i]
      if (Math.abs(duration) < division.amount) {
        return this.constructor.formatter.format(Math.round(duration), division.name)
      }
      duration /= division.amount
    }
  }
}
