import ApplicationRecord from './application_record.js'
import Card from './card.js'

export default class Category extends ApplicationRecord {
  // Per-category counts driving the availability dot: studied cards that are
  // due now, and never-studied cards (always available).
  static availability() {
    return ApplicationRecord.execute(`
      SELECT
        cards.category_id,
        SUM(CASE WHEN cards.label IS NOT NULL AND (${Card.AVAILABILITY})
                 THEN 1 ELSE 0 END) as available_studied,
        SUM(CASE WHEN cards.label IS NULL THEN 1 ELSE 0 END) as unstudied
      FROM cards
      LEFT JOIN (
        ${Card.MOST_RECENT_STUDIES}
        GROUP BY session_cards.card_id
      ) most_recent ON cards.id = most_recent.card_id
      GROUP BY cards.category_id
    `)
  }

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
