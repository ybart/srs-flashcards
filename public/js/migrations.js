// Data/schema migrations applied to the persistent database when it is opened.
//
// Each migration carries a `version`; once it has run, `PRAGMA user_version` is
// set to that number, so a migration runs at most once per database. Add new
// migrations at the end of MIGRATIONS with the next version number, and stamp
// the shipped `public/db/flashcards.db` with the same number so fresh installs
// skip work that only concerns existing data.

// Order of the distribution buckets used by `sessions.progress`.
export const LABELS = ['gray', 'red', 'orange', 'yellow', 'lightgreen', 'green']

// Bucket index of a card label (NULL label = never studied = gray).
export function labelIndex(label) {
  return (label === null || label === undefined) ? 0 : label + 1
}

export function distribution(counts) {
  return Object.fromEntries(LABELS.map((label, index) => [label, counts[index]]))
}

// Label a card ends on after one `session_cards` row, given the label it had
// before. Only per-row totals are stored (not the order of the answers), so we
// assume the wrong answers came first — which is what the study loop produces,
// since a card is re-asked until it is answered correctly. A wrong answer sends
// the card back to red, each correct one moves it up one deck, capped at green.
export function replayRow(previous, timesStudied, timesCorrect) {
  const wrong = timesStudied - timesCorrect
  const base = wrong > 0 ? 0 : (previous ?? 0)
  return Math.min(4, base + timesCorrect)
}

// Replay every study event in chronological order, keeping a running per-category
// distribution and snapshotting it after each event. The snapshot of a session is
// therefore the state right after its last answer.
//
// `cards` is [{ id, category_id }], `events` is [{ session_id, card_id,
// times_studied, times_correct }] ordered by `studied_at`. Returns the snapshots
// keyed by session id, and the reconstructed card labels so callers can compare
// them with the labels actually stored on the cards.
export function replayHistory(cards, events) {
  const categoryOf = new Map()
  const counts = new Map()

  for (const card of cards) {
    categoryOf.set(card.id, card.category_id)
    if (!counts.has(card.category_id)) { counts.set(card.category_id, [0, 0, 0, 0, 0, 0]) }
    counts.get(card.category_id)[0] += 1 // every card starts unstudied
  }

  const labels = new Map()
  const snapshots = new Map()

  for (const event of events) {
    const category = categoryOf.get(event.card_id)
    if (category === undefined) { continue } // card removed since it was studied

    const previous = labels.has(event.card_id) ? labels.get(event.card_id) : null
    const next = replayRow(previous, event.times_studied, event.times_correct)
    const bucket = counts.get(category)

    bucket[labelIndex(previous)] -= 1
    bucket[labelIndex(next)] += 1
    labels.set(event.card_id, next)

    snapshots.set(event.session_id, bucket.slice())
  }

  return { snapshots, labels }
}

// `sessions.progress` used to hold a relative delta that was never persisted
// (always all zeros). It now holds an absolute snapshot of the category's card
// distribution. Rebuild the history from `session_cards` so the progress view
// has something to show; it is approximate, since neither the order of the
// answers nor the resulting label was recorded per event.
const RECONSTRUCT_PROGRESS = {
  version: 1,
  name: 'reconstruct session progress snapshots',
  run(db) {
    const cards = db.selectObjects('SELECT id, category_id FROM cards')
    const events = db.selectObjects(`
      SELECT session_id, card_id, times_studied, times_correct
      FROM session_cards
      WHERE studied_at IS NOT NULL AND times_studied > 0
      ORDER BY studied_at
    `)

    const { snapshots } = replayHistory(cards, events)

    // Sessions without a single answer get no snapshot: the old all-zero value
    // would otherwise read as "no cards at all" in the progress view.
    db.exec('UPDATE sessions SET progress = NULL')

    const update = db.prepare('UPDATE sessions SET progress = jsonb(:progress) WHERE id = :id')
    try {
      for (const [id, counts] of snapshots) {
        update.bind({ ':id': id, ':progress': JSON.stringify(distribution(counts)) }).stepReset()
      }
    } finally {
      update.finalize()
    }
  }
}

export const MIGRATIONS = [RECONSTRUCT_PROGRESS]

// Run every migration the database has not seen yet, each in its own transaction
// together with the `user_version` bump, so a failure leaves the database on the
// last version that fully applied.
export function migrate(db) {
  const current = db.selectValue('PRAGMA user_version')

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) { continue }

    console.log(`migrations.js: applying ${migration.version} (${migration.name})`)
    db.transaction(() => {
      migration.run(db)
      db.exec(`PRAGMA user_version = ${migration.version}`)
    })
  }
}
