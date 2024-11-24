import ApplicationRecord from './application_record.js'

export default class Category extends ApplicationRecord {
  static all() {
    return ApplicationRecord.execute(`
      SELECT categories.id, categories.name, sessions.started_at, json(sessions.progress),
        (SELECT COUNT(*) FROM cards WHERE cards.category_id = categories.id) cards_count
      FROM categories
      LEFT JOIN (
        SELECT category_id, MAX(started_at) most_recent FROM sessions
        GROUP BY sessions.category_id
      ) last_sessions ON last_sessions.category_id = categories.id
      LEFT JOIN sessions
        ON last_sessions.category_id = sessions.category_id
        AND last_sessions.most_recent = sessions.started_at;
    `)
  }
}
