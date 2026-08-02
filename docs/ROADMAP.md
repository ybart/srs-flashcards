# TODO (to finish Study UI)

## Features to Implement

- [ ] PWA Update mechanism (cache, automated version check, detect when not PWA and suggest installing, etc.)
  - [x] Store all pages and assets in a cache (including external dependencies)
  - [x] Change the first page to a waiting page
    - In PWA mode, we will install the app
    - If not PWA, we redirect to the install page
    - We might also allow non-pwa to access the app in the browser without installing.
  - [x] Manual updates
    - Store a version number in the server (for now, just create a version file with version information with a simple '0.9.0' string)
    - Provide an UI to check the current version and the update status (up to date, update in progress, restart required)
    - Create a manifest file listing all files in public necessary to run the app (including external dependencies).
  - [ ] In Chrome PWA, refreshing using Cmd-R bust the cache, it should fetch from cache instead.
  - [x] At first install, the version is 'unknown'
  - [x] When offline, refreshing cause the app to be unavailable
  - [x] Automatic update strategy — implemented differently: check and auto-apply on
    launch, on reactivation, and when regaining connectivity; red badge otherwise.
    - [ ] Revisit the update UI (low priority).
  - Implement version check logic using localStorage to implement once a day max logic, cancel the process when no connectivity.
  - Remove the old files from the cache, download the new ones using the manifest.
  - The service worker should hijack fetch to only use the cache and error when requesting a file not in the cache (except version)
  - When opening the PWA, once a day at most, try to check the version number on the server
  - If we were able to check the version number, compare to the current version and update the files
- [x] Add an option to upload
- [ ] Fix Install page screenshots positioning on mobile (make the containers full-width so we do not have a double-padding).
- [ ] Release script
  - We we update our upload script to be purely based on git
  - If the last commit is not a release commit, we should to a release commit first :
    - The script should then ask if we do a minor (default), major, or bug fix release (choosable with arrow keys)
    - Create the commit.
  - Do a partial checkout of latest release commit of the public folder contents
  - Upload this copy with rsync over ssh
- [ ] First launch: show progress for DB initialisation on the categories page
  (worker -> UI messaging), not just asset precache.
- [ ] Consider distributing/updating the app as a single zip archive: atomic
  install and one download instead of ~150 files — faster first launch, and
  no partial-update tears where the version label and loaded code disagree.
- [ ] Kanji-of-the-Day (KOAD) generator for growth/marketing
  - Read `flashcards.db` and generate daily social posts (kanji + reading + meaning + example)
  - Level 1: output a batch of ready-to-paste posts (no API keys)
  - Level 2: auto-post to Bluesky via the API on a schedule (app password)
  - Rationale + strategy in `docs/MARKETING.md` (Bluesky community section)
- [ ] Notifications (after 1 day (morning, midday, evening), after 2 day, after 1 week, after 1 month)
- [ ] Progress UI
- [x] Offline Mode and PWA
- [ ] Settings
- [x] Restore progress from local file (upload) or Google Drive
- [ ] Support cards to be assigned to many categories
- [ ] Import School Grades sets from Wikipedia
- [ ] Import from iCloud Sticky Study data
- [ ] Import from http://nihongo.monash.edu/Japanese.html
- [ ] Animations: https://github.com/parsimonhi/animCJK?tab=readme-ov-file
- [ ] Separate DB for progress and custom cards

## Completed Features

- [x] Import JLPT Kanji & Vocabulary sets from StudyKanji
- [x] List of categories UI
- [x] Study UI with SRS Algorithm
- [x] Save progress to local file (download, cf. sqlite3_js_db_export) or Google Drive
- [x] Buy me a coffee link in the app

# Existing TODO Items

- [x] Fix study UI for vocabulary categories
- [x] Save progress
- [x] Show actual decks value
- [x] Show actual categories progress and last study date
- [x] Mobile UI (~full screen~ Install as PWA)
- [x] Move buttons to Settings UI and hide footer on categories page
- [x] Show related cards in list
- [ ] Migrate session_cards and sessions tables
  1. For now session_cards data could be merged directly on the card and session_cards table
     removed.
  2. A studied_at attribute should also be created on the session in addition
     to the one in card.
  3. When a card could have multiple labels and/or multiple categories the
     study date will then have to move to another table.
  4. Currently, this data is used to prevent picking duplicate card in the deck.
     To avoid that, we just have JS to provide id of cards of current deck so these are
     excluded from picking.
- [ ] Clean sessions from previous days when starting a new one and ensure
  session contains the right duration and progress data.
  1. When picking a new card, close the current session if inactive for 5 minutes
     and re-open a new one instead keeping the same deck.
  2. Closing a session means setting finished_at attribute to last studied time
     (which should be stored in that session).
  3. If the session is created when validating an answer, the result goes in the new session.
  4. Progress is saved in the session in relative form, absolute form, points and percentage.
- [x] Database upload UI
- [ ] When deck is empty (and in category list) show when the next card will be available for study.
- [ ] Show category name in title bar (with current study deck count)
- [ ] Show current day progress in points
- [ ] Set progress goal and show current day progress as progress bar
- [ ] Make question font smaller when more than 4 chars
- [ ] Add links to related cards with a back button (or maybe using a modal UI).
- [ ] Store deck status in the session and in the category
- [x] Category availability dot at the top-right of a category: coloured to the reddest
  available studied card (due); gray when the only available cards are unstudied; no dot
  when nothing is available.
- [x] Study mode: thin softened-red availability bar per colored deck counter, directly
  under the color strip (no gap, overlaid on the count, no layout change). Width is the
  deck's available cards (next study time past) over deck size; full when all are due,
  hidden when none are.
- [ ] Medal button moves the card to the last (green) deck instead of one deck up.
- [ ] Block entering study mode for a category with no available cards.
  1. The "insert cards of wrong color" finish screen (studying ahead of schedule) is a
     lower-priority alternative.
- [ ] Card picking order (open question, needs experimentation):
  1. Current behaviour: ORDER BY label DESC, so on a new session due green cards outrank
     freshly red ones (reds only show while still in the in-memory deck). Document this.
  2. Add an option to order by overdue-ness (most overdue first) instead of by label.
  3. Try per-deck exclusion from picking and a "closer to red" on wrong answer; keep as
     options if they work in practice.
- [ ] Settings page with download DB, upload DB, set Japanese voice
- [ ] At init, check if persistent storage is available and if not explain why
  (check for COOP/COEP headers, 'isSecureContext' and if and protocol includes https or wss).
  To check COOP/COEP headers, we can use `resp = await fetch(document.location.href, {method: 'HEAD'})`
  then `Object.fromEntries(resp.headers.entries())`, then check if the headers exists and have
  the expected values.
- [x] When server is not available (Airplane Mode, Server down), ensure we have a cache of all HTML pages
  and use that instead
- [ ] About modal with version check and update button.
