// Bringing an existing database's *content* up to date, as opposed to its
// schema, which is what `migrations.js` is for. Cards, their readings and their
// meanings keep being corrected and translated, and the only copy of them a user
// has is the one imported the day they installed the app. Without this, every
// correction would only ever reach new installs and the two would drift apart.
//
// The shipped `db/flashcards.db` is the authority: it is fetched, opened
// read-only in memory, and the local database is reconciled against it. Reading
// the content out of the same file a fresh install imports is what stops an
// update from disagreeing with an install — there is no second copy of the
// content to keep in step.
//
// Cards are matched on their id first. Both databases descend from the same
// import, so the ids agree, and matching on them means a card whose spelling or
// reading was corrected is *updated* rather than deleted and inserted again —
// which is what keeps the progress on it. Matching on the reference, which is
// built out of the very fields being corrected, cannot do that.
//
// Everything here is idempotent, and gated on a version, so it normally does no
// work at all.

export const VERSION_KEY = 'content_version'
const SOURCE_PATH = '/content-source.db'

export function contentVersion(db) {
  return Number(db.selectValue(
    'SELECT value FROM preferences WHERE key = ?', [VERSION_KEY]
  )) || 0
}

function setContentVersion(db, version) {
  db.exec({
    sql: 'DELETE FROM preferences WHERE key = :key', bind: { ':key': VERSION_KEY }
  })
  db.exec({
    sql: 'INSERT INTO preferences(key, value) VALUES(:key, :value)',
    bind: { ':key': VERSION_KEY, ':value': String(version) }
  })
}

function cards(db) {
  return db.selectObjects(`
    SELECT cards.id, cards.reference, cards.category_id, categories.name AS category,
           json(cards.properties) AS properties
    FROM cards INNER JOIN categories ON categories.id = cards.category_id
  `)
}

// The same content can be serialised with its keys in a different order, and
// that is not a change worth writing.
function sameContent(left, right) {
  const a = JSON.parse(left)
  const b = JSON.parse(right)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])

  return [...keys].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]))
}

// An id match is only believed within the same category, and only when the card
// still looks like the same card: either the reference or the word itself has to
// agree. A user's own card that happens to sit on that id is then left alone
// rather than overwritten.
function recognisable(mine, wanted) {
  if (mine.category !== wanted.category) { return false }
  if (mine.reference === wanted.reference) { return true }

  // Trimmed, because a stray space in the word is one of the things being
  // corrected, and a card must not fail to be recognised over the very fault
  // the update exists to fix.
  const word = (json) => (JSON.parse(json).name || '').trim()

  return word(mine.properties) === word(wanted.properties)
}

// Which local card each shipped card belongs to, what has to change about it,
// and which local cards the shipped content no longer knows about. Worked out
// in full before anything is written, because the writes have to be ordered:
// a reference freed by a deletion may be claimed by an update.
export function plan(db, source) {
  const mine = cards(db)
  const byId = new Map(mine.map((row) => [row.id, row]))
  const byReference = new Map(mine.map((row) => [`${row.category}\t${row.reference}`, row]))

  const matched = new Set()
  const updates = []
  const inserts = []

  for (const wanted of cards(source)) {
    let found = byId.get(wanted.id)
    if (!found || matched.has(found.id) || !recognisable(found, wanted)) {
      found = byReference.get(`${wanted.category}\t${wanted.reference}`)
    }
    if (!found || matched.has(found.id)) { inserts.push(wanted); continue }

    matched.add(found.id)
    if (found.reference !== wanted.reference ||
        !sameContent(found.properties, wanted.properties)) {
      updates.push({ id: found.id, reference: wanted.reference,
                     properties: wanted.properties, was: found.reference })
    }
  }

  const extra = mine.filter((row) => !matched.has(row.id))

  return { updates, inserts, extra }
}

// The point of the exercise is to stop the content drifting, not to take
// progress away to achieve it: a card somebody has answered is never deleted,
// however stale it is.
function studied(db, id) {
  return db.selectValue('SELECT COUNT(*) FROM session_cards WHERE card_id = ?', [id]) > 0
}

