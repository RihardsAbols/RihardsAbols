import type { BoqState, ProjectListEntry, StorageAdapter } from "@tames-modulis/core";
import { migrateToCurrent } from "@tames-modulis/core";

const DB_NAME = "tames-modulis";
const DB_VERSION = 1;
const STORE_NAME = "projects";

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Browser StorageAdapter backed by IndexedDB - one object store, keyed by projectId, storing the full BoqState. */
export class IndexedDbStorageAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase();
    }
    return this.dbPromise;
  }

  async save(projectId: string, state: BoqState): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(state);
    await promisifyTransaction(tx);
  }

  async load(projectId: string): Promise<BoqState | null> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const result = await promisifyRequest<unknown>(tx.objectStore(STORE_NAME).get(projectId));
    return result ? migrateToCurrent(result) : null;
  }

  async list(): Promise<ProjectListEntry[]> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const all = await promisifyRequest<unknown[]>(tx.objectStore(STORE_NAME).getAll());
    return all.map((raw) => {
      const state = migrateToCurrent(raw);
      return { projectId: state.projectId, projectName: state.projectName, updatedAt: state.updatedAt };
    });
  }

  async delete(projectId: string): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(projectId);
    await promisifyTransaction(tx);
  }
}
