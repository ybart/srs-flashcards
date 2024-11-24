
// TODO:
//
//   - Abstraction Layer for low-level communication with DB,
//     so we can do db.exec() from main thread.
//   - JS ActiveRecord-like ORM, so we can do Category.all(),
//     Session.create(category:), session.start(), session.stop(),
//     session.correctly_answer(card), session.incorrectly_answer(card),
//     card.question_attributes(), card.answer_attributes(), etc...

export default class ApplicationDatabase {
  static STORAGE_DB_PATH = 'flashcards.db';
  static DEFAULT_DB_PATH = '/db/flashcards.db';

  constructor() {
    const worker = new Worker('/js/worker.js', { type: 'module' });
    this.worker = worker
    worker.addEventListener("message", this.messageListener.bind(this));
  }

  messageListener(event) {
    switch (event.data.name) {
      case 'worker_loaded':
        this.workerLoaded = true
        if (this.resolveWorker) { this.resolveWorker(); this.resolveWorker = null }

        break;
      default:
        console.log(`MainThread: received unhandled event ${event.data.name}`);
    }
  }

  async reset() {
    const storage = await navigator.storage.getDirectory();

    storage.removeEntry(this.constructor.STORAGE_DB_PATH)
  }

  async waitForWorker() {
    if (this.workerLoaded) { return Promise.resolve(true) }

    const callback = ((resolve, _reject) => { this.resolveWorker = resolve }).bind(this)
    return new Promise(callback)
  }

  async loadDatabase() {
    if (!this.workerLoaded) { await this.waitForWorker() }
    if (this.loading) { throw 'Database is already loading' }
    if (this.loaded) { return }

    this.loading = true
    await this.sendLoadDatabase();
    this.loading = false
    this.loaded = true
  }

  sendLoadDatabase() {
    return this.sendMessage("load_database", { "file": this.constructor.DEFAULT_DB_PATH });
  }

  execute(sql, bind) {
    const addPrefix = (memo, key) => (memo[`:${key}`] = bind[key], memo)
    const prefixed = bind ? Object.keys(bind).reduce(addPrefix, {}) : null;

    return this.sendMessage("execute", { "sql": sql, "bind": prefixed });
  }

  sendMessage(command, options) {
    // console.log('DB -> Worker', command, options)
    return new Promise((success, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = ({ data }) => {
        channel.port1.close();

        // console.log('DB <- Worker', command, data)
        if (data.error) { reject(data.error) }
        else { success(data.result) }
      }

      this.worker.postMessage({ ...options, ...{ 'name': command } }, [channel.port2]);
    })
  }

  async databaseFile() {
    const storage = await navigator.storage.getDirectory();
    const fileEntry =
      await storage.getFileHandle(this.constructor.STORAGE_DB_PATH);

    return await fileEntry.getFile();
  }

  async download() {
    const dbFile = await this.databaseFile();
    let arrayBuffer = await dbFile.arrayBuffer()

    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(
      [arrayBuffer],
      { type: 'application/vnd.sqlite3' }
    ))
    a.download = 'srs-flashcards.db'
    a.click()
  }
}
