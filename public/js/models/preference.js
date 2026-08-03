import ApplicationRecord from './application_record.js'

// The `preferences` table, which until now nothing in the app read. It holds the
// content version — how far the card corrections in the shipped database have
// been applied to this one, see content.js — and that is worth being able to read
// without a console attached.
export default class Preference extends ApplicationRecord {
  static async get(key) {
    const rows = await ApplicationRecord.execute(
      'SELECT value FROM preferences WHERE key = :key', { key: key }
    )

    return rows.length ? rows[0].value : null
  }

  static contentVersion() {
    return this.get('content_version')
  }
}
