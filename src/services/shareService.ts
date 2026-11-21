import type { ImageAsset, WordEntry, WordSet } from '../types/models';
import { normalizeMeaningKey, normalizeWordKey } from '../quiz/normalize';
import { generateId } from '../utils/id';

const SHARE_SCHEMA_VERSION = 1;
const PACKAGE_SCHEMA_VERSION = 1;
const MAX_SAFE_SHARE_URL_LENGTH = 8000;

interface CompactSharePayload {
  v: number;
  n: string;
  e: Array<{
    w: string;
    m?: string;
    a?: 1;
  }>;
}

interface ExportedImageAsset {
  id: string;
  word: string;
  meaningHint: string;
  mimeType: string;
  dataBase64: string;
  source: ImageAsset['source'];
  confirmed: boolean;
  confusableWords: string[];
}

export interface ExportedWordSetPackage {
  format: 'english-vocab-review-package';
  version: number;
  exportedAt: number;
  wordSet: {
    name: string;
    entries: Array<{
      word: string;
      meaningHint?: string;
      imageId?: string | null;
      imageConfirmed?: boolean;
      isAbstract?: boolean;
    }>;
  };
  imageAssets: ExportedImageAsset[];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      } else {
        reject(new Error('無法讀取圖片資料'));
      }
    };
    reader.onerror = () => reject(new Error('無法轉換圖片資料'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 將單字組（名稱、單字與詞義提示）編碼成可直接放在網址上的短碼。
 * 不含圖片二進位檔，讓連結可在 LINE、簡訊與瀏覽器中直接開啟。
 */
export function encodeWordSetToShareToken(wordSet: WordSet): string {
  const payload: CompactSharePayload = {
    v: SHARE_SCHEMA_VERSION,
    n: wordSet.name.trim(),
    e: wordSet.entries
      .filter((entry) => entry.word.trim().length > 0)
      .map((entry) => {
        const item: CompactSharePayload['e'][number] = { w: entry.word.trim() };
        if (entry.meaningHint?.trim()) item.m = entry.meaningHint.trim();
        if (entry.isAbstract) item.a = 1;
        return item;
      }),
  };

  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

/**
 * 解析分享網址中的單字組資料。若連結不完整或格式錯誤會拋出清楚錯誤。
 */
export function decodeShareTokenToWordSet(token: string): WordSet {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('分享連結內容為空，請確認連結是否完整。');
  }

  let parsed: unknown;
  try {
    const bytes = base64UrlToBytes(trimmed);
    const json = new TextDecoder().decode(bytes);
    parsed = JSON.parse(json);
  } catch {
    throw new Error('無法讀取分享連結內容，可能是連結被截斷或格式有誤。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('分享連結資料格式不正確。');
  }

  const record = parsed as Partial<CompactSharePayload>;
  if (typeof record.n !== 'string' || !record.n.trim() || !Array.isArray(record.e)) {
    throw new Error('分享連結缺少單字組名稱或詞條清單。');
  }

  const now = Date.now();
  const entries: WordEntry[] = [];
  for (let i = 0; i < record.e.length; i += 1) {
    const raw = record.e[i];
    if (!raw || typeof raw !== 'object' || typeof raw.w !== 'string') continue;
    const word = raw.w.trim().replace(/\s+/g, ' ');
    if (!word) continue;
    entries.push({
      id: `shared_${i}_${normalizeWordKey(word).replace(/\s+/g, '_')}`,
      word,
      meaningHint: typeof raw.m === 'string' && raw.m.trim() ? raw.m.trim() : undefined,
      isAbstract: raw.a === 1 ? true : undefined,
    });
  }

  if (entries.length === 0) {
    throw new Error('分享的單字組中沒有任何有效詞條。');
  }

  return {
    id: `shared_preview`,
    name: record.n.trim(),
    createdAt: now,
    updatedAt: now,
    entries,
  };
}

/**
 * 產生可直接分享的完整網址（基於目前網站網址 + #/share/<token>）。
 */
export function buildShareUrl(wordSet: WordSet, baseHref?: string): {
  url: string;
  tooLong: boolean;
} {
  const token = encodeWordSetToShareToken(wordSet);
  const originAndPath =
    baseHref ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://jacksonhuang1229.github.io/english-vocabulary-review/');
  const url = `${originAndPath}#/share/${token}`;
  return {
    url,
    tooLong: url.length > MAX_SAFE_SHARE_URL_LENGTH,
  };
}

/**
 * 將分享預覽中的 WordSet 複製成一份全新 ID 的本機單字組，準備寫入 IndexedDB。
 */
export function cloneSharedWordSetForLocalSave(shared: WordSet): WordSet {
  const now = Date.now();
  return {
    id: generateId('set'),
    name: shared.name.trim(),
    createdAt: now,
    updatedAt: now,
    entries: shared.entries.map((e) => ({
      id: generateId('word'),
      word: e.word,
      meaningHint: e.meaningHint,
      isAbstract: e.isAbstract,
    })),
  };
}

/**
 * 匯出完整單字組交換檔（.vocab.json），包含所有詞條與已設定的配圖。
 */
export async function exportWordSetPackageJson(
  wordSet: WordSet,
  assetsById: Record<string, ImageAsset>,
): Promise<string> {
  const referencedIds = new Set<string>();
  for (const entry of wordSet.entries) {
    if (entry.imageId && assetsById[entry.imageId]) {
      referencedIds.add(entry.imageId);
    }
  }

  const exportedAssets: ExportedImageAsset[] = [];
  for (const id of referencedIds) {
    const asset = assetsById[id];
    const dataBase64 = await blobToBase64(asset.blob);
    exportedAssets.push({
      id: asset.id,
      word: asset.word,
      meaningHint: asset.meaningHint,
      mimeType: asset.mimeType || asset.blob.type || 'image/jpeg',
      dataBase64,
      source: asset.source,
      confirmed: asset.confirmed,
      confusableWords: asset.confusableWords ?? [],
    });
  }

  const pkg: ExportedWordSetPackage = {
    format: 'english-vocab-review-package',
    version: PACKAGE_SCHEMA_VERSION,
    exportedAt: Date.now(),
    wordSet: {
      name: wordSet.name,
      entries: wordSet.entries.map((entry) => ({
        word: entry.word,
        meaningHint: entry.meaningHint,
        imageId: entry.imageId && referencedIds.has(entry.imageId) ? entry.imageId : null,
        imageConfirmed:
          entry.imageId && referencedIds.has(entry.imageId) ? Boolean(entry.imageConfirmed) : false,
        isAbstract: entry.isAbstract,
      })),
    },
    imageAssets: exportedAssets,
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * 解析他人分享的完整單字組檔（.vocab.json），還原詞條與配圖（並重新配發 ID 避免衝突）。
 */
export function parseWordSetPackageJson(rawJson: string): {
  wordSet: WordSet;
  imageAssets: ImageAsset[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('無法解析此單字組檔案，請確認檔案為本網站匯出的 .vocab.json 檔。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('單字組檔案內容格式無效。');
  }

  const pkg = parsed as Partial<ExportedWordSetPackage>;
  if (
    pkg.format !== 'english-vocab-review-package' ||
    !pkg.wordSet ||
    typeof pkg.wordSet.name !== 'string' ||
    !Array.isArray(pkg.wordSet.entries)
  ) {
    throw new Error('這不是本網站的共用單字組檔案格式（.vocab.json）。');
  }

  const now = Date.now();
  const idMap = new Map<string, string>();
  const imageAssets: ImageAsset[] = [];

  if (Array.isArray(pkg.imageAssets)) {
    for (const rawAsset of pkg.imageAssets) {
      if (
        !rawAsset ||
        typeof rawAsset.id !== 'string' ||
        typeof rawAsset.dataBase64 !== 'string'
      ) {
        continue;
      }
      try {
        const bytes = base64ToBytes(rawAsset.dataBase64);
        const mimeType = typeof rawAsset.mimeType === 'string' ? rawAsset.mimeType : 'image/jpeg';
        const blob = new Blob([bytes], { type: mimeType });
        const newId = generateId('img');
        idMap.set(rawAsset.id, newId);
        const word = typeof rawAsset.word === 'string' ? rawAsset.word.trim() : '';
        const meaningHint =
          typeof rawAsset.meaningHint === 'string' ? rawAsset.meaningHint.trim() : '';
        imageAssets.push({
          id: newId,
          word,
          normalizedWord: normalizeWordKey(word),
          meaningHint,
          normalizedMeaning: normalizeMeaningKey(meaningHint),
          blob,
          mimeType,
          source: rawAsset.source === 'camera' ? 'camera' : 'upload',
          confirmed: Boolean(rawAsset.confirmed),
          confusableWords: Array.isArray(rawAsset.confusableWords)
            ? rawAsset.confusableWords.filter((w): w is string => typeof w === 'string')
            : [],
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        // 略過損毀的單張圖片，保留其餘資料
      }
    }
  }

  const entries: WordEntry[] = [];
  for (const rawEntry of pkg.wordSet.entries) {
    if (!rawEntry || typeof rawEntry.word !== 'string') continue;
    const word = rawEntry.word.trim().replace(/\s+/g, ' ');
    if (!word) continue;
    const mappedImageId =
      rawEntry.imageId && idMap.has(rawEntry.imageId) ? idMap.get(rawEntry.imageId)! : null;
    entries.push({
      id: generateId('word'),
      word,
      meaningHint:
        typeof rawEntry.meaningHint === 'string' && rawEntry.meaningHint.trim()
          ? rawEntry.meaningHint.trim()
          : undefined,
      imageId: mappedImageId,
      imageConfirmed: mappedImageId ? Boolean(rawEntry.imageConfirmed) : false,
      isAbstract: Boolean(rawEntry.isAbstract) || undefined,
    });
  }

  if (entries.length === 0) {
    throw new Error('這個共用單字組檔案中沒有任何有效詞條。');
  }

  return {
    wordSet: {
      id: generateId('set'),
      name: pkg.wordSet.name.trim() || '匯入的單字組',
      createdAt: now,
      updatedAt: now,
      entries,
    },
    imageAssets,
  };
}

/** 匯出純文字 UTF-8 .txt（每行一個英文詞） */
export function exportWordSetAsTxt(wordSet: WordSet): string {
  return wordSet.entries
    .map((e) => e.word.trim())
    .filter(Boolean)
    .join('\n');
}

/** 產生安全檔名 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
  return cleaned || 'vocab-set';
}

/** 觸發瀏覽器下載檔案 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
