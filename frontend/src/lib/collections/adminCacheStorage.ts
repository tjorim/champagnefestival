/** One record, with transactions serialized by IndexedDB across tabs. */
export class AdminCacheStorage {
  private database?: Promise<IDBDatabase>;

  private open() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        reject(new Error("Admin cache open timed out"));
      }, 2000);
      const request = indexedDB.open("champagne-admin-cache", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("cache");
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timeout);
        settled = true;
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timeout);
        settled = true;
        reject(new Error("Admin cache is blocked"));
      };
    }));
  }

  async read(): Promise<unknown> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readonly");
      const request = tx.objectStore("cache").get("client");
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  async write(value: unknown, isCurrent: () => boolean): Promise<void> {
    const db = await this.open();
    if (!isCurrent()) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").put(value, "client");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").clear();
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  }
}