// The reference this card would be given today. Used to recognise a card that
// only exists because of a fault since fixed: the bad readings inserted a few
// words twice, once under each spelling, and the shipped content now carries
// only one of them.
function normalisedReference(row) {
  const properties = JSON.parse(row.properties)
  const name = (properties.name || '').trim()
  const kana = properties.kana === undefined || properties.kana === null
    ? null : String(properties.kana).trim().replace(/\)+$/, '')

  return kana === null ? name : `${name}(${kana})`
}

// Folds a duplicate into the card that survived it: the study history moves
// across, the two rows' counts are added where they were both answered in one
// session, and the card keeps whichever label it had got furthest with. Better
// than leaving the pair in place, which shows the word twice in its deck, and
// better than moving the surviving card onto the duplicate's id, which would
// break the only thing the next update can match on.
function absorb(db, drop, keep) {
  const bind = { ':drop': drop, ':keep': keep }
  const of = (column) => `(SELECT twin.${column} FROM session_cards twin
    WHERE twin.session_id = session_cards.session_id AND twin.card_id = :drop)`

  db.exec({
    sql: `UPDATE session_cards SET
            times_studied = times_studied + ${of('times_studied')},
            times_correct = times_correct + ${of('times_correct')},
            studied_at = CASE
              WHEN studied_at IS NULL THEN ${of('studied_at')}
              WHEN ${of('studied_at')} IS NULL THEN studied_at
              ELSE MAX(studied_at, ${of('studied_at')})
            END
          WHERE card_id = :keep AND ${of('times_studied')} IS NOT NULL`,
    bind: bind
  })
  db.exec({
    sql: 'UPDATE OR IGNORE session_cards SET card_id = :keep WHERE card_id = :drop',
    bind: bind
  })
  // Only the parameters a statement actually names: binding a spare one is an
  // error, not something quietly ignored.
  db.exec({ sql: 'DELETE FROM session_cards WHERE card_id = :drop', bind: { ':drop': drop } })
  db.exec({
    sql: `UPDATE cards SET label = (SELECT MAX(label) FROM cards WHERE id IN (:keep, :drop))
          WHERE id = :keep`,
    bind: bind
  })
}

function remove(db, id) {
  db.exec({
    sql: 'DELETE FROM related_cards WHERE owner_card_id = :id OR related_card_id = :id',
    bind: { ':id': id }
  })
  db.exec({ sql: 'DELETE FROM cards WHERE id = :id', bind: { ':id': id } })
}

// The links between a character and the words that use it. Matched by reference
// rather than by id, since a link is a pair and both ends have to have landed.
function relink(db, source) {
  const links = source.selectObjects(`
    SELECT related_cards.relation,
           owner_category.name AS owner_category, owner.reference AS owner_reference,
           related_category.name AS related_category, related.reference AS related_reference
    FROM related_cards
    INNER JOIN cards owner ON owner.id = related_cards.owner_card_id
    INNER JOIN cards related ON related.id = related_cards.related_card_id
    INNER JOIN categories owner_category ON owner_category.id = owner.category_id
    INNER JOIN categories related_category ON related_category.id = related.category_id
  `)

  const ids = new Map(cards(db).map((row) => [`${row.category}\t${row.reference}`, row.id]))

  let added = 0
  for (const link of links) {
    const owner = ids.get(`${link.owner_category}\t${link.owner_reference}`)
    const related = ids.get(`${link.related_category}\t${link.related_reference}`)
    if (!owner || !related) { continue }

    const before = db.changes()
    db.exec({
      sql: `INSERT INTO related_cards(relation, owner_card_id, related_card_id)
            VALUES(:relation, :owner, :related) ON CONFLICT DO NOTHING`,
      bind: { ':relation': link.relation, ':owner': owner, ':related': related }
    })
    if (db.changes() > before) { added += 1 }
  }

  return added
}

export function reconcile(db, source) {
  const report = { updated: 0, added: 0, removed: 0, absorbed: 0, orphaned: 0, categories: 0 }
  const { updates, inserts, extra } = plan(db, source)

  // Out of the way first: a stale card can be holding the reference an update is
  // about to claim, and both are unique within a category.
  const surviving = new Map(cards(db).map((row) => [`${row.category}\t${row.reference}`, row.id]))
  for (const row of extra) {
    if (!studied(db, row.id)) {
      remove(db, row.id)
      report.removed += 1
      continue
    }

    // Studied, so it cannot simply go. If it is the second copy of a word that
    // is still in the content, its history moves onto the copy that survived.
    const twin = surviving.get(`${row.category}\t${normalisedReference(row)}`)
    if (twin !== undefined && twin !== row.id) {
      absorb(db, row.id, twin)
      remove(db, row.id)
      report.absorbed += 1
      continue
    }

    report.orphaned += 1
  }

  // Then the references are parked on a value nothing else can hold, so that two
  // cards swapping references — or shifting along by one — does not trip the
  // constraint halfway through.
  const moving = updates.filter((update) => update.reference !== update.was)
  for (const update of moving) {
    db.exec({
      sql: 'UPDATE cards SET reference = :parked WHERE id = :id',
      bind: { ':id': update.id, ':parked': ` ${update.id}` }
    })
  }

  for (const update of updates) {
    db.exec({
      sql: `UPDATE cards SET reference = :reference, properties = jsonb(:properties)
            WHERE id = :id`,
      bind: { ':id': update.id, ':reference': update.reference,
              ':properties': update.properties }
    })
    report.updated += 1
  }

  const categories = new Map(db.selectObjects('SELECT id, name FROM categories')
    .map((row) => [row.name, row.id]))
  for (const wanted of inserts) {
    if (!categories.has(wanted.category)) {
      categories.set(wanted.category, db.selectValue(
        'INSERT INTO categories(name) VALUES(?) RETURNING id', [wanted.category]
      ))
      report.categories += 1
    }
    // With the shipped id where nothing local holds it, so the two databases go
    // on agreeing and the next update can still match on it. Ids are never
    // reused on the shipping side, so a free id means the same card.
    const free = !db.selectValue('SELECT 1 FROM cards WHERE id = ?', [wanted.id])
    db.exec({
      sql: `INSERT INTO cards(id, category_id, reference, properties)
            VALUES(:id, :category_id, :reference, jsonb(:properties))
            ON CONFLICT DO NOTHING`,
      bind: { ':id': free ? wanted.id : null,
              ':category_id': categories.get(wanted.category),
              ':reference': wanted.reference, ':properties': wanted.properties }
    })
    report.added += 1
  }

  report.links = relink(db, source)

  return report
}

// Opens the shipped database in memory, read-only. Its bytes are already in the
// cache — it is the same file a fresh install imports — so this normally costs
// nothing over the wire.
async function openSource(sqlite3, url) {
  const response = await fetch(url)
  if (!response.ok) { throw new Error(`${url}: ${response.status}`) }

  const bytes = new Uint8Array(await response.arrayBuffer())
  sqlite3.capi.sqlite3_js_posix_create_file(SOURCE_PATH, bytes)

  return new sqlite3.oo1.DB(SOURCE_PATH, 'r')
}

// Returns what it did, or why it did nothing. Never throws: a content update
// that cannot run — offline, most likely — must not stop the app from opening,
// and leaving the version alone is what makes it try again next launch.
export async function update(sqlite3, db, url) {
  const current = contentVersion(db)
  let source = null

  try {
    source = await openSource(sqlite3, url)
    const shipped = contentVersion(source)
    if (shipped <= current) { return { skipped: true, version: current } }

    let report = null
    db.transaction(() => {
      report = reconcile(db, source)
      setContentVersion(db, shipped)
    })

    return { ...report, version: shipped, from: current }
  } catch (error) {
    return { failed: String((error && error.message) || error), version: current }
  } finally {
    if (source) { source.close() }
  }
}
