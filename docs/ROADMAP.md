# Roadmap

Ordered by priority: the sections before "After 1.0" are what the release needs,
and within each section the order is the intended order of work.

## 1.0

1. [x] **Browser-mode demo banner** — outside an installed PWA, show a diagonal
   ribbon in a corner linking to the install instructions and explaining the
   caveats (browser storage can be evicted, so progress is not safe until the
   app is installed). Persistent storage behaves in the installed PWA, so this
   replaces asking for `navigator.storage.persist()` for now.
2. [x] **Next available card** — when the deck is empty (and in the category list)
   show when the next card will be available for study. Closes the dead end left
   by blocking study on categories with nothing available.
3. [x] **Calendar reminders** — generate an `.ics` the user adds to their calendar
   instead of chasing web push: the OS fires the alert, so there is no server,
   no permission prompt and no platform gap. Offer it when a deck runs dry, at
   the moment we already know when the next card is due.
   - Shipped: a calendar icon on the empty-deck screen hands over one `VEVENT`
     at the moment a full deck of ten cards is available again — not the single
     next card, which would send you back to a two-card session — with a
     `VALARM` on the start and a `URL` deep-linking to that category.
   - The time is a proposal, not a prediction: the calendar's own edit UI is
     where the user adjusts it, so the heuristic only has to be plausible. It
     votes on the hour of the recent sessions of at least ten cards and needs
     two separate study days, which is what stops one evening's three sessions
     from pinning a daily reminder to that evening. Do not add a time picker to
     the app for this.
   - Measured on 130 real Anki collections (4.5M reviews, from the gated
     `open-spaced-repetition/anki-revlogs-10k` dataset, whose per-user parquet
     partitions survive the anonymisation even though absolute timestamps do
     not — `elapsed_seconds - 86400 * elapsed_days` recovers the drift in time
     of day between two reviews of one card):
     - A study hour is real but weak. The median user repeats within an hour of
       the same clock time on 16 % of days, against 8 % by chance, and drifts a
       median of 4 hours from one day to the next. Not one of the 130 manages
       half their repeats within an hour.
     - Over 1.27M predictions, the modal hour is no better than simply reusing
       the last session's time (2.32h vs 2.26h median error, 27 % vs 28 % within
       an hour); both beat a uniform guess at 6h by a wide margin.
     - The vote is kept anyway, for robustness rather than accuracy: "now" is a
       single draw, so setting a recurring reminder at an odd hour would repeat
       that hour forever, where a central tendency cannot be moved by one moment.
     - Times floor to the quarter hour so the reminder lands at most 14 minutes
       before the usual start and never after it.
   - Read those numbers as a floor, not an estimate. They compare consecutive
     reviews of one card, which are always a day or more apart, so a user with a
     stable morning slot and a stable evening slot scores as a twelve-hour
     drift — and the dataset cannot separate the two cases, since a card is
     never reviewed twice in a day at that spacing. The sampled users also run a
     median of 119 reviews per study day across three years, because the dataset
     only keeps collections with 5000+ reviews: people whose habit is already
     established, and so the population least in need of a reminder. The user
     this feature is for has almost no history, hits the null branch, and gets
     the current time of day floored to the quarter — that path matters more
     than the vote does.
   - Shipped too, as the "come back regularly" nudge the ladder was really
     asking for: one `RRULE` event repeating every day, week or month, offered
     from the header rather than from a category, since that reminder is the
     same whatever category you are looking at — where the next-due event
     belongs to the deck that ran dry. The morning/midday/evening variants of
     the one-day step were dropped: the time comes from the same habitual-hour
     vote, which answers the question better than three fixed slots.
   - Known caveat: a link tapped in Calendar opens the browser, not the
     installed PWA, and on iOS the browser is a different storage context — the
     user lands on the demo build with none of their progress. A home-screen web
     app cannot claim an https URL there (that needs Universal Links, which are
     for App Store apps), so the event carries no `URL` on iOS at all.
     Chromium honours `handle_links: "preferred"` in the manifest (121+), which
     is what should route the link into the installed app on Android and
     desktop; needs confirming on a device.
   - The events are static once added: changing the schedule means issuing a new
     file, and there is no way to withdraw one we already handed out.
