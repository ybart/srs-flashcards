// The interface in the reader's language, and the cards in it too.
//
// There is no server here, so there is no Accept-Language header to read:
// `navigator.languages` holds the very list the browser would have sent in one,
// in the same order, and that is what the language is taken from. A key in
// localStorage overrides it — the settings screen that will set it properly is
// after 1.0, and until then it is how the French build gets looked at.
//
// Strings are keyed by their English text rather than by invented names. A
// missing translation then falls back to English on its own, and the markup
// stays readable: the page says "Import Database", not "settings.import.label".
//
// Nothing here touches the DOM. Marked-up text is translated by
// controllers/i18n_controller.js, which Stimulus connects to each element as it
// appears, cloned templates included.

import { FR } from './locales/fr.js'

export const FALLBACK = 'en'
export const CATALOGUES = { en: null, fr: FR }
export const OVERRIDE_KEY = 'locale'

let chosen = null

export function locale() {
  if (chosen) { return chosen }

  let override = null
  try { override = localStorage.getItem(OVERRIDE_KEY) } catch { override = null }
  if (override && override in CATALOGUES) { return (chosen = override) }

  const wanted = navigator.languages || [navigator.language || FALLBACK]
  for (const tag of wanted) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (base in CATALOGUES) { return (chosen = base) }
  }

  return (chosen = FALLBACK)
}

// For lang attributes and for Intl, which wants a tag rather than our own idea
// of a language.
export function languageTag() {
  return locale()
}

function fill(text, values) {
  if (!values) { return text }

  return text.replace(/%\{(\w+)\}/g, (whole, key) => (
    key in values ? String(values[key]) : whole
  ))
}

export function t(text, values) {
  const catalogue = CATALOGUES[locale()]
  const translated = (catalogue && catalogue[text]) || text

  return fill(translated, values)
}

// Counted things. English treats one as singular and everything else as plural;
// French keeps zero singular too, which is why the rule cannot live at the call
// site.
export function tn(count, one, many, values) {
  const plural = locale() === 'fr' ? Math.abs(count) >= 2 : Math.abs(count) !== 1

  return t(plural ? many : one, { count: count, ...values })
}

// A card's meaning in the reader's language. English is the fallback because it
// is the only one every card is guaranteed to have — a card written in the app
// will start out with just the one.
export function meaning(properties) {
  const language = locale()
  const field = language === FALLBACK ? 'meaning' : `meaning_${language}`

  return properties[field] || properties.meaning || ''
}

// Every meaning a card carries, for showing them side by side.
export function meanings(properties) {
  return Object.keys(CATALOGUES)
    .map((language) => ({
      locale: language,
      text: language === FALLBACK ? properties.meaning : properties[`meaning_${language}`]
    }))
    .filter((entry) => entry.text)
}
