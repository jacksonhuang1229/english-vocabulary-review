import type { ImageAsset, WordGroup, WordSet } from '../types/models';
import { normalizeMeaningKey, normalizeWordKey } from '../quiz/normalize';

const DEFAULT_DB_NAME = 'english-vocab-review-db';
const DB_VERSION = 2;
const STORE_WORD_SETS = 'wordSets';
const STORE_IMAGE_ASSETS = 'imageAssets';
const STORE_WORD_GROUPS = 'wordGroups';

export interface VocabRepository {
  listWordSets(): Promise<WordSet[]>;
  getWordSet(id: string): Promise<WordSet | undefined>;
  saveWordSet(wordSet: WordSet): Promise<WordSet>;
  deleteWordSet(id: string): Promise<void>;
  listWordGroups(): Promise<WordGroup[]>;
  getWordGroup(id: string): Promise<WordGroup | undefined>;
  saveWordGroup(group: WordGroup): Promise<WordGroup>;
  deleteWordGroup(id: string): Promise<void>;
  listImageAssets(): Promise<ImageAsset[]>;
  getImageAsset(id: string): Promise<ImageAsset | undefined>;
  saveImageAsset(asset: ImageAsset): Promise<ImageAsset>;
  deleteImageAsset(id: string): Promise<void>;
  findReusableAssets(
    word: string,
    meaningHint?: string,
  ): Promise<{
    exactMatches: ImageAsset[];
    wordMatches: ImageAsset[];
    otherConfirmed: ImageAsset[];
  }>;
  close(): void;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 讀取或寫入失敗'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 交易失敗'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 交易已中止（可能是儲存空間不足）'));
  });
}

export function formatStorageError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'QuotaExceededError') {
      return '瀏覽器本機儲存空間不足，請刪除不需要的單字組或圖片後再試。';
    }
    if (err.name === 'InvalidStateError' || err.name === 'SecurityError') {
      return '目前瀏覽器模式（例如無痕模式或停用網站資料）無法寫入本機資料庫。';
    }
  }
  if (err instanceof Error && err.message) {
    return `儲存失敗：${err.message}`;
  }
  return '寫入本機資料失敗，已保留您目前的編輯內容，請稍後再試。';
}

