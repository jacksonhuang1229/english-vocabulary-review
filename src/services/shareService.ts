import { deflateSync, inflateSync } from 'fflate';
import type { ImageAsset, WordEntry, WordSet } from '../types/models';
import { normalizeMeaningKey, normalizeWordKey } from '../quiz/normalize';
import { generateId } from '../utils/id';

const PACKAGE_SCHEMA_VERSION = 1;
const MAX_SAFE_SHARE_URL_LENGTH = 8000;

interface LegacyCompactSharePayload {
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

function sanitizeLineField(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').trim();
}

/**
 * 將單字組以精簡行格式＋Deflate 壓縮編碼成最短的分享碼：
 * - 第一行為課次名稱
 * - 後續每行為：英文詞[\t詞義[\t1(抽象詞)]]
 * - 自動比較壓縮（z.）與未壓縮精簡格式（c.），挑選字元數較短者。
 */
export function encodeWordSetToShareToken(wordSet: WordSet): string {
  const lines: string[] = [sanitizeLineField(wordSet.name)];
  for (const entry of wordSet.entries) {
    const word = sanitizeLineField(entry.word);
    if (!word) continue;
    const meaning = entry.meaningHint ? sanitizeLineField(entry.meaningHint) : '';
    if (entry.isAbstract) {
      lines.push(`${word}\t${meaning}\t1`);
    } else if (meaning) {
      lines.push(`${word}\t${meaning}`);
    } else {
      lines.push(word);
    }
  }

  const rawBytes = new TextEncoder().encode(lines.join('\n'));
  const plainToken = `c.${bytesToBase64Url(rawBytes)}`;

  try {
    const compressed = deflateSync(rawBytes, { level: 9 });
    const compressedToken = `z.${bytesToBase64Url(compressed)}`;
    return compressedToken.length < plainToken.length ? compressedToken : plainToken;
  } catch {
    return plainToken;
  }
}

function parseCompactLinesToWordSet(text: string): WordSet {
  const lines = text.split('\n');
  const name = (lines[0] ?? '').trim();
  if (!name) {
    throw new Error('分享連結缺少單字組名稱。');
  }

  const now = Date.now();
  const entries: WordEntry[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const [rawWord = '', rawMeaning = '', rawAbstract = ''] = line.split('\t');
    const word = rawWord.trim().replace(/\s+/g, ' ');
    if (!word) continue;
    const meaningHint = rawMeaning.trim() || undefined;
    const isAbstract = rawAbstract.trim() === '1' ? true : undefined;
    entries.push({
      id: `shared_${i - 1}_${normalizeWordKey(word).replace(/\s+/g, '_')}`,
      word,
      meaningHint,
      isAbstract,
    });
  }

  if (entries.length === 0) {
    throw new Error('分享的單字組中沒有任何有效詞條。');
  }

  return {
    id: 'shared_preview',
    name,
    createdAt: now,
    updatedAt: now,
    entries,
  };
}

/**
 * 解析分享網址中的單字組資料。
 * 同時相容新版壓縮短碼（z. / c.）與舊版 JSON 編碼。
 */
export function decodeShareTokenToWordSet(token: string): WordSet {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('分享連結內容為空，請確認連結是否完整。');
  }

  // 新版壓縮格式 (z.<base64url(deflate)>)
  if (trimmed.startsWith('z.')) {
    let text: string;
    try {
      const compressed = base64UrlToBytes(trimmed.slice(2));
      const inflated = inflateSync(compressed);
      text = new TextDecoder().decode(inflated);
    } catch {
      throw new Error('無法解壓縮分享連結內容，可能是連結被截斷或格式有誤。');
    }
    return parseCompactLinesToWordSet(text);
  }

  // 新版未壓縮精簡格式 (c.<base64url(utf8)>)
  if (trimmed.startsWith('c.')) {
    let text: string;
    try {
      const bytes = base64UrlToBytes(trimmed.slice(2));
      text = new TextDecoder().decode(bytes);
    } catch {
      throw new Error('無法讀取分享連結內容，可能是連結被截斷或格式有誤。');
    }
    return parseCompactLinesToWordSet(text);
  }

  // 相容舊版 JSON Base64URL 格式
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

  const record = parsed as Partial<LegacyCompactSharePayload>;
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
    id: 'shared_preview',
    name: record.n.trim(),
    createdAt: now,
    updatedAt: now,
    entries,
  };
}

/**
 * 產生縮短後的分享網址（使用精簡壓縮編碼與 #/s/ 短路徑）。
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
  const url = `${originAndPath}#/s/${token}`;
  return {
    url,
    tooLong: url.length > MAX_SAFE_SHARE_URL_LENGTH,
  };
}

/**
 * 產生含標題、單字摘要與短連結的友善分享文字，讓對方在 LINE／訊息一眼就知道這是什麼。
 */
export function buildShareMessage(
  wordSet: WordSet,
  url: string,
): { title: string; summary: string; fullText: string } {
  const words = wordSet.entries.map((e) => e.word.trim()).filter(Boolean);
  const previewWords = words.slice(0, 5).join('、');
  const suffix = words.length > 5 ? ` 等共 ${words.length} 個單字` : `（共 ${words.length} 個單字）`;
  const title = `英文單字組分享：${wordSet.name}`;
  const summary =
    words.length > 0
      ? `包含 ${previewWords}${suffix}。點開連結可直接做字母填空／聽音拼字，也能存到自己的手機！`
      : '點開連結即可複習英文單字，免登入！';
  const fullText = `📚 ${title}\n${summary}\n👉 ${url}`;

  return { title, summary, fullText };
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
