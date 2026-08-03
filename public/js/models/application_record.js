import ApplicationDatabase from '../db.js'

export default class ApplicationRecord {
  static database;
  static connecting;

  constructor(attributes) {
    return Object.assign(this, attributes)
  }

  // One connection, awaited by everybody. The database is only published once it
  // is open: assigning it first and *then* awaiting the load let a second caller
  // see a truthy database and query a worker whose own handle was still null —
  // "Cannot read properties of null (reading 'exec')", thrown inside the worker,
  // rejecting whichever caller lost the race. On a warm launch the load is quick
  // enough that nobody notices; on a first launch, which imports 1.5 MB and then
  // migrates and updates the content, the category list simply never appeared.
  static connect() {
    if (!ApplicationRecord.connecting) {
      const database = new ApplicationDatabase()
      ApplicationRecord.connecting = database.loadDatabase().then(() => {
        ApplicationRecord.database = database
        return database
      })
    }

    return ApplicationRecord.connecting
  }

  static async execute(sql, bind) {
    const database = ApplicationRecord.database || await ApplicationRecord.connect()

    return await database.execute(sql, bind);
  }

  static sql_escape(string) {
    return string.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function(char) {
      switch (char) {
        case "\0":
          return "\\0";
        case "\x08":
          return "\\b";
        case "\x09":
          return "\\t";
        case "\x1a":
          return "\\z";
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "\"":
        case "'":
        case "\\":
        case "%":
          return "\\" + char; // prepends a backslash to backslash, percent,
        // and double/single quotes
        default:
          return char;
      }
    });
  }
}
