import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import ApplicationRecord from '../models/application_record.js'
import Category from '../models/category.js'
import Card from '../models/card.js'
import RelativeDate from '../models/relative_date.js';

export default class extends Controller {
  static targets = ['version']

  async connect() {
    this.checkPWAStatus();
    this.refresh();

    // Gray out online-only features ([data-online-only]) when offline.
    this.boundOnlineStatus = this.updateOnlineStatus.bind(this);
    window.addEventListener('online', this.boundOnlineStatus);
    window.addEventListener('offline', this.boundOnlineStatus);
    this.updateOnlineStatus();
  }

  disconnect() {
    window.removeEventListener('online', this.boundOnlineStatus);
    window.removeEventListener('offline', this.boundOnlineStatus);
  }

  updateOnlineStatus() {
    this.element.classList.toggle('offline', !navigator.onLine);
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
    input.accept = '.db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!confirm('Importing will REPLACE your current data with this file. Continue?')) return;
      try {
        await ApplicationRecord.database.import(file);
        alert('Database imported. Reloading…');
        window.location.reload();
      } catch (error) {
        console.error('Import failed:', error);
        alert('Import failed — is this a valid SRS Flashcards database file?');
      }
    });
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
    return localStorage.getItem('version') || 'unknown';
  }

  async checkForUpdates(event) {
    const isUserRequested = event instanceof Event;  // True when called from UI

    try {
      console.log('Checking for updates');
      const currentVersion = await this.getCurrentVersion();
      const response = await fetch('/version.json?t=' + Date.now());
      const { version: latestVersion } = await response.json();

      if (!latestVersion) {
        throw new Error('Invalid version format');
      }

      console.log('Current version:', currentVersion, 'Latest version:', latestVersion);

      if (latestVersion === currentVersion) {
        if (isUserRequested) alert(`You're up to date (v${currentVersion})`);
        return;
      }

      if (isUserRequested && !confirm(`Update available (v${latestVersion}). Install now?`)) {
        return;
      }

      const registration = 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : null;

      if (!registration) {
        // No service worker (e.g. not running as a PWA): reload to get new files.
        localStorage.setItem('version', latestVersion);
        window.location.reload();
        return;
      }

      // Reload exactly once, as soon as the new worker takes control of the page.
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        localStorage.setItem('version', latestVersion);
        window.location.reload();
      });

      // Fetch the latest sw.js. If it changed, it installs, calls skipWaiting()
      // (see sw.js install handler), then activates — purging old caches and
      // re-precaching — which fires the controllerchange above.
      await registration.update();

      // If a new worker is already installed and merely waiting, nudge it.
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('Update check failed:', error);
      if (isUserRequested) {
        alert('Update check failed. Please try again later.');
      }
    }
  }
}
