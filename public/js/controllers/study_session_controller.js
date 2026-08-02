import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Session from '../models/session.js'
import Card from '../models/card.js'
import Category from '../models/category.js'
import Reminder from '../models/reminder.js'
import RelativeDate from '../models/relative_date.js'


export default class extends Controller {
  static targets = Object.freeze(["question", "answer", "related"])
  static labels = Object.freeze(['red', 'orange', 'yellow', 'lightgreen', 'green'])

  async connect() {
    // Check the category param
    const fragment = document.location.hash.substring(1)
    const params = Object.fromEntries(new URLSearchParams(fragment))

    this.session = await Session.create(params)

    // Increment study session count for support prompt
    const prevCount = parseInt(localStorage.getItem('studySessionCount') || '0')
    localStorage.setItem('studySessionCount', prevCount + 1)

    // TODO: Ajouter l'id de la session créée dans l'URL
    // TODO: Lors de la récupération de la session, si un id de session
    //       est présent dans l'URL, le récupérer si il n'existe pas
    //       de session plus récente et que cette session est ouverte,
    //       autrement créer une nouvelle session.

    this.cards = await this.session.pick_cards()
    this.showQuestionPanel()
  }

  get currentCard() {
    return this.cards[0];
  }

  tick() {
    this.validateAnswer(true)
  }

  cross() {
    this.validateAnswer(false)
  }

  // Promote the card straight to the last (green) deck.
  medal() {
    this.validateAnswer(true, 4)
  }

  async validateAnswer(isCorrect, forcedLabel = null) {
    if (!this.currentCard.label) this.currentCard.label = 0

    if (forcedLabel !== null) { this.currentCard.label = forcedLabel }
    else if (isCorrect && this.currentCard.label < 4) { this.currentCard.label += 1 }
    else if (!isCorrect) { this.currentCard.label = 0 }

    // awaits here to prevent picking the card we just updated later
    await this.session.updateCard(this.currentCard, isCorrect)

    if (!isCorrect) { this.cards.push(this.cards.shift()) }
    else {
      const excluded_cards = this.cards.map((card) => card.id)
      this.cards.shift()
      this.cards.push(
        ...(await this.session.pick_cards(10 - this.cards.length, excluded_cards))
      )
    }

    await this.showQuestionPanel()
  }

  // A calendar event beats a notification here: the OS fires the alert, so it
  // needs no server and no permission prompt. The event links back to this
  // category — on iOS that opens the browser rather than the installed app.
  async addReminder() {
    if (!this.nextAvailable) { return }

    const category = await Category.find(this.session.category)
    const name = category ? category.name : 'SRS Flashcards'

    Reminder.download({
      at: Reminder.ceilToQuarter(this.nextAvailable),
      summary: `Study ${name}`,
      description: `Cards are ready to review in ${name}.`,
      // The app itself rather than the deck: the reminder names the category, and
      // opening on the category list leaves room to study something else.
      url: `${location.origin}/`
    })
  }

  showAnswer() {
    this.speak('question')
    this.element.querySelector('[data-role=answer]').removeAttribute('style')
    this.element.querySelector('[data-role=related-list]').removeAttribute('style')
    this.element.querySelector('[data-role=result-ui]').removeAttribute('style')
    this.element.querySelector('[data-role=decks]').style.display = 'none'
  }

  speak(role, lang = 'ja-JP') {
    const synth = window.speechSynthesis;
    const text = this.element.querySelector(`[data-role=${role}]`).innerText
    const voices = synth.getVoices().filter((voice) => voice.lang == lang);
    const spokenText = new SpeechSynthesisUtterance(text);
    spokenText.voice = voices[0]

    synth.speak(spokenText)
  }

  async showQuestionPanel() {
    const labels = this.constructor.labels
    const card = this.currentCard;

    const container = this.element.querySelector('section[role=content]');
    const cardElement = document.querySelector('#templates [data-role=card]').cloneNode(true)
    const oldElement = this.element.querySelector('section[role=content] [data-role=card]')

    this.updateDecks()
    this.element.querySelector('[data-role=decks]').removeAttribute('style')
    this.element.querySelector('[data-role=result-ui]').style.display = 'none'

    if (!card) {
      const message = document.createElement("p")
      message.classList.add("message")
      message.append("The deck is now empty")

      // Say when it refills, so the screen is not a dead end, and offer to put
      // that moment in the calendar.
      const nextAvailable = await Card.nextAvailable(this.session.category)
      if (nextAvailable) {
        this.nextAvailable = RelativeDate.dateFromSqliteTimestamp(nextAvailable)
        message.append(document.createElement("br"))
        message.append(`Next card ${new RelativeDate(this.nextAvailable).format()}`)

        const reminder = document.createElement("a")
        reminder.setAttribute("role", "button")
        reminder.classList.add("reminder")
        reminder.setAttribute("data-action", "click->study-session#addReminder")
        reminder.append("Remind me")
        message.append(document.createElement("br"), reminder)
      }

      if (oldElement) { oldElement.remove(); }
      container.appendChild(message)
      return
    }

    const properties = JSON.parse(card.properties)

    if (properties.on_yomi && properties.kun_yomi) {
      const phonetics = [properties.on_yomi.join('・'), properties.kun_yomi.join('・')].filter(Boolean).join('、')
      this.setPropertyText(cardElement, 'line-1', phonetics)
    } else {
      this.setPropertyText(cardElement, 'line-1', properties.kana)
    }

    this.setPropertyText(cardElement, 'question', properties.name)
    this.setPropertyValue(cardElement, 'label', 'aria-label', labels[card.label] || 'grey')
    this.setPropertyText(cardElement, 'line-2', properties.meaning)

    const relatedCards = await card.related();
    relatedCards.map((card) => this.appendRelated(cardElement, card))

    if (oldElement) { oldElement.remove(); }
    container.appendChild(cardElement)
  }

  setPropertyText(container, role, value) {
    container.querySelector(`[data-role=${role}]`).innerText = value
  }

  async updateDecks() {
    const labels = this.constructor.labels
    const decks = await Card.decks(this.session.category)
    const byLabel = {}
    for (const deck of decks) { byLabel[deck.label] = deck }

    for (const [index, label] of labels.entries()) {
      const line = this.element.querySelector(
        `[data-role=label][aria-label=${label}] + [data-role=line]`
      )
      const deck = byLabel[index]
      const count = deck ? deck.count : 0
      const available = deck ? deck.available : 0

      line.querySelector('[data-role=count]').innerText = count
      line.querySelector('[data-role=avail-bar]').style.width =
        count > 0 ? `${Math.round(100 * available / count)}%` : '0'
    }
  }

  setPropertyValue(container, role, attribute, value) {
    container.querySelector(`[data-role=${role}]`).setAttribute(attribute, value)
  }

  appendRelated(cardContainer, card) {
    const container = cardContainer.querySelector('[data-role="related-list"]');
    const element = document.querySelector('#templates [data-role="related-item"]').cloneNode(true)

    const properties = JSON.parse(card.properties)

    if (properties.on_yomi) {
      const phonetics = [properties.on_yomi.join('・'), properties.kun_yomi.join('・')].filter(Boolean).join('、')
      element.querySelector('[data-role=phonetics]').innerText = phonetics
    } else {
      element.querySelector('[data-role=phonetics]').innerText = properties.kana
    }

    element.querySelector('[data-role=title]').innerText = properties.name
    element.querySelector('[data-role=type]').innerText = ''
    element.querySelector('[data-role=description]').innerText = properties.meaning

    container.appendChild(element)
  }
}
