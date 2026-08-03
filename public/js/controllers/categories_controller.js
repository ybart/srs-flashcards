import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import ApplicationRecord from '../models/application_record.js'
import Category from '../models/category.js'
import Card from '../models/card.js'
import Session from '../models/session.js'
import RelativeDate from '../models/relative_date.js'
import { t } from '../i18n.js';
import Reminder from '../models/reminder.js';

export default class extends Controller {
  static targets = ['version', 'reminderDialog', 'reminderTitle', 'creditsDialog']
  static LABEL_COLORS = ['#ed3b3b', '#f29132', '#f2db5b', '#7fe851', '#0a8f45'] // red..green

  async connect() {
    this.checkPWAStatus();
    this.refresh();

    // Offline graying of online-only features.
    this.boundOnlineStatus = this.updateOnlineStatus.bind(this);
    window.addEventListener('online', this.boundOnlineStatus);
    window.addEventListener('offline', this.boundOnlineStatus);
    this.updateOnlineStatus();

    // Update availability is derived from the service worker's own state — a
    // "waiting" worker means a downloaded update is ready — so showing the badge
    // needs NO network fetch from us. (Our old version.json check fired even in
    // airplane mode and triggered the "no internet" dialog.) New versions are
    // discovered when connectivity is (re)gained, on the manual check, and by
    // the browser's own periodic SW checks.
    const reg = await this.registration();
    if (reg) {
      this.refreshUpdateBadge();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => this.refreshUpdateBadge());
      });
    }

    // Check for updates when the app is reactivated and when we regain
    // connectivity. (Launch checks + auto-updates in index.html.)
    this.boundVisibility = () => {
      if (document.visibilityState === 'visible') this.discoverUpdate();
    };
    document.addEventListener('visibilitychange', this.boundVisibility);

    this.boundDiscover = () => this.discoverUpdate();
    window.addEventListener('online', this.boundDiscover);
  }

  disconnect() {
    window.removeEventListener('online', this.boundOnlineStatus);
    window.removeEventListener('offline', this.boundOnlineStatus);
    window.removeEventListener('online', this.boundDiscover);
    document.removeEventListener('visibilitychange', this.boundVisibility);
  }

  updateOnlineStatus() {
    this.element.classList.toggle('offline', !navigator.onLine);
  }

  registration() {
    return 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : null;
  }

  // Badge = a new worker is installed and waiting to activate. No network.
  async refreshUpdateBadge() {
    const reg = await this.registration();
    this.element.classList.toggle('update-available', !!(reg && reg.waiting));
  }

  // Ask the browser to look for a new service worker, then refresh the badge.
  // If offline the check just fails and is ignored.
  async discoverUpdate() {
    try {
      const reg = await this.registration();
      if (reg) await reg.update();
    } catch (e) {
      // offline / failed — ignore
    }
    this.refreshUpdateBadge();
  }

  // Activate the waiting worker; reload once it controls the page. Works
  // offline too (activating a waiting worker needs no network).
  async applyUpdate() {
    const reg = await this.registration();
    if (!reg) { window.location.reload(); return; }
    if (!reg.waiting) return;

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  async versionTargetConnected(element) {
    element.textContent = `v${await this.getCurrentVersion()}`;
  }

  async refresh() {
    // Clear list and style rules
    const list = this.element.querySelector('section[role=content]')
      .querySelectorAll('article');
    for (let element of list) { element.remove(); }

    for (let { } of Object.entries(this.stylesheet.cssRules)) {
      this.stylesheet.deleteRule(0);
    }

    // Availability per category, for the dot on each card.
    const availability = await Category.availability()
    this.availabilityByCategory = new Map(availability.map((a) => [a.category_id, a]))

    // Create Elements
    for (let category of await Category.all()) {
      this.appendCategory(category)
    }
  }

  get stylesheet() {
    const css = document.querySelector('#category-css')
    if (css) { return css.sheet }

    const style = document.createElement('style')
    style.id = 'category-css'
    document.head.appendChild(style)

    return style.sheet;
  }

  async appendCategory(category) {
    const container = this.element.querySelector('section[role=content]');
    const card = document.querySelector('#category-card').cloneNode(true)

    const style = this.stylesheet

    card.removeAttribute('style')
    card.id = `category-${category.id}`
    card.querySelector('[data-role=name]').innerText = category.name
    card.querySelector('[data-role=cards-count]').innerText = category.cards_count

    // Availability: colour the dot by the reddest available studied card, gray
    // when only unstudied cards are available; when nothing is available, block
    // entering study mode.
    const avail = this.availabilityByCategory?.get(category.id)
    const hasStudied = avail && avail.min_available_label != null
    const hasUnstudied = avail && avail.unstudied > 0
    const available = hasStudied || hasUnstudied

    const dot = card.querySelector('[data-role=availability-dot]')
    if (available) {
      dot.style.background = hasStudied
        ? this.constructor.LABEL_COLORS[avail.min_available_label] : '#888'
      dot.classList.add('show')
    } else {
      // Nothing due: the slot belongs to the reminder instead.
      dot.remove()
    }

    // Title row and body row are two links to the same place, so both parts of
    // the card start a study session.
    const links = card.querySelectorAll('a.category-content')
    for (const link of links) {
      if (available) {
        link.setAttribute('href', `study.html#category=${category.id}`)
      } else {
        link.removeAttribute('href')
        card.classList.add('unavailable')
      }
    }

    // Only a category with nothing to study has a moment worth reminding about;
    // for the rest, studying now is the answer and the header carries the nudge.
    const reminderLink = card.querySelector('[data-role=reminder-link]')
    if (!available && avail?.next_available) {
      reminderLink.dataset.categoryId = category.id
      reminderLink.dataset.categoryName = category.name
    } else {
      reminderLink.remove()
    }

    // A category with nothing to study is a dead end unless we say when it
    // wakes up, so the clock line switches from "last studied" to "next card".
    let clockText = null
    if (!hasStudied && !hasUnstudied && avail?.next_available) {
      const next = RelativeDate.dateFromSqliteTimestamp(avail.next_available)
      clockText = t('next %{when}', { when: new RelativeDate(next).format() })
    } else if (category.started_at) {
      const startedAt = RelativeDate.dateFromSqliteTimestamp(category.started_at)
      clockText = new RelativeDate(startedAt).format()
    } else {
      clockText = t('Never studied')
    }

    let counts = [0, 0, 0, 0, 0, 0]
    const decks = await Card.decks(category.id)
    for (let deck of decks) {
      if (deck.label != null) { counts[deck.label + 1] = deck.count } else { counts[0] = deck.count }
    }

    card.querySelector('[data-role=last-studied]').innerText = clockText
    card.querySelector('[data-role=progress]').innerText = `${this.percentageDone(counts)} %`

    style.insertRule(this.progressRule(`#${card.id}`, counts))
    counts[0] = 0 // On hover, we only take studied cards into account
    style.insertRule(this.progressRule(`#${card.id}:hover`, counts))

    // TODO: Store categories into an array and add everything add same time
    container.appendChild(card)
  }

  // A calendar event rather than a notification: the OS fires the alert, so
  // this needs no server and no permission prompt.
  //
  // Only categories with nothing to study carry a reminder of their own, and it
  // targets the moment a whole deck is back rather than a single card — being
  // called back for one card is not worth opening the app for. A recurring
  // nudge is the same event whatever the category, so it lives in the menu.
  async addReminder(event) {
    event.preventDefault()

    const { categoryId, categoryName } = event.currentTarget.dataset
    const refill = await Card.nextAvailable(categoryId, Card.DECK_SIZE)
    if (!refill) { return }

    Reminder.download({
      // Rounded up, so the reminder still falls after the cards come back up.
      at: Reminder.ceilToQuarter(RelativeDate.dateFromSqliteTimestamp(refill)),
      summary: t('Study %{category}', { category: categoryName }),
      description: t('A deck is ready to review in %{category}.', { category: categoryName }),
      url: `${location.origin}/`
    })
  }

  async remindMe(event) {
    event.preventDefault()

    const repeat = await this.askRepeat()
    if (!repeat) { return }

    Reminder.download({
      at: Reminder.nextOccurrence(repeat, Reminder.habitualTime(await Session.studyTimes())),
      repeat: repeat,
      summary: t('Study your flashcards'),
      description: t('Open SRS Flashcards and review what is due.'),
      url: `${location.origin}/`
    })
  }

  // Resolves with 'daily' / 'weekly' / 'monthly', or null when dismissed.
  askRepeat() {
    this.reminderTitleTarget.innerText = t('Remind me to study')
    this.chosenRepeat = null
    this.reminderDialogTarget.showModal()

    return new Promise((resolve) => { this.resolveRepeat = resolve })
  }

  // Every button, including the close one, just records its choice and closes;
  // the close event below is the single place the promise is settled, so Esc
  // and the backdrop cannot leave it pending.
  chooseRepeat(event) {
    event.preventDefault()
    this.chosenRepeat = event.currentTarget.dataset.repeat || null
    this.reminderDialogTarget.close()
  }

  // A click that lands on the dialog itself is on the backdrop — the article
  // covers everything else.
  // Same modal pattern as the reminder: tapping the backdrop dismisses it.
  showCredits(event) {
    event.preventDefault()
    this.creditsDialogTarget.showModal()
  }

  hideCredits(event) {
    event.preventDefault()
    this.creditsDialogTarget.close()
  }

  dismissCredits(event) {
    if (event.target === this.creditsDialogTarget) { this.creditsDialogTarget.close() }
  }

  dismissReminder(event) {
    if (event.target === this.reminderDialogTarget) { this.reminderDialogTarget.close() }
  }

  reminderClosed() {
    const resolve = this.resolveRepeat
    const repeat = this.chosenRepeat

    this.resolveRepeat = null
    this.chosenRepeat = null
    if (resolve) { resolve(repeat) }
  }

  percentageDone(counts) {
    const total = 4 * counts.reduce((a, b) => a + b, 0)
    const current = 4 * counts[5] + 3 * counts[4] + 2 * counts[3] + counts[2]

    return (100 * current / total).toFixed(1)
  }

  progressRule(id, counts) {
    let total = counts.reduce((a, b) => a + b, 0)
    let red = 100 * counts[1] / total
    let orange = red + 100 * (counts[2] / total)
    let yellow = orange + 100 * (counts[3] / total)
    let lightgreen = yellow + 100 * (counts[4] / total)
    let green = lightgreen + 100 * (counts[5] / total)
    let grey = green + 100 * (counts[0] / total)

    return `${id} [data-role=progress] ` +
      `{ background-size: ${red}% 100%, ${orange}% 100%, ` +
      `${yellow}% 100%, ${lightgreen}% 100%, ${green}% 100%, ${grey}% 100%; }`
  }

  // TODO: Move to settings controller
  download() {
    ApplicationRecord.database.download();
  }

  async reset() {
    await ApplicationRecord.database.reset();
    alert(t('Database deleted'))
  }

  async importDatabase() {
    const input = document.createElement('input');
    input.type = 'file';
    // Accept database-like/binary types. Excluding image & video types is what
    // makes iOS show the Files browser instead of a "Take Photo / Photo Library
    // / Choose File" menu, and it hides photos in the desktop picker. The worker
    // also validates the SQLite header on import, so a bad pick fails cleanly.
    input.accept = '.db,.sqlite,.sqlite3,application/octet-stream';
    // Attach to the DOM before clicking: a detached input's change event fires
    // unreliably on iOS Safari (the "selecting a file does nothing" case).
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      if (!confirm(t('Importing will REPLACE your current data with this file. Continue?'))) return;
      try {
        await ApplicationRecord.database.import(file);
        // No blocking "done" alert; just reload — the fresh data is the feedback.
        window.location.reload();
      } catch (error) {
        console.error('Import failed:', error);
        alert(`${t('Import failed: %{error}', { error: error })}\n\n` +
              t('Is this a valid SRS Flashcards database file?'));
      }
    }, { once: true });

    input.click();
  }

  checkPWAStatus() {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                 window.navigator.standalone || 
                 document.referrer.includes('android-app://');
  
    // Outside an installed PWA the OPFS database can be evicted by the browser,
    // so the corner ribbon warns that progress is not safe here.
    this.element.classList.toggle('demo', !isPWA);

    if (!isPWA) {
      const installItem = this.element.querySelector('li[data-pwa-only]');
      installItem.classList.remove('hidden');
    } else {
      const updateItem = this.element.querySelector('li[data-no-pwa-only]');
      updateItem.classList.remove('hidden');
    }
  }

  async getCurrentVersion() {
    // The installed version = the version of the downloaded files. version.json
    // is precached, so fetching it (served cache-first by the service worker)
    // reflects what's actually installed, not a separately-tracked number.
    try {
      const res = await fetch('/version.json');
      const { version } = await res.json();
      return version || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  async checkForUpdates(event) {
    const isUserRequested = event instanceof Event;  // True when called from UI
    const reg = await this.registration();

    if (!reg) {
      if (isUserRequested) alert(t('Updates are unavailable here.'));
      return;
    }

    try {
      // Look for a new worker unless one is already downloaded and waiting.
      if (!reg.waiting) {
        await reg.update();
        const installing = reg.installing;
        if (installing) {
          await new Promise((resolve) => {
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' || installing.state === 'redundant') resolve();
            });
          });
        }
      }
      this.refreshUpdateBadge();

      if (reg.waiting) {
        if (!isUserRequested || confirm(t('A new version is available. Install now?'))) {
          await this.applyUpdate();
        }
      } else if (isUserRequested) {
        alert(t("You're up to date (%{version})", { version: `v${await this.getCurrentVersion()}` }));
      }
    } catch (error) {
      console.error('Update check failed:', error);
      if (isUserRequested) alert(t('Update check failed. Please try again later.'));
    }
  }
}
