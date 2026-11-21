import type { DraftEntry } from '../types/models';
import { generateId } from '../utils/id';

export interface ParsedTextResult {
  entries: DraftEntry[];
  empty: boolean;
}

/**
 * 解析 UTF-8 文字檔內容（每行一個英文詞）。
 * - 去除 UTF-8 BOM
 * - 去除首尾空白、略過空白行
 * - 保留詞內空格與連字號，多個內部空白合併為單一空白
 */
export function parseWordListText(rawText: string): ParsedTextResult {
  const cleaned = rawText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);
  const entries: DraftEntry[] = [];

  for (const rawLine of lines) {
    const word = rawLine.trim().replace(/\s+/g, ' ');
    if (!word) continue;
    entries.push({
      id: generateId('draft'),
      word,
      meaningHint: '',
    });
  }

  return {
    entries,
    empty: entries.length === 0,
  };
}

/**
 * 清理單欄印刷英文照片 OCR 結果：
 * - 移除行首常見題號或項目符號（如 "1.", "12)", "•", "-"）
 * - 略過完全不含英文字母的雜訊行
 * - 保留空格、連字號與單引號（如 ice cream, well-known, o'clock）
 */
export function parseOcrLines(rawOcrText: string): ParsedTextResult {
  const lines = rawOcrText.split(/\r?\n/);
  const entries: DraftEntry[] = [];

  for (const rawLine of lines) {
    const stripped = rawLine
      .trim()
      .replace(/^[\d]+[\s.)\-:]+/, '')
      .replace(/^[•·▪▫*\-–—_]+\s*/, '')
      .replace(/[|[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 必須包含至少一個英文字母
    if (!/[A-Za-z]/.test(stripped)) continue;

    entries.push({
      id: generateId('draft'),
      word: stripped,
      meaningHint: '',
    });
  }

  return {
    entries,
    empty: entries.length === 0,
  };
}

/** 由檔名推導預設課次名稱（仍由家長在畫面修改確認） */
export function suggestSetNameFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').trim();
  return withoutExt.replace(/[_]+/g, ' ');
}

/** 讀取 UTF-8 .txt 檔案 */
export async function readUtf8TextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('無法讀取文字檔'));
    reader.readAsText(file, 'utf-8');
  });
}
