require "sqlite3"

module SrsFlashcards
  module Schema
    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      def create_database
        db = SQLite3::Database.new "db/flashcards.db"

        # TODO: Move contents to db/schema.sql
        db.execute_batch <<-SQL
          CREATE TABLE categories (
            id integer primary key,
            name varchar(64) UNIQUE
          );

          CREATE TABLE cards (
            id integer primary key,
            category_id integer NOT NULL,
            reference varchar(64),
            label integer,
            properties jsonb CHECK(json_valid(properties, 4)),
            FOREIGN KEY(category_id) REFERENCES categories(id),
            UNIQUE(category_id, reference)
          );

          CREATE TABLE related_cards (
            id integer primary key,
            relation varchar(16),
            owner_card_id integer NOT NULL,
            related_card_id integer NOT NULL,
            FOREIGN KEY(owner_card_id) REFERENCES cards(id),
            FOREIGN KEY(related_card_id) REFERENCES cards(id),
            UNIQUE(relation, owner_card_id, related_card_id)
          );

          CREATE TABLE sessions (
            id integer primary key,
            category_id integer NOT NULL,
            started_at varchar(32) CHECK(started_at == datetime(started_at, 'subsec')),
            finished_at varchar(32) CHECK(finished_at == datetime(finished_at, 'subsec')),
            progress jsonb CHECK(json_valid(progress, 4)),
            FOREIGN KEY(category_id) REFERENCES categories(id)
          );

          CREATE TABLE session_cards (
            id integer primary key,
            session_id integer NOT NULL,
            card_id integer NOT NULL,
            studied_at varchar(32) CHECK(studied_at == datetime(studied_at, 'subsec')),
            times_studied INTEGER NOT NULL DEFAULT 0,
            times_correct INTEGER NOT NULL DEFAULT 0,
            UNIQUE(session_id, card_id),
            FOREIGN KEY(session_id) REFERENCES sessions(id),
            FOREIGN KEY(card_id) REFERENCES cards(id)
          );

          CREATE TABLE preferences (
            id integer primary key,
            key varchar(32),
            value varchar(32)
          );
        SQL
      end
    end
  end
end
