import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import ApplicationRecord from '../models/application_record.js'
import Category from '../models/category.js'
import Card from '../models/card.js'
import RelativeDate from '../models/relative_date.js';

export default class extends Controller {
  static targets = ['version']
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
    card.querySelector('a').setAttribute('href', `study.html#category=${category.id}`)
    card.querySelector('[data-role=name]').innerText = category.name
    card.querySelector('[data-role=cards-count]').innerText = category.cards_count

    // Availability dot: colour of the reddest available studied card, gray when
    // only unstudied cards are available, hidden otherwise.
    const avail = this.availabilityByCategory?.get(category.id)
    const dot = card.querySelector('[data-role=availability-dot]')
    if (dot) {
      dot.classList.remove('show')
      if (avail && avail.min_available_label != null) {
        dot.style.background = this.constructor.LABEL_COLORS[avail.min_available_label]
        dot.classList.add('show')
      } else if (avail && avail.unstudied > 0) {
        dot.style.background = '#888'
        dot.classList.add('show')
      }
    }

    let startedAtAgo = null
    if (category.started_at) {
      const startedAt = RelativeDate.dateFromSqliteTimestamp(category.started_at)
      startedAtAgo = new RelativeDate(startedAt).format()
    } else {
      startedAtAgo = 'never'
    }

    let counts = [0, 0, 0, 0, 0, 0]
    const decks = await Card.decks(category.id)
    for (let deck of decks) {
      if (deck.label != null) { counts[deck.label + 1] = deck.count } else { counts[0] = deck.count }
    }

    card.querySelector('[data-role=last-studied]').innerText = startedAtAgo
    card.querySelector('[data-role=progress]').innerText = `${this.percentageDone(counts)} %`

    style.insertRule(this.progressRule(`#${card.id}`, counts))
    counts[0] = 0 // On hover, we only take studied cards into account
    style.insertRule(this.progressRule(`#${card.id}:hover`, counts))

    // TODO: Store categories into an array and add everything add same time
    container.appendChild(card)
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
    alert('DB supprimée')
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
      if (!confirm('Importing will REPLACE your current data with this file. Continue?')) return;
      try {
        await ApplicationRecord.database.import(file);
        // No blocking "done" alert; just reload — the fresh data is the feedback.
        window.location.reload();
      } catch (error) {
        console.error('Import failed:', error);
        alert(`Import failed: ${error}\n\nIs this a valid SRS Flashcards database file?`);
      }
    }, { once: true });

    input.click();
  }

  checkPWAStatus() {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                 window.navigator.standalone || 
                 document.referrer.includes('android-app://');
  
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
      if (isUserRequested) alert('Updates are unavailable here.');
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
        if (!isUserRequested || confirm('A new version is available. Install now?')) {
          await this.applyUpdate();
        }
      } else if (isUserRequested) {
        alert(`You're up to date (v${await this.getCurrentVersion()})`);
      }
    } catch (error) {
      console.error('Update check failed:', error);
      if (isUserRequested) alert('Update check failed. Please try again later.');
    }
  }
}
