import ApplicationRecord from './application_record.js'

export default class Card extends ApplicationRecord {
  static decks(category_id) {
    return ApplicationRecord.execute(`
      SELECT label, COUNT(*) as count FROM cards
      WHERE category_id = :category_id
      GROUP BY label
    `, { category_id: category_id })
  }

  static RELATED_CARDS_QUERY = `
    SELECT c.id, label, json(properties) as properties FROM cards c
    INNER JOIN related_cards rc
            ON :card_id IN (rc.owner_card_id, rc.related_card_id)
           AND c.id IN (rc.owner_card_id, rc.related_card_id)
    WHERE c.id != :card_id;
  `;

  async related() {
    const cards = await ApplicationRecord.execute(
      this.constructor.RELATED_CARDS_QUERY, { card_id: this.id }
    )

    return cards.map((card) => new Card(card));
  }
}
