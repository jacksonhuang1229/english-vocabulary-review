import type { ImageAsset, ModeEligibility, QuizMode, WordEntry } from '../types/models';
import { getFillBlankEligibility } from './fillBlank';
import { evaluatePictureChoiceEntry } from './pictureChoice';

export function computeSetEligibility(
  entries: WordEntry[],
  assetsById: Record<string, ImageAsset>,
): Record<QuizMode, ModeEligibility> {
  const fillEligible: string[] = [];
  const fillExcluded: Record<string, string> = {};

  const listenEligible: string[] = [];
  const listenExcluded: Record<string, string> = {};

  const pictureEligible: string[] = [];
  const pictureExcluded: Record<string, string> = {};

  for (const entry of entries) {
    const trimmed = entry.word.trim();
    if (!trimmed) {
      fillExcluded[entry.id] = '詞條內容為空';
      listenExcluded[entry.id] = '詞條內容為空';
      pictureExcluded[entry.id] = '詞條內容為空';
      continue;
    }

    // 1. 聽音拼字：只要有英文內容即可
    listenEligible.push(entry.id);

    // 2. 字母填空
    const fillCheck = getFillBlankEligibility(trimmed);
    if (fillCheck.eligible) {
      fillEligible.push(entry.id);
    } else {
      fillExcluded[entry.id] = fillCheck.reason ?? '不適用字母填空';
    }

    // 3. 看圖選字
    const picCheck = evaluatePictureChoiceEntry(entry, entries, assetsById);
    if (picCheck.eligible) {
      pictureEligible.push(entry.id);
    } else {
      pictureExcluded[entry.id] = picCheck.reason ?? '不適用看圖選字';
    }
  }

  return {
    'fill-blank': {
      mode: 'fill-blank',
      eligibleEntryIds: fillEligible,
      excludedReasons: fillExcluded,
    },
    'listen-spell': {
      mode: 'listen-spell',
      eligibleEntryIds: listenEligible,
      excludedReasons: listenExcluded,
    },
    'picture-choice': {
      mode: 'picture-choice',
      eligibleEntryIds: pictureEligible,
      excludedReasons: pictureExcluded,
    },
  };
}
