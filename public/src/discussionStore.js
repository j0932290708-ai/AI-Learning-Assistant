// Local device only. Credentials and pending requests never enter these records.
export function createDiscussionStore(factory = globalThis.indexedDB) {
  let opening;
  function db() {
    if (!factory) return Promise.reject(new Error('瀏覽器不支援本機討論保存'));
    return opening ||= new Promise((resolve, reject) => {
      const request = factory.open('learning-discussions', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('discussions', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => { opening = null; reject(new Error('請關閉其他舊版分頁後重試')); };
    });
  }
  async function transaction(mode, work) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('discussions', mode); let value, error;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(error || tx.error || new Error('無法保存討論'));
      work(tx.objectStore('discussions'), result => { value = result; }, reason => { error = reason; tx.abort(); });
    });
  }
  return {
    list: () => transaction('readonly', (store, done) => {
      const request = store.getAll(); request.onsuccess = () => done(request.result.map(r => ({ id: r.id, question: r.question, updatedAt: r.updatedAt, version: r.version })));
    }),
    get: id => transaction('readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result); }),
    put: (record, expectedVersion = 0) => transaction('readwrite', (store, done, fail) => {
      const request = store.get(record.id);
      request.onsuccess = () => {
        if ((request.result?.version || 0) !== expectedVersion) return fail(new Error('另一個分頁已更新此討論。請匯出目前內容後，重新整理頁面再開啟保存版本，避免覆蓋。'));
        const version = expectedVersion + 1; store.put({ ...record, version }); done(version);
      };
    })
  };
}
