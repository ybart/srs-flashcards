import ApplicationRecord from './application_record.js'
import Card from './card.js'

export default class Session extends ApplicationRecord {
  static async create(attributes = {}) {
    const id = (await ApplicationRecord.execute(`
      INSERT INTO sessions(category_id, started_at)
      VALUES(
        :category_id,
        datetime('now', 'subsec')
      ) RETURNING id`, { category_id: attributes.category }))[0].id;

    // TODO: Close all other open sessions after creating a new one.
    // TODO: Add a CHECK constraint ensuring only one session is open in DB.

    const session = new Session({ ...attributes, id });
    await session.saveProgress();

    return session;
  }

  // `progress` is an absolute snapshot of the category's card distribution,
  // taken when the session opens and after every answer. The progress view
  // charts one bar per snapshot; the migration in `migrations.js` rebuilt the
  // same shape for the sessions that predate this.
  static SAVE_PROGRESS_QUERY = `
    UPDATE sessions
    SET progress = jsonb((
      SELECT json_object(
        'gray',       SUM(label IS NULL),
        'red',        SUM(label IS 0),
        'orange',     SUM(label IS 1),
        'yellow',     SUM(label IS 2),
        'lightgreen', SUM(label IS 3),
        'green',      SUM(label IS 4)
      )
      FROM cards WHERE cards.category_id = sessions.category_id
    ))
    WHERE id = :id
  `

  async saveProgress() {
    await ApplicationRecord.execute(this.constructor.SAVE_PROGRESS_QUERY, { id: this.id })
  }

  // How long an answer can be credited with. The span from a session's first
  // answer to its last would charge a tab left open over lunch; counting the gap
  // before each answer and capping it bills only the time worked. On a real
  // history the cap leaves ordinary sessions alone — median 3.6 minutes either
  // way — and cuts a 2.5 hour span down to the 10 minutes spent inside it.
  static ACTIVE_GAP_SECONDS = 60

  // Reviews and active time per session, for the effort chart. A review is one
  // answer: a card missed and asked again counts each time, which is what makes
  // it a measure of work rather than of ground covered.
  static EFFORT_QUERY = `
    WITH answers AS (
      SELECT
        session_cards.session_id,
        sessions.category_id,
        session_cards.studied_at,
        session_cards.times_studied,
        (julianday(session_cards.studied_at) - julianday(COALESCE(
          LAG(session_cards.studied_at) OVER (
            PARTITION BY session_cards.session_id ORDER BY session_cards.studied_at
          ),
          sessions.started_at
        ))) * 86400 AS gap
      FROM session_cards
      INNER JOIN sessions ON sessions.id = session_cards.session_id
      WHERE session_cards.studied_at IS NOT NULL AND session_cards.times_studied > 0
    )
    SELECT
      category_id,
      MIN(studied_at) as started_at,
      SUM(times_studied) as reviews,
      SUM(MIN(MAX(gap, 0), ${this.ACTIVE_GAP_SECONDS})) as seconds
    FROM answers
    GROUP BY session_id
    ORDER BY started_at
  `

  static effort() {
    return ApplicationRecord.execute(this.EFFORT_QUERY)
  }

  // When the recent real study sessions started, and how much was covered in
  // each. Sessions under ten cards are noise — opening the app and answering
  // twice says nothing about when someone studies — so they are left out.
  static STUDY_TIMES_QUERY = `
    SELECT MIN(studied_at) as started_at, COUNT(*) as cards
    FROM session_cards
    WHERE studied_at IS NOT NULL AND times_studied > 0
    GROUP BY session_id
    HAVING cards >= 10
    ORDER BY started_at DESC
    LIMIT 100
  `

  static studyTimes() {
    return ApplicationRecord.execute(this.STUDY_TIMES_QUERY)
  }

  // Every snapshot ever recorded, oldest first, for the progress view to group
  // by category. Sessions where nothing was answered carry no snapshot and are
  // left out. One query for the whole page: a category's history is a few
  // hundred rows at most, and the alternative is a round trip per category.
  static history() {
    return ApplicationRecord.execute(`
      SELECT category_id, started_at, json(progress) as progress
      FROM sessions
      WHERE progress IS NOT NULL
      ORDER BY started_at
    `)
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

    await this.saveProgress();
  }
}
