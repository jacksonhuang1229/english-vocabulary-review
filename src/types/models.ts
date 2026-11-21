export type QuizMode = 'fill-blank' | 'listen-spell' | 'picture-choice';

export type ImageSource = 'upload' | 'camera' | 'generated';

export interface WordEntry {
  id: string;
  /** 原始拼寫 */
  word: string;
  /** 可選的詞義提示或情境說明（如區分多義詞或抽象詞情境） */
  meaningHint?: string;
  /** 參照 ImageAsset.id；共用配圖只保存一份 */
  imageId?: string | null;
  /** 家長是否已確認此配圖適用於目前的拼寫與詞義；修改拼寫時會重置為 false */
  imageConfirmed?: boolean;
  /** 是否標記為抽象詞（提醒使用情境圖並由家長確認） */
  isAbstract?: boolean;
}

export interface WordSet {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  entries: WordEntry[];
}

export interface WordGroup {
  id: string;
  /** 群組名稱（例如：Flyer Units） */
  name: string;
  /** 可選群組說明 */
  description?: string;
  /** 群組內有序的單字組 ID 清單 */
  wordSetIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ImageAsset {
  id: string;
  /** 供重用的英文詞 */
  word: string;
  /** 正規化英文詞，供跨組比對重用 */
  normalizedWord: string;
  /** 供重用的詞義或情境提示 */
  meaningHint: string;
  /** 正規化詞義，供同詞同詞義優先推薦 */
  normalizedMeaning: string;
  /** 圖片二進位檔，保存於 IndexedDB */
  blob: Blob;
  mimeType: string;
  source: ImageSource;
  /** 家長是否已確認此圖片含義明確，可用於看圖選字 */
  confirmed: boolean;
  /** 此圖片也容易被理解為哪些英文詞（看圖選字時會將這些詞排除於干擾選項外） */
  confusableWords: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DraftEntry {
  id: string;
  word: string;
  meaningHint: string;
  isAbstract?: boolean;
  /** 若由 .vocab.json 共用檔匯入，暫存對應的配圖 ID 與確認狀態 */
  bundledImageId?: string | null;
  bundledImageConfirmed?: boolean;
  originalBundledWord?: string;
}

export interface ImportDraft {
  name: string;
  entries: DraftEntry[];
  sourceLabel?: string;
}

export interface ModeEligibility {
  mode: QuizMode;
  eligibleEntryIds: string[];
  excludedReasons: Record<string, string>;
}

export interface QuizQuestionResult {
  entryId: string;
  word: string;
  meaningHint?: string;
  userAnswer: string;
  correct: boolean;
}
