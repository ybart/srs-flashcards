// import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import sqlite3InitModule from "./sqlite3/sqlite3.mjs"
import { migrate } from "./migrations.js"
import { update } from "./content.js"

export default class ApplicationWorker {
  constructor() {
    this.db = null;
    addEventListener("message", this.receiveMessage.bind(this));
    postMessage({ 'name': 'worker_loaded' });
  }

  async receiveMessage(event) {
    switch (event.data.name) {
      case 'load_database':
        await this.openPersistentDb(event.ports[0], event.data.file);
        break;
      case 'import_database':
        await this.importDatabase(event.ports[0], event.data.data);
        break;
      case 'execute':
        this.executeQuery(event.ports[0], event.data.sql, event.data.bind);
        break;
      default:
        console.log(`Worker: received unhandled event ${event.data.name}`);
    }
  }

  async openPersistentDb(port, db_url) {
    if (this.db) { return; }

    // Kept for the content update, which reads the shipped database, and for an
    // upload, which can hand us a file older than anything we ship.
    this.dbUrl = db_url;
    const sqlite3 = await sqlite3InitModule();
    this.db = new sqlite3.oo1.OpfsDb('flashcards.db', 'c');
    const db = this.db;

    // Check whether DB is empty
    var result = null;
    const options = { callback: (cb_result) => { result = cb_result } }
    await db.exec("SELECT count(*) FROM sqlite_master WHERE type='table';", options)
    if (result[0] > 0) {
      console.log('worker.js: DB already has data', result[0]);
    } else {
      // If it is, import default DB
      db.close()

      const res = await fetch(db_url);
      const raw_db_data = await res.arrayBuffer();
      await sqlite3.oo1.OpfsDb.importDb('flashcards.db', raw_db_data);
      this.db = new sqlite3.oo1.OpfsDb('flashcards.db', 'c');
    }

    migrate(this.db);
    await this.updateContent(sqlite3);

    port.postMessage({ result: 'success' })
  }

  // Corrections and translations to the cards themselves, which only ever
  // reached fresh installs before. See content.js: it is idempotent, gated on a
  // version, and reports rather than throws, so an offline launch just tries
  // again next time.
  async updateContent(sqlite3) {
    if (!this.dbUrl) { return; }

    const report = await update(sqlite3, this.db, this.dbUrl);
    console.log('worker.js: content', report);
  }

  // Replace the persistent OPFS database with the bytes of an uploaded file.
  async importDatabase(port, rawData) {
    try {
      const bytes = new Uint8Array(rawData);

      // Reject non-SQLite files up front with a clear message. Every SQLite
      // file starts with the 16-byte magic string "SQLite format 3\0".
      const MAGIC = 'SQLite format 3\0';
      const looksLikeSqlite = bytes.length >= 16 &&
        Array.from(MAGIC).every((ch, i) => bytes[i] === ch.charCodeAt(0));
      if (!looksLikeSqlite) {
        throw new Error('Not a SQLite database (bad file header)');
      }

      const sqlite3 = await sqlite3InitModule();
      if (this.db) { this.db.close(); this.db = null; }

      await sqlite3.oo1.OpfsDb.importDb('flashcards.db', bytes);
      this.db = new sqlite3.oo1.OpfsDb('flashcards.db', 'c');

      // An imported file can come from any older version of the app, in its
      // schema and in its content both.
      migrate(this.db);
      await this.updateContent(sqlite3);

      port.postMessage({ result: 'success' });
    } catch (error) {
      port.postMessage({ error: String((error && error.message) || error) });
    }
  }

  // TODO: Fallback to transient DB when persistent is not available
  async openTransientDatabase(db_url) {
    const sqlite3 = await sqlite3InitModule();
    const immutable = false;

    const res = await fetch(db_url);
    const arrayBuffer = await res.arrayBuffer();

    if (!immutable) {
      arrayBuffer.resizeable = true;
    }

    const p = sqlite3.wasm.allocFromTypedArray(arrayBuffer);

    // TODO: If DB is already loaded
    this.db = new sqlite3.oo1.DB();
    let deserialize_flags =
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE;
    if (!immutable) {
      deserialize_flags |= sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    }
    const rc = sqlite3.capi.sqlite3_deserialize(
      this.db.pointer, 'main', p, arrayBuffer.byteLength, arrayBuffer.byteLength, deserialize_flags
    );
    this.db.checkRc(rc);
  }

  executeQuery(port, sql, bind) {
    let rows = []
    let columnNames = []
    let data;
    let exec_options = {
      callback: (row) => {
        if (row) {
          const entries = columnNames.map(
            (key, index) => { return [key, row[index]] }
          );

          rows.push(Object.fromEntries(new Map(entries)))
        }
      },
      bind: bind,
      columnNames: columnNames
    }

    try {
      this.db.exec(sql, exec_options);
      data = { result: rows }
    } catch (error) {
      data = { error: error }
    }
    port.postMessage(data)
  }
}

new ApplicationWorker();
