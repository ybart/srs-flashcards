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
   - Shipped: a "Remind me" button on the empty-deck screen hands over one
     `VEVENT` at the moment the next card comes back up, with a `VALARM` on the
     start and a `URL` deep-linking to that category.
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
   - Still open: the fixed ladder (1 day — morning, midday, evening — 2 days,
     1 week, 1 month), which would be several events or one `RRULE`. The
     next-due event is more accurate, so the ladder only makes sense as a
     "come back regularly" nudge.
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
4. [ ] **French translation** — the UI was localised to English early on; put the
   strings behind a catalogue and ship French alongside. Pick the language from
   `navigator.language` with an override in `localStorage`, since the settings
   page itself is after 1.0. Covers the app, the install page and the manifest.
5. [ ] **About modal** with version check and update button. The pieces already
   exist (version line, update dot, "Check for Updates", auto-apply on launch,
   reactivation and reconnect); this only moves them out of the dropdown.
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
  - Stacked horizontal colour bars (gray included), smaller than the category
    bars, with no border, no rounded corners, and no interaction.
  - One bar per time bucket, showing the overall state after the last session in
    the bucket: one bar per 3 months above 1 year, per month from 1 month to
    1 year, per week from 1 week to 1 month, per day below. Empty buckets are
    skipped, labels are short and width-capped.
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