4. [x] **Progress view redesign** — the data layer is done (snapshots, the
   replay migration); this replaces how it is drawn. The current labelled rows
   read as a table, one row at a time, when the thing worth seeing is a
   trajectory.
   - One page for every category, not one view per category: a vertical list of
     preview charts, name and percentage beside each, tap one to expand it with
     dates and a range selector. Tap-to-expand advertises itself, where the
     scrub interaction that inspired this does not.
   - Drop the histogram icon from the category cards and reach the page from the
     header menu instead. Sequencing: the icon is the only way in today, so it
     goes when the new page lands, not before.
   - Stacked area on a linear time axis, green filling from the bottom, with the
     completion percentage drawn over it as a line. Bucket to the pixel width
     rather than to a column count, so three years and three weeks cost the same
     and detail is bounded by the screen.
   - Accept the flat stretches. Mocked against real history, 52 % of the N4
     chart and 77 % of the N3 chart is idle time — "you stopped for two months"
     is the most actionable thing here, and skipping empty buckets is what the
     old view did to look dense. The range selector is the answer to wanting
     recent detail, not a non-linear axis.
   - Second chart for effort: cards per period, and active time per period. Time
     is honest if it is the sum of gaps between consecutive answers with each
     gap capped (60s or so) — the span from first to last answer counts a tab
     left open, which is why `sessions.finished_at` was never worth writing.
     Both are reconstructable from existing `session_cards` history.
   - Shipped as a PNG export rather than a share sheet: same picture, none of
     the platform gymnastics or the transient-activation problem that calling
     `navigator.share` after an await runs into. Composed separately from the
     on-screen chart, which is painted partly by main.css and would rasterise
     without it.
   - Open at phone width: whether 6 colour bands stay legible at ~350px across
     and 60px tall in the previews. Needs a device, not a mockup.
5. [ ] **French translation** — the UI was localised to English early on; put the
   strings behind a catalogue and ship French alongside. Pick the language from
   `navigator.language` with an override in `localStorage`, since the settings
   page itself is after 1.0. Covers the app, the install page and the manifest.
6. [ ] **Public-facing sweep** — the README badge pins Ruby 3.1.0 while
   `.ruby-version` is 3.4.5, and it reads as if Ruby were the runtime: it is the
   import/build toolchain (`lib/`, `Rakefile`, `bin/`), the app itself is a
   static JS PWA. Flip the `in_development` badge at release.
7. [ ] **Kanji-of-the-Day (KOAD) generator** for growth/marketing — independent of
   the app, but wanted at the same time as 1.0.
   - Read `flashcards.db` and generate daily social posts (kanji + reading +
     meaning + example)
   - Level 1: output a batch of ready-to-paste posts (no API keys)
   - Level 2: auto-post to Bluesky via the API on a schedule (app password)
   - Rationale + strategy in `docs/MARKETING.md` (Bluesky community section)
8. [ ] **Single-archive distribution** — ship the app as one zip instead of ~150
   files: atomic install, one download, and no partial-update tears where the
   version label and the loaded code disagree.

## QA before scoping

Reproduce these on a device first, then decide whether they need work.

- **First launch** — `index.html` already shows a determinate percentage for the
  asset precache and `categories.html` shows a spinner while the DB loads, so
  nothing looks frozen. The question is whether the cold 3 MB OPFS import runs
  long enough behind that indeterminate spinner to feel stuck. If it does, add
  worker -> UI messaging for the DB init.
- **Install page screenshots on mobile** — containers look like they carry a
  double padding; making them full-width is the suspected fix. They are styled
  inline in `install.html`'s own `<style>`, nothing in `main.css`.
- **Chrome PWA cache** — refreshing with Cmd-R appears to bust the cache instead
  of serving from it.

## Known bugs

- **The Cards metric double-counts within a day.** `Session.EFFORT_QUERY` counts
  one row per card per session, and the progress view sums the sessions in a
  bucket, so a card studied in two sessions on the same day is counted twice: an
  N5 day reads 150 cards against a deck of 103. The comment in `session.js` calls
  this "very slightly generous", which it plainly is not. It needs to count
  distinct cards over the bucket, which means the query can no longer pre-group
  by session for that column.