export class IndexedDbVocabRepository implements VocabRepository {
  private readonly dbName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName: string = DEFAULT_DB_NAME) {
    this.dbName = dbName;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('此瀏覽器不支援 IndexedDB 本機儲存'));
        return;
      }

      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_WORD_SETS)) {
          db.createObjectStore(STORE_WORD_SETS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_IMAGE_ASSETS)) {
          const store = db.createObjectStore(STORE_IMAGE_ASSETS, { keyPath: 'id' });
          store.createIndex('by_normalizedWord', 'normalizedWord', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_WORD_GROUPS)) {
          db.createObjectStore(STORE_WORD_GROUPS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('無法開啟本機資料庫'));
      };
    });

    return this.dbPromise;
  }

  close(): void {
    if (!this.dbPromise) return;
    void this.dbPromise.then((db) => db.close()).catch(() => undefined);
    this.dbPromise = null;
  }

  async listWordSets(): Promise<WordSet[]> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_SETS, 'readonly');
    const store = tx.objectStore(STORE_WORD_SETS);
    const items = await requestToPromise(store.getAll() as IDBRequest<WordSet[]>);
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getWordSet(id: string): Promise<WordSet | undefined> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_SETS, 'readonly');
    const store = tx.objectStore(STORE_WORD_SETS);
    return requestToPromise(store.get(id) as IDBRequest<WordSet | undefined>);
  }

  async saveWordSet(wordSet: WordSet): Promise<WordSet> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_SETS, 'readwrite');
    const store = tx.objectStore(STORE_WORD_SETS);
    store.put(wordSet);
    await transactionDone(tx);
    return wordSet;
  }

  async deleteWordSet(id: string): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction([STORE_WORD_SETS, STORE_WORD_GROUPS], 'readwrite');
    const setStore = tx.objectStore(STORE_WORD_SETS);
    const groupStore = tx.objectStore(STORE_WORD_GROUPS);
    setStore.delete(id);

    // 同步從所有群組移除已刪除單字組的參照
    const groups = await requestToPromise(groupStore.getAll() as IDBRequest<WordGroup[]>);
    const now = Date.now();
    for (const group of groups) {
      if (group.wordSetIds.includes(id)) {
        groupStore.put({
          ...group,
          wordSetIds: group.wordSetIds.filter((sid) => sid !== id),
          updatedAt: now,
        });
      }
    }
    await transactionDone(tx);
  }

  async listWordGroups(): Promise<WordGroup[]> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_GROUPS, 'readonly');
    const store = tx.objectStore(STORE_WORD_GROUPS);
    const items = await requestToPromise(store.getAll() as IDBRequest<WordGroup[]>);
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getWordGroup(id: string): Promise<WordGroup | undefined> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_GROUPS, 'readonly');
    const store = tx.objectStore(STORE_WORD_GROUPS);
    return requestToPromise(store.get(id) as IDBRequest<WordGroup | undefined>);
  }

  async saveWordGroup(group: WordGroup): Promise<WordGroup> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_GROUPS, 'readwrite');
    const store = tx.objectStore(STORE_WORD_GROUPS);
    store.put(group);
    await transactionDone(tx);
    return group;
  }

  async deleteWordGroup(id: string): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_WORD_GROUPS, 'readwrite');
    const store = tx.objectStore(STORE_WORD_GROUPS);
    store.delete(id);
    await transactionDone(tx);
  }

  async listImageAssets(): Promise<ImageAsset[]> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_IMAGE_ASSETS, 'readonly');
    const store = tx.objectStore(STORE_IMAGE_ASSETS);
    const items = await requestToPromise(store.getAll() as IDBRequest<ImageAsset[]>);
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getImageAsset(id: string): Promise<ImageAsset | undefined> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_IMAGE_ASSETS, 'readonly');
    const store = tx.objectStore(STORE_IMAGE_ASSETS);
    return requestToPromise(store.get(id) as IDBRequest<ImageAsset | undefined>);
  }

  async saveImageAsset(asset: ImageAsset): Promise<ImageAsset> {
    const normalized: ImageAsset = {
      ...asset,
      normalizedWord: normalizeWordKey(asset.word),
      normalizedMeaning: normalizeMeaningKey(asset.meaningHint),
    };
    const db = await this.openDb();
    const tx = db.transaction(STORE_IMAGE_ASSETS, 'readwrite');
    const store = tx.objectStore(STORE_IMAGE_ASSETS);
    store.put(normalized);
    await transactionDone(tx);
    return normalized;
  }

  async deleteImageAsset(id: string): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(STORE_IMAGE_ASSETS, 'readwrite');
    const store = tx.objectStore(STORE_IMAGE_ASSETS);
    store.delete(id);
    await transactionDone(tx);
  }

  async findReusableAssets(
    word: string,
    meaningHint?: string,
  ): Promise<{
    exactMatches: ImageAsset[];
    wordMatches: ImageAsset[];
    otherConfirmed: ImageAsset[];
  }> {
    const all = await this.listImageAssets();
    const confirmed = all.filter((asset) => asset.confirmed);
    const targetWord = normalizeWordKey(word);
    const targetMeaning = normalizeMeaningKey(meaningHint);

    const exactMatches: ImageAsset[] = [];
    const wordMatches: ImageAsset[] = [];
    const otherConfirmed: ImageAsset[] = [];

    for (const asset of confirmed) {
      const sameWord = asset.normalizedWord === targetWord && targetWord.length > 0;
      const sameMeaning =
        targetMeaning.length > 0
          ? asset.normalizedMeaning === targetMeaning
          : asset.normalizedMeaning === '';

      if (sameWord && sameMeaning) {
        exactMatches.push(asset);
      } else if (sameWord) {
        wordMatches.push(asset);
      } else {
        otherConfirmed.push(asset);
      }
    }

    return { exactMatches, wordMatches, otherConfirmed };
  }
}

export async function getBrowserStorageEstimate(): Promise<{
  usageBytes: number;
  quotaBytes: number;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const est = await navigator.storage.estimate();
    if (typeof est.usage === 'number' && typeof est.quota === 'number') {
      return { usageBytes: est.usage, quotaBytes: est.quota };
    }
  } catch {
    return null;
  }
  return null;
}

export const defaultVocabRepo = new IndexedDbVocabRepository();
