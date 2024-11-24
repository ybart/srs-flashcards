require 'net/http'
require 'nokogiri'
require 'sqlite3'
require 'json'

# TODO: Wikipedia importer
module SrsFlashcards
  module StudyKanji
    class Scraper
      attr_reader :db, :level

      BASE_URL = URI('http://www.studykanji.net')

      def initialize(level)
        @db = SQLite3::Database.new "db/flashcards.db"

        @level = level
      end

      def import
        doc = Nokogiri::HTML5(get "kanjilist?JLPTLevel=#{level}")
        kanjis_doc = doc.css("#kanji-grid .kanji-detail")

        kanjis = kanjis_doc.map.with_index do |tag, index|
          print "\rImporting #{level} #{index + 1}/#{kanjis_doc.count}"

          link_tag = tag.css('a')
          next if link_tag.count.zero?

          id = link_tag.attr('id').text
          kanji_doc = Nokogiri::HTML5.fragment(
            post("kanjidetail/index", { "KanjiId" => id }), 'UTF-8'
          )

          {
            id:, name: link_tag.text,
            meaning: kanji_doc.css('#english').text,
            on_yomi: kanji_doc.css('#on-yomi').text.split(', '),
            kun_yomi: kanji_doc.css('#kun-yomi').text.split(', '),
            examples: kanji_doc.css('#examples tr').map do |tr|
              kanji, rest = tr.css('td:first').text.split(' ')
              kana = rest.split('&#160;').first[1..]

              { kanji:, kana:, meaning: tr.css('td:last').text }
            end
          }
        end.compact.tap { puts }
      end

      def get(path)
        Net::HTTP.get(BASE_URL + path)
      end

      def post(path, contents)
        Net::HTTP.post_form(BASE_URL + path, contents).body
      end
    end

    class Seeder
      attr_reader :db, :level

      def initialize(level)
        @db = SQLite3::Database.new "db/flashcards.db"
        @level = level
      end

      # TODO: Refactor
      def seed(data)
        puts "\n *** Seeds for #{level} ***"
        # Create kanji and words categories if missing
        kanji_category_id = create_category(level)
        word_category_id  = create_category("#{level} Vocabulary")

        # Count Kanji in DB and in Data
        db_kanjis = cards(kanji_category_id)
        puts "Kanji in DB: #{db_kanjis.count} - in Data: #{data.count}"

        # Count Words in DB and in Data
        db_words = cards(word_category_id)
        data_words_count = data.map { |kanji| kanji['examples'].count }.sum
        puts "Words in DB: #{db_words.count} - in Data: #{data_words_count}"

        # Check for kanjis missing in DB or no longer data
        data_kanjis = data.map { |kanji| [kanji['name'], kanji] }.to_h
        db_missing_kanjis_names = data_kanjis.keys - db_kanjis.keys
        puts "#{db_missing_kanjis_names.count} kanjis are "\
             "in data are missing in DB."
        puts "#{(db_kanjis.keys - data_kanjis.keys).count} kanjis are "\
             "in DB but no longer in data."

        # TODO: Check for updated kanjis

        # Check for words missing in DB or no longer data
        all_data_words = data.map do |kanji|
          kanji['examples'].map do |word|
            [
              [word['kanji'], word['kana']],
              word.merge('parent' => kanji['name'])
            ]
          end
        end.flatten(1)

        # Merge words shared with multiple kanjis
        data_words = all_data_words.reduce({}) do |words, (key, value)|
          if words[key]
            words[key]['parent'] =
              (Array(words[key]['parent']) + Array(value['parent'])).uniq
          else
            words[key] = value
          end

          words
        end
        puts "#{data_words.count} unique words found in data."

        db_missing_words_names = data_words.keys - db_words.keys
        puts "#{db_missing_words_names.count} words are "\
             "in data are missing in DB."
        puts "#{(db_words.keys - data_words.keys).count} words are "\
             "in DB but no longer in data."

        # TODO: Check for updated words (words with changed translation
        #       or linked to different kanjis)

        # Add missing kanjis
        create_cards(
          data_kanjis.slice(*db_missing_kanjis_names).map do |name, kanji|
            [
              kanji_category_id,
              name,
              {
                name: name,
                meaning: kanji['meaning'],
                on_yomi: kanji['on_yomi'],
                kun_yomi: kanji['kun_yomi']
              }.to_json
            ]
          end
        )

        # TODO: Delete extra kanjis
        # TODO: Update necessary kanjis

        # Add missing words
        created_words = create_cards(
          data_words.slice(*db_missing_words_names).map do |name, word|
            [
              word_category_id,
              "#{word['kanji']}(#{word['kana']})",
              {
                name: word['kanji'],
                meaning: word['meaning'],
                kana: word['kana'],
              }.to_json
            ]
          end
        ).map { |word| [word["reference"], word] }.to_h

        # Link words to kanjis
        db_kanjis = cards(kanji_category_id)
        create_related_cards(
          data_words.slice(*db_missing_words_names).map do |name, word|
            Array(word['parent']).map do |parent|
              [
                'example_word',
                db_kanjis[parent]['id'],
                created_words["#{name[0]}(#{name[1]})"]['id']
              ]
            end
          end.flatten(1)
        )

        # TODO: Fix issue causing words not to be inserted
        # TODO: Delete extra words
        # TODO: Update necessary words

        # Later:
        #   - Upgrade word category if needed (we will do it later
        #     if really needed as it might complicate calculations
        #     and updates when a word was moved:)
      end

      def create_category(name)
        db.execute(<<-SQL, { name: }).first.first
          INSERT INTO categories(name) VALUES (:name)
          ON CONFLICT DO UPDATE SET id=id
          RETURNING id;
        SQL
      end

      def cards(category_id)
        db.results_as_hash = true
        results = db.execute <<-SQL, { category_id: }
          SELECT * FROM cards WHERE category_id = :category_id;
        SQL

        results.map { |row| [row['reference'], row] }.to_h
      end

      def create_cards(attributes)
        attributes.map do |row|
          db.execute <<-SQL, row
            INSERT INTO cards(category_id, reference, properties)
            VALUES (?, ?, jsonb(?))
            RETURNING id, reference;
          SQL
        end.flatten(1)
      end

      def create_related_cards(attributes)
        attributes.each do |row|
          db.execute <<-SQL, row
            INSERT INTO related_cards(relation, owner_card_id, related_card_id)
            VALUES (?, ?, ?);
          SQL
        end
      end
    end
  end
end
