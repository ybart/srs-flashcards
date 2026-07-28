// import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import sqlite3InitModule from "./sqlite3/sqlite3.mjs"

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

    port.postMessage({ result: 'success' })
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