- **Five duplicate word cards.** The scraper's bracket bug inserted 勘定, 密か,
  挨拶, 提出 and 聞こえる twice, once under each spelling. The shipped database has
  been merged down to one of each; a database where the duplicate was studied
  keeps it, since the content updater will not delete a card somebody answered.
  Those installs show the word twice in its deck.

## After 1.0

### Web push notifications (dropped)

Wanted: a reminder after 1 day (morning, midday, evening), after 2 days, after
1 week, after 1 month. Dropped in favour of the calendar reminders in 1.0,
because nothing schedules them from the app alone and we do not want to take on
a paid service.

- A timer does not survive: the service worker is stopped as soon as it goes
  idle, and a page-side `setTimeout` only runs while the app is open.
- Local scheduling (Notification Triggers / `TimestampTrigger`) never shipped
  past a Chromium origin trial.
- iOS delivers notifications to an installed PWA only through Web Push, which
  needs a server holding VAPID keys and subscriptions.
- Periodic Background Sync could approximate a daily reminder, but it is
  Chromium and installed-PWA only, best-effort on timing, and absent on iOS.
- Still cheap and worth doing on its own: set `navigator.setAppBadge()` with the
  due count whenever the app runs. No server, works on installed PWAs including
  iOS, but it goes stale instead of nagging.

### Study, search and explore

- Card picking order (open question, needs experimentation):
  1. Current behaviour: ORDER BY label DESC, so on a new session due green cards
     outrank freshly red ones (reds only show while still in the in-memory
     deck). Document this.
  2. Add an option to order by overdue-ness (most overdue first) instead of by
     label.
  3. Try per-deck exclusion from picking and a "closer to red" on wrong answer;
     keep as options if they work in practice.
- Add links to related cards with a back button (or maybe using a modal UI).
- Make question font smaller when more than 4 chars.
- Show category name in title bar (with current study deck count).
- Show current day progress in points.
- Set progress goal and show current day progress as progress bar.
- Animations: https://github.com/parsimonhi/animCJK?tab=readme-ov-file

### Settings

- Settings page with download DB, upload DB, set Japanese voice. The use case is
  already covered by the categories dropdown, so this is cleanup and waits for
  the study features above.
- At init, check if persistent storage is available and if not explain why
  (check for COOP/COEP headers, `isSecureContext` and if the protocol includes
  https or wss). To check COOP/COEP headers, we can use
  `resp = await fetch(document.location.href, {method: 'HEAD'})` then
  `Object.fromEntries(resp.headers.entries())`, then check if the headers exist
  and have the expected values.
- Revisit the update UI (low priority).
- About modal with version check and update button. The pieces already exist
  (version line, update dot, "Check for Updates", auto-apply on launch,
  reactivation and reconnect); this only moves them out of the dropdown.

### Data model

Now that migrations run on `PRAGMA user_version` (see `docs/SCHEMA.md`), these
are no harder after the release than before it.

- Migrate session_cards and sessions tables
  1. For now session_cards data could be merged directly on the card and
     session_cards table removed.
  2. A studied_at attribute should also be created on the session in addition
     to the one in card.
  3. When a card could have multiple labels and/or multiple categories the
     study date will then have to move to another table.
  4. Currently, this data is used to prevent picking duplicate card in the deck.
     To avoid that, we just have JS to provide id of cards of current deck so
     these are excluded from picking.
- Clean sessions from previous days when starting a new one and ensure
  session contains the right duration and progress data.
  1. When picking a new card, close the current session if inactive for 5
     minutes and re-open a new one instead keeping the same deck.
  2. Closing a session means setting finished_at attribute to last studied time
     (which should be stored in that session).
  3. If the session is created when validating an answer, the result goes in the
     new session.
  4. Progress is saved in the session in relative form, absolute form, points
     and percentage.
- Store deck status in the session and in the category.
- Support cards to be assigned to many categories.
- Separate DB for progress and custom cards.

### Cards the user owns

Anki import and an in-app card editor both mean cards that did not come from the
shipped database, and the content updater has no notion of those yet. Worth
settling before either ships, because two of the consequences are silent:

