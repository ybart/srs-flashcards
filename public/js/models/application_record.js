import ApplicationDatabase from '../db.js'

export default class ApplicationRecord {
  static database;

  constructor(attributes) {
    return Object.assign(this, attributes)
  }

  static async connect() {
    if (!ApplicationRecord.database) {
      ApplicationRecord.database = new ApplicationDatabase()
      await ApplicationRecord.database.loadDatabase();
    }
  }

  static async execute(sql, bind) {
    if (!ApplicationRecord.database) { await ApplicationRecord.connect() }
    return await ApplicationRecord.database.execute(sql, bind);
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
