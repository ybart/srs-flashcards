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
- `started_at` (timestamp): Session begin time
- `finished_at` (timestamp): Session end time
- `deck_id` (integer): Associated study deck
- `cards_studied` (integer): Count of reviewed cards
- `accuracy_rate` (float): Correct answer percentage

## Relationships
- Cards belong to Categories (many-to-one)
- Sessions track Cards (many-to-many via join table)
- Preferences apply globally 