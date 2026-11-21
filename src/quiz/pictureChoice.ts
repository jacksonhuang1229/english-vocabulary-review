import type { ImageAsset, WordEntry } from '../types/models';
import { normalizeWordKey } from './normalize';

export interface PictureChoiceOption {
  id: string;
  word: string;
  isCorrect: boolean;
}

export interface PictureChoiceQuestion {
  entryId: string;
  word: string;
  meaningHint?: string;
  imageAsset: ImageAsset;
  options: PictureChoiceOption[];
}

export interface PictureChoiceCheck {
  eligible: boolean;
  reason?: string;
  distractors: WordEntry[];
}

export function shuffleArray<T>(items: T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 判斷單一詞條是否可在「看圖選字」模式出題，並列出可用的候選干擾項。
 * 規則：
 * 1. 必須有家長已確認的圖片（entry.imageConfirmed && asset.confirmed）
 * 2. 干擾項須來自同組且拼寫（正規化後）不重複
 * 3. 若圖片標記了易混淆詞（confusableWords）或干擾項共用同一張圖，該干擾項必須排除
 * 4. 至少需湊齊 1 個有效干擾項（共至少 2 個不同選項）
 */
export function evaluatePictureChoiceEntry(
  target: WordEntry,
  allEntries: WordEntry[],
  assetsById: Record<string, ImageAsset>,
): PictureChoiceCheck {
  if (!target.imageId) {
    return { eligible: false, reason: '尚未設定配圖', distractors: [] };
  }

  const asset = assetsById[target.imageId];
  if (!asset) {
    return { eligible: false, reason: '配圖遺失，請重新上傳或選用', distractors: [] };
  }

  if (!target.imageConfirmed || !asset.confirmed) {
    return {
      eligible: false,
      reason: target.isAbstract
        ? '抽象詞情境圖尚待家長確認'
        : '配圖尚待家長確認（或拼寫已修改）',
      distractors: [],
    };
  }

  const targetKey = normalizeWordKey(target.word);
  const confusableSet = new Set(
    (asset.confusableWords ?? []).map((w) => normalizeWordKey(w)).filter(Boolean),
  );

  // 蒐集同組不重複且非易混淆的候選干擾詞
  const seenKeys = new Set<string>([targetKey]);
  const distractors: WordEntry[] = [];

  for (const candidate of allEntries) {
    if (candidate.id === target.id) continue;
    const key = normalizeWordKey(candidate.word);
    if (!key || seenKeys.has(key)) continue;
    // 同一張圖也不可當作干擾選項
    if (candidate.imageId && candidate.imageId === target.imageId) continue;
    // 排除圖片標記容易混淆的詞
    if (confusableSet.has(key)) continue;

    seenKeys.add(key);
    distractors.push(candidate);
  }

  if (distractors.length < 1) {
    return {
      eligible: false,
      reason: '同組可用的不重複干擾選項不足（至少需 2 個不同選項）',
      distractors: [],
    };
  }

  return {
    eligible: true,
    distractors,
  };
}

/**
 * 產生看圖選字題目：1 個正解 + 最多 3 個干擾項，選項順序隨機。
 */
export function buildPictureChoiceQuestion(
  target: WordEntry,
  allEntries: WordEntry[],
  assetsById: Record<string, ImageAsset>,
  rng: () => number = Math.random,
): PictureChoiceQuestion | null {
  const check = evaluatePictureChoiceEntry(target, allEntries, assetsById);
  if (!check.eligible || !target.imageId) return null;

  const asset = assetsById[target.imageId];
  if (!asset) return null;

  const pickedDistractors = shuffleArray(check.distractors, rng).slice(0, 3);
  const rawOptions: PictureChoiceOption[] = [
    { id: target.id, word: target.word, isCorrect: true },
    ...pickedDistractors.map((d) => ({
      id: d.id,
      word: d.word,
      isCorrect: false,
    })),
  ];

  return {
    entryId: target.id,
    word: target.word,
    meaningHint: target.meaningHint,
    imageAsset: asset,
    options: shuffleArray(rawOptions, rng),
  };
}