- **`content.js` would delete them.** It treats the shipped file as the authority
  for the whole `cards` table: anything it cannot match is "extra", and an extra
  card nobody has answered is removed. An imported deck would survive exactly as
  long as it went unstudied. Cards need a provenance — a column, or a reserved id
  range — and the updater needs to reconcile only what it owns. A one-line stopgap
  is available in the meantime: refuse to delete a card whose category the shipped
  content does not know about, which makes a whole imported deck safe and leaves
  only user cards added *inside* a shipped deck exposed.
- **Ids would collide.** `cards.id` is the updater's match key and is
  AUTOINCREMENT on the shipping side, so ids are only unique per database: a card
  created locally takes the next local id, which a later release will hand to a
  different word. Separate the two id spaces (a floor for user cards, or the
  separate database above).
- **Translations have nowhere to live.** `data/translations/fr.json` is authoring
  data for cards we ship; a card the user wrote can only carry its own
  translations, which means the editor edits `meaning`/`meaning_fr` in the
  database and the catalogue stops being the only source of French.

- Anki deck import, limited feature set: notes and their fields, not scheduling.
- Card editor in the app: create, edit and delete cards and decks.

### Content

- Import School Grades sets from Wikipedia
- Import from iCloud Sticky Study data
- Import from http://nihongo.monash.edu/Japanese.html

### Tooling

- Release script
  - We we update our upload script to be purely based on git
  - If the last commit is not a release commit, we should to a release commit
    first:
    - The script should then ask if we do a minor (default), major, or bug fix
      release (choosable with arrow keys)
    - Create the commit.
  - Do a partial checkout of latest release commit of the public folder contents
  - Upload this copy with rsync over ssh

## Done

### App

- Import JLPT Kanji & Vocabulary sets from StudyKanji
- List of categories UI, with actual deck values, progress and last study date
- Study UI with SRS Algorithm; fixed for vocabulary categories
- Show related cards in list
- Mobile UI (~full screen~ Install as PWA)
- Move buttons to Settings UI and hide footer on categories page
- Medal button moves the card to the last (green) deck instead of one deck up.
- Category availability dot at the top-right of a category: coloured to the
  reddest available studied card (due); gray when the only available cards are
  unstudied; no dot when nothing is available.
- Study mode: thin softened-red availability bar per colored deck counter,
  directly under the color strip (no gap, overlaid on the count, no layout
  change). Width is the deck's available cards (next study time past) over deck
  size; full when all are due, hidden when none are.
- Block entering study mode for a category with no available cards.
  1. The "insert cards of wrong color" finish screen (studying ahead of
     schedule) is a lower-priority alternative.
- Progress UI
  - Dedicated view, navigated to like study, opened from a histogram icon on
    each category card.
  - First drawing: stacked horizontal bars, one per time bucket, empty buckets
    skipped, adaptive granularity. Superseded by the redesign in 1.0 — the
    labels it needed were a symptom of a static list, and skipping empty buckets
    hid the breaks in studying.
  - Per-session snapshots persisted going forward, and history reconstructed by
    replaying `session_cards` in a migration (approximate, since neither the
    order of the answers nor the resulting label was recorded per event). On a
    24.7k-event database 7570/7590 cards land on their stored label; the misses
    are one deck ahead, consistent with medal promotions.
  - DB migration mechanism keyed on `PRAGMA user_version`, see `docs/SCHEMA.md`.

### Progress data

- Save progress
- Save progress to local file (download, cf. sqlite3_js_db_export) or Google
  Drive, and restore it from a local file (upload)
- Database upload UI

### PWA

- Offline mode: store all pages and assets in a cache (including external
  dependencies); when the server is not available (airplane mode, server down)
  serve the cached HTML pages instead.
- First page is a waiting page: in PWA mode we install the app, otherwise we
  redirect to the install page.
- Manual updates: version file on the server, UI showing the current version and
  the update status, and a manifest of the files needed to run the app.
- At first install, the version is 'unknown'.
- Automatic update strategy — implemented differently from the original plan
  (which was a once-a-day `version.json` poll driving a manifest diff): update
  availability is derived from the service worker's own registration, checked
  and auto-applied on launch, on reactivation, and when regaining connectivity,
  with a red badge otherwise. No network fetch of our own, so it stays quiet in
  airplane mode.

### Marketing

- Buy me a coffee link in the app
- Mobile-optimized donation toast with session tracking
