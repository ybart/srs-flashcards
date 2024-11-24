import ApplicationRecord from './application_record.js'
import Card from './card.js'

export default class Session extends ApplicationRecord {
  static async create(attributes = {}) {
    const progress = JSON.stringify(attributes.progress)

    const id = (await ApplicationRecord.execute(`
      INSERT INTO sessions(category_id, started_at, progress)
      VALUES(
        :category_id,
        datetime('now', 'subsec'),
        jsonb(:progress)
      ) RETURNING id`, { category_id: attributes.category, progress: progress }))[0].id;

    // TODO: Close all other open sessions after creating a new one.
    // TODO: Add a CHECK constraint ensuring only one session is open in DB.

    // let clonedAttribues = JSON.parse(JSON.stringify(attributes))
    return new Session({ ...attributes, ...{ id: id } })
  }

  // Cards for all sessions of the session category
  // - include the session data when it exists
  // - limiting the results to session_limit
  // - excluding recently studied cards
  // - ordered by label (showing first those closer to green).
  static PICK_CARD_QUERY = `
    SELECT cards.id, label, json(properties) as properties
    FROM cards
    LEFT JOIN (
      SELECT card_id, session_id, MAX(studied_at) last_studied
      FROM session_cards
      INNER JOIN sessions
        ON sessions.id = session_cards.session_id
      WHERE category_id = :category_id
      GROUP BY session_cards.card_id
    ) most_recent_studies ON cards.id = most_recent_studies.card_id
    LEFT JOIN session_cards
      ON session_cards.card_id = most_recent_studies.card_id
      AND session_cards.session_id = most_recent_studies.session_id
    WHERE
      cards.category_id = :category_id
      AND cards.id NOT IN (SELECT value FROM json_each(:excluded))
      AND (
        last_studied IS NULL
        OR last_studied < ( -- exclude recently studied cards
            CASE label
              WHEN 0 THEN datetime('now')                -- red
              WHEN 1 THEN datetime('now', '-5 minutes') -- orange
              WHEN 2 THEN datetime('now', '-3 days')    -- yellow
              WHEN 3 THEN datetime('now', '-9 days')    -- lightgreen
              WHEN 4 THEN datetime('now', '-20 days')   -- green
            END
        )
      )
    ORDER BY label DESC NULLS LAST, RANDOM()
    LIMIT :session_limit
  `

  async pick_cards(session_limit = 10, excluded = []) {
    const cards = await ApplicationRecord.execute(
      this.constructor.PICK_CARD_QUERY,
      {
        category_id: this.category, excluded: JSON.stringify(excluded),
        session_limit: session_limit
      }
    )

    const rows = cards.map((card) => { return { "session_id": this.id, "card_id": card.id } })
    // TODO: Si un carte choisie est liée à une session précédente de la même catégorie,
    //       déplacer son association à la session vers la session en cours.
    await ApplicationRecord.execute(
      `INSERT INTO session_cards (session_id, card_id)
       SELECT json_extract(value, '$.session_id'), json_extract(value, '$.card_id')
       FROM json_each(:values) WHERE true
       ON CONFLICT DO NOTHING`,
      { values: JSON.stringify(rows) }
    )

    return cards.map((card) => new Card(card))
  }

  async updateCard(card, correct) {
    await ApplicationRecord.execute(`
        UPDATE cards SET label = :label WHERE id = :id;
      `, { id: card.id, label: card.label });

    await ApplicationRecord.execute(`
        UPDATE session_cards
        SET
          studied_at = datetime('now', 'subsec'),
          times_studied = times_studied + 1,
          times_correct = times_correct + :correct_count
        WHERE session_id = :session_id AND card_id = :card_id;
      `, { session_id: this.id, card_id: card.id, correct_count: correct ? 1 : 0 });
  }
}
