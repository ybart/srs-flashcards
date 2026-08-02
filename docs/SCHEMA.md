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