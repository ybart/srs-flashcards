# Database Schema

## Preferences
- `name` (string): Internal identifier used in code
- `description` (string): Human-readable explanation of the preference

## Cards
- `id` (integer): Unique identifier
- `question` (text): Front side content
- `answer` (text): Back side content
- `jlpt_level` (string): N5 to N1 classification
- `category_id` (integer): Associated study category
- `studied_at` (timestamp): Last review time
- `srs_status` (string): Mastery level (gray/orange/yellow/green)

## Categories
- `id` (integer): Unique identifier
- `name` (string): Display name (e.g., "JLPT N5 Kanji")
- `description` (text): Optional explanation
- `last_studied` (timestamp): Most recent session date

## Study Sessions
- `id` (integer): Unique identifier
- `category_id` (integer): Studied category
- `started_at` (timestamp): Session begin time
- `finished_at` (timestamp): Session end time
- `progress` (jsonb): Absolute snapshot of the category's card distribution,
  written when the session opens and after every answer:
  `{"gray": n, "red": n, "orange": n, "yellow": n, "lightgreen": n, "green": n}`.
  `gray` counts the never-studied cards (`label IS NULL`). The progress view
  charts one bar per snapshot. `NULL` when nothing was ever answered in the
  session.

## Relationships
- Cards belong to Categories (many-to-one)
- Sessions track Cards (many-to-many via join table)
- Preferences apply globally

## Card properties

`cards.properties` is a JSON blob, so a new field needs no schema change. Kanji
and words carry different ones:

| Field | Cards | Meaning |
| --- | --- | --- |
| `name` | all | the character or the word, as shown |
| `meaning` | all | English meaning, 1 to 3 glosses joined by ", " |
| `meaning_fr` | all | the same in French, same shape |
| `kana` | words | the reading, shown as the phonetics under the word |
| `on_yomi`, `kun_yomi` | kanji | readings, as arrays |

The French meanings come from EDRDG's own data — the `m_lang="fr"` meanings in
KANJIDIC2 and the `xml:lang="fre"` glosses in JMdict, which together cover 7049
of the 7585 cards — with the remaining 541 translated for this app and kept in
`data/translations/fr.json` so they survive a rebuild of the database. Both
sources are CC BY-SA, which is what the credits screen is for.

## Content updates

`public/db/flashcards.db` is the authority for content, not just the file a fresh
install imports. `public/js/content.js` fetches it on every launch, opens it
read-only in memory and reconciles the local database against it, so a correction
to a reading or a meaning reaches the databases already in OPFS instead of only
ever reaching new installs.

`preferences.content_version` records the version the local database has caught up
with; the shipped file carries the same key with the version it *is*. When they
match, which is the normal case, nothing runs.

A word that belongs to two decks is two cards, and stays two cards: everything
here is keyed on `(category, reference)`, so the 863 words shared between levels
are never folded together. Only a word duplicated *within* one deck is a fault,
and there were five of those.

Cards are matched on their id first — both databases descend from the same import
— and on `(category, reference)` only as a fallback. That ordering is what lets a
card's reading be corrected without losing the progress on it: the same id is
updated in place rather than a new card being inserted and the old one dropped. A
card the shipped content no longer carries is deleted only if nobody ever answered
it; otherwise it is left alone and counted as orphaned.

`cards.id` is `AUTOINCREMENT` for exactly this reason: the id is the match key,
so an id retired with a deleted card must never be handed to a different one.
Without it SQLite reuses the largest free rowid, and the next word added would
inherit a deleted word's id — and with it, somebody's progress. The five ids the
merged duplicates gave up (446, 6472, 6693, 6773, 6968) are retired for good.

| Version | Content |
| --- | --- |
| 1 | French meanings on every card; readings cut free of the bracket the scraper left on 1339 of them; five duplicate words merged |

## Migrations

The database is versioned with `PRAGMA user_version`. On every open — and after
an import, since an uploaded file can come from any older version — the worker
runs the migrations from `public/js/migrations.js` whose version is above the
one stored, each in a transaction that also bumps `user_version`.

When adding a migration, stamp `public/db/flashcards.db` with the new version
(`sqlite3 public/db/flashcards.db "PRAGMA user_version = N;"`) so fresh installs
skip work that only concerns existing data.

| Version | Migration |
| --- | --- |
| 1 | Reconstruct `sessions.progress` snapshots by replaying `session_cards` | 