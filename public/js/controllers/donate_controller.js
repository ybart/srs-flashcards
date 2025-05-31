import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

export default class extends Controller {
  static THRESHOLD = 10 // sessions before prompting
  static WEEK_MS = 7 * 24 * 60 * 60 * 1000 // one week
  static MONTH_MS = 30 * 24 * 60 * 60 * 1000 // one month

  static targets = ['banner', 'alreadyDonated']

  connect() {
    const sessionCount = parseInt(localStorage.getItem('studySessionCount') || '0')
    const lastClosed = parseInt(localStorage.getItem('supportBannerLastClosed') || '0')
    const alreadyDonated = localStorage.getItem('supportBannerAlreadyDonated') === 'true'

    if (sessionCount >= this.constructor.THRESHOLD) {
      const now = Date.now()
      if (now - lastClosed > (alreadyDonated ? this.constructor.MONTH_MS : this.constructor.WEEK_MS)) {
        this.showBanner()
      }
    }
  }

  showBanner() {
    this.bannerTarget.classList.remove('hidden')
    const closedCount = parseInt(localStorage.getItem('supportBannerClosedCount') || '0')
    
    if (closedCount > 0) {
      this.alreadyDonatedTarget.classList.remove('hidden')
    }
  }

  closeBanner() {
    const closedCount = parseInt(localStorage.getItem('supportBannerClosedCount') || '0')

    this.bannerTarget.classList.add('hidden')
    localStorage.setItem('supportBannerLastClosed', Date.now().toString())
    localStorage.setItem('supportBannerClosedCount', closedCount + 1)
  }

  alreadyDonated() {
    localStorage.setItem('supportBannerAlreadyDonated', 'true')
    this.closeBanner()
  }
} 