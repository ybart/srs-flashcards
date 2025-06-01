# TODO (to finish Study UI)

## Features to Implement

- [ ] PWA Update mechanism (cache, automated version check, detect when not PWA and suggest installing, etc.)
   [x] Store all pages and assets in a cache (including external dependencies)
   [X] Change the first page to a waiting page
      - In PWA mode, we will install the app
      - If not PWA, we redirect to the install page
      - We might also allow non-pwa to access the app in the browser without installing.
   [ ] Let's follow the following strategy:
      - When it's time, check for updates
      - If an update is available, download the files in the background, but do not apply update
      - When app is going background, perform the update process (replacing the files and clearing the cache)
      - Provide an UI to check the current version and the update status (up to date, update in progress, restart required)

   - Store a version number in the server (for now, just create a version file with version information with a simple '0.9.0' string)
   - Create a manifest file listing all files in public necessary to run the app (including external dependencies).
   - Implement version check logic using localStorage to implement once a day max logic, cancel the process when no connectivity.
   - Remove the old files from the cache, download the new ones using the manifest.
   - The service worker should hijack fetch to only use the cache and error when requesting a file not in the cache (except version)
   - When opening the PWA, once a day at most, try to check the version number on the server
   - If we were able to check the version number, compare to the current version and update the files
- [ ] Add an option to upload
- [ ] Fix Install page screenshots positioning on mobile (make the containers full-width so we do not have a double-padding).
- [ ] Release script
   - We we update our upload script to be purely based on git
   - If the last commit is not a release commit, we should to a release commit first :
      - The script should then ask if we do a minor (default), major, or bug fix release (choosable with arrow keys)
      - Create the commit.
   - Do a partial checkout of latest release commit of the public folder contents
   - Upload this copy with rsync over ssh
- [ ] Notifications (after 1 day (morning, midday, evening), after 2 day, after 1 week, after 1 month)
- [ ] Progress UI

- [ ] Offline Mode and PWA
- [ ] Settings
- [ ] Restore progress from local file (upload) or Google Drive
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
- [ ] Database upload UI
- [ ] When deck is empty (and in category list) show when the next card will be available for study.
- [ ] Show category name in title bar (with current study deck count)

- [ ] Show current day progress in points
- [ ] Set progress goal and show current day progress as progress bar
- [ ] Make question font smaller when more than 4 chars
- [ ] Add links to related cards with a back button (or maybe using a modal UI).
- [ ] Store deck status in the session and in the category
- [ ] Settings page with download DB, upload DB, set Japanese voice
- [ ] At init, check if persistent storage is available and if not explain why
(check for COOP/COEP headers, 'isSecureContext' and if and protocol includes https or wss).
To check COOP/COEP headers, we can use `resp = await fetch(document.location.href, {method: 'HEAD'})`
then `Object.fromEntries(resp.headers.entries())`, then check if the headers exists and have
the expected values.
- [ ] When server is not available (Airplane Mode, Server down), ensure we have a cache of all HTML pages
      and use that instead
- [ ] About modal with version check and update button.