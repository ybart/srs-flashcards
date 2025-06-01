import { Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import Session from '../models/session.js'
import Card from '../models/card.js'


export default class extends Controller {
  static defaultProgress = Object.freeze({ red: 0, orange: 0, yellow: 0, lightgreen: 0, green: 0 })
  static targets = Object.freeze(["question", "answer", "related"])
  static labels = Object.freeze(['red', 'orange', 'yellow', 'lightgreen', 'green'])

  async connect() {
    // Check the category param
    const fragment = document.location.hash.substring(1)
    const params = Object.fromEntries(new URLSearchParams(fragment))

    this.session = await Session.create(
      { ...params, ...{ progress: this.constructor.defaultProgress } }
    )

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

  async validateAnswer(isCorrect) {
    if (!this.currentCard.label) this.currentCard.label = 0
    const labels = this.constructor.labels

    // TODO: Update the session progress

    const previousLabel = this.currentCard.label
    if (isCorrect && this.currentCard.label < 4) { this.currentCard.label += 1 }
    if (!isCorrect) { this.currentCard.label = 0 }

    this.session.progress[labels[previousLabel]] -= 1
    this.session.progress[labels[this.currentCard.label]] += 1

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

    console.log(this.cards.map((card) => JSON.parse(card.properties).name))

    if (oldElement) { oldElement.remove(); }
    container.appendChild(cardElement)
  }

  setPropertyText(container, role, value) {
    container.querySelector(`[data-role=${role}]`).innerText = value
  }

  async updateDecks() {
    const labels = this.constructor.labels
    const decks = await Card.decks(this.session.category)

    for (const label of labels) {
      const element = this.element.querySelector(
        `[data-role=label][aria-label=${label}] + [data-role=line]`
      )
      element.innerText = 0
    }

    for (const deck of decks) {
      const label = labels[deck.label]
      if (!label) { continue; }

      const element = this.element.querySelector(
        `[data-role=label][aria-label=${label}] + [data-role=line]`
      )
      element.innerText = deck.count
    }
  }

  setPropertyValue(container, role, attribute, value) {
    container.querySelector(`[data-role=${role}]`).setAttribute(attribute, value)
  }

  showCardDetails() {
    // Load related cards list
    this.questionTarget.style.display = value ? "none" : "flex"
    this.answerTarget.style.display = value ? "flex" : "none"
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
