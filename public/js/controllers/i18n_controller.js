import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import { languageTag, t } from '../i18n.js'

// Translating the markup, which is written in English. Targets rather than a
// pass over the document: Stimulus connects a target whenever one appears, so a
// card cloned out of a template or a row built by another controller is
// translated on the way in, with nobody having to remember to ask.
//
// The English text is the key — see i18n.js — and it is kept in an attribute so
// that connecting twice does not translate the translation.
export default class extends Controller {
  static targets = ['text', 'attrs']

  connect() {
    document.documentElement.lang = languageTag()
  }

  textTargetConnected(element) {
    const source = element.getAttribute('data-i18n') || element.textContent.trim()
    element.setAttribute('data-i18n', source)

    const translated = t(source)
    if (translated !== element.textContent) { element.textContent = translated }
  }

  attrsTargetConnected(element) {
    for (const name of (element.getAttribute('data-i18n-attrs') || '').split(',')) {
      const attribute = name.trim()
      if (!attribute || !element.hasAttribute(attribute)) { continue }

      const kept = `data-i18n-${attribute}`
      const source = element.getAttribute(kept) || element.getAttribute(attribute)
      element.setAttribute(kept, source)
      element.setAttribute(attribute, t(source))
    }
  }
}
