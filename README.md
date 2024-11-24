# SRS Flashcards

## Schema

- **Preferences**
  - name (in code)
  - description (in code)

# TODO (to finish Study UI)

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

## Features

- [x] Import JLPT Kanji & Vocabulary sets from StudyKanji
- [x] List of categories UI
- [x] Study UI with SRS Algorithm
- [ ] Progress UI
- [ ] Offline Mode and PWA
- [x] Save progress to local file (download, cf. sqlite3_js_db_export) or Google Drive

- Settings
- Notifications (after 1 day (morning, midday, evening), after 2 day, after 1 week, after 1 month)
- Restore progress from local file (upload) or Google Drive
- Support cards to be assigned to many categories. When a pcard is updated, the status of
  all related categories should be updated as well.
- Import School Grades sets from Wikipedia
- Import from iCloud Sticky Study data
- Import from http://nihongo.monash.edu/Japanese.html
- Animations : https://github.com/parsimonhi/animCJK?tab=readme-ov-file
- Progress and custom cards are stored in a separate DB
to ease content updates.

# SRS Algorithm

1. Cards are initially gray when not reviewed. All gray cards are available
   for studying.
2. When starting a new session, put 10 available cards in study
   (those from last session first, then preferably green are chosen first,
   then lime ones, ...).
3. If correct, the card get an orange label, else it gets a red one
   and an available card replaces this one for studying.
4. After 5 minutes, orange cards becomes available to be inserted.
   If correct, it is labelled yellow, else become red (unless preferences
   is set to become closer to red instead)
5. After 3 days, yellow cards becomes available to the session.
6. After 9 days, lime cards becomes available to the session.
7. After 20 days, green cards becomes available to the session.
8. When no card are available, show finish screen (and add a button
   to allow inserting cards of wrong color)

# Studying

For statistics, after each study action, the number of cards of
each color should be stored in progress column. The data from the last
session of each day will be displayed in statistics board.

# Déploiement

Initialisation:

```
ssh web.ybart.fr

sudo mkdir /var/www/srs-flashcards
sudo chown ybart:nginx /var/www/srs-flashcards
sudo cp /etc/nginx/sites-available/japon.ybarthelemy.info.conf \
        /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf
sudo vim /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf
sudo ln -s /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

Éditer /etc/nginx/sites-available/srs-flashcards.ilyba.fr.conf:

```
server_name             srs-flashcards.ilyba.fr;
set                     $base /var/www/srs-flashcards;
access_log              /var/log/nginx/srs-flashcards.access.log;
error_log               /var/log/nginx/srs-flashcards.error.log warn;

# headers
add_header              Cross-Origin-Embedder-Policy "require-corp";
add_header              Cross-Origin-Opener-Policy   "same-origin";
add_header              Cross-Origin-Resource-Policy "same-origin";
```

Déploiement:

```
scp -r public web.ybart.fr:/var/www/srs-flashcards

```

