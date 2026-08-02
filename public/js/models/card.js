import ApplicationRecord from './application_record.js'

export default class Card extends ApplicationRecord {
  // A card is available to study when never studied, or when the SRS interval
  // for its label has elapsed. Expects a `cards` table and a `most_recent`
  // subquery exposing `last_studied`.
  static AVAILABILITY = `
    most_recent.last_studied IS NULL OR most_recent.last_studied < (
      CASE cards.label
        WHEN 0 THEN datetime('now')                -- red
        WHEN 1 THEN datetime('now', '-5 minutes')  -- orange
        WHEN 2 THEN datetime('now', '-3 days')     -- yellow
        WHEN 3 THEN datetime('now', '-9 days')     -- lightgreen
        WHEN 4 THEN datetime('now', '-20 days')    -- green
      END
    )`

  static MOST_RECENT_STUDIES = `
    SELECT session_cards.card_id, MAX(studied_at) last_studied
    FROM session_cards
    INNER JOIN sessions ON sessions.id = session_cards.session_id`

  // Per-label totals for a category, plus how many of each are available now.
  static decks(category_id) {
    return ApplicationRecord.execute(`
      SELECT
        cards.label,
        COUNT(*) as count,
        SUM(CASE WHEN (${this.AVAILABILITY}) THEN 1 ELSE 0 END) as available
      FROM cards
      LEFT JOIN (
        ${this.MOST_RECENT_STUDIES}
        WHERE sessions.category_id = :category_id
        GROUP BY session_cards.card_id
      ) most_recent ON cards.id = most_recent.card_id
      WHERE cards.category_id = :category_id
      GROUP BY cards.label
    `, { category_id: category_id })
  }

  static RELATED_CARDS_QUERY = `
    SELECT c.id, label, json(properties) as properties FROM cards c
    INNER JOIN related_cards rc
            ON :card_id IN (rc.owner_card_id, rc.related_card_id)
           AND c.id IN (rc.owner_card_id, rc.related_card_id)
    WHERE c.id != :card_id;
  `;

  async related() {
    const cards = await ApplicationRecord.execute(
      this.constructor.RELATED_CARDS_QUERY, { card_id: this.id }
    )

    return cards.map((card) => new Card(card));
  }
}
