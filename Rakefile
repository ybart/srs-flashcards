#!/usr/bin/env ruby

$LOAD_PATH.unshift "#{__dir__}/lib"

require 'srs_flashcards'
require 'json'

namespace :db do
  task :create do
    SrsFlashcards.create_database
  end

  task :drop do
    File.delete "#{__dir__}/db/flashcards.db"
  end

  task :seed do
    %w[N5 N4 N3 N2 N1].each do |level|
      importer = SrsFlashcards::StudyKanji::Seeder.new(level)
      kanjis = JSON.load(File.new "data/studykanji/#{level}.json")
      importer.seed(kanjis)
    end
  end
end

task :db do
  system("sqlite3 #{__dir__}/db/flashcards.db")
end

namespace :scrap do
  task :studykanji do
    %w[N5 N4 N3 N2 N1].each do |level|
      importer = SrsFlashcards::StudyKanji::Scraper.new(level)
      json = importer.import.to_json
      File.write("data/studykanji/#{level}.json", json)
    end
  end
end
