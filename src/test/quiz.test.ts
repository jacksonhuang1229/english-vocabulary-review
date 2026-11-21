import { describe, expect, it } from 'vitest';
import {
  buildFillBlankQuestion,
  getFillBlankEligibility,
  gradeFillBlank,
} from '../quiz/fillBlank';
import { gradeListenSpell } from '../quiz/normalize';
import {
  buildPictureChoiceQuestion,
  evaluatePictureChoiceEntry,
} from '../quiz/pictureChoice';
import type { ImageAsset, WordEntry } from '../types/models';

function makeDeterministicRng(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('驗收 3：字母填空與聽音拼字（a, go, ice cream, well-known）', () => {
  it('單一字母詞 "a" 保留給其他模式，不進入字母填空', () => {
    expect(getFillBlankEligibility('a').eligible).toBe(false);
    expect(buildFillBlankQuestion('1', 'a')).toBeNull();
  });

  it('2~3 個字母詞 "go" 只挖 1 格並保留 1 個可見字母', () => {
    const q = buildFillBlankQuestion('2', 'go', undefined, makeDeterministicRng(1));
    expect(q).not.toBeNull();
    expect(q!.blankIndices).toHaveLength(1);
    const visibleLetters = q!.cells.filter((c) => !c.isBlank && /[A-Za-z]/.test(c.char));
    expect(visibleLetters).toHaveLength(1);

    // 不分大小寫判分
    const rightAns: Record<number, string> = {};
    for (const idx of q!.blankIndices) {
      rightAns[idx] = q!.word[idx].toUpperCase();
    }
    expect(gradeFillBlank(q!, rightAns).correct).toBe(true);
  });

  it('空格片語 "ice cream" 空格永遠可見、挖約 1/3、每段至少留 1 個可見字母', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const q = buildFillBlankQuestion('3', 'ice cream', undefined, makeDeterministicRng(seed));
      expect(q).not.toBeNull();
      expect(q!.blankIndices).toHaveLength(3); // round(8/3) = 3

      // 空格索引 3 永遠不可被挖空
      const spaceCell = q!.cells[3];
      expect(spaceCell.char).toBe(' ');
      expect(spaceCell.isBlank).toBe(false);

      // 片段 "ice" (0..2) 至少留 1 字母
      const iceVisible = q!.cells.slice(0, 3).filter((c) => !c.isBlank).length;
      expect(iceVisible).toBeGreaterThanOrEqual(1);

      // 片段 "cream" (4..8) 至少留 1 字母
      const creamVisible = q!.cells.slice(4, 9).filter((c) => !c.isBlank).length;
      expect(creamVisible).toBeGreaterThanOrEqual(1);
    }
  });

  it('連字號詞 "well-known" 連字號永遠可見、挖約 1/3、每段至少留 1 個可見字母', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const q = buildFillBlankQuestion('4', 'well-known', undefined, makeDeterministicRng(seed));
      expect(q).not.toBeNull();
      expect(q!.blankIndices).toHaveLength(3); // round(9/3) = 3

      const hyphenCell = q!.cells[4];
      expect(hyphenCell.char).toBe('-');
      expect(hyphenCell.isBlank).toBe(false);

      const wellVisible = q!.cells.slice(0, 4).filter((c) => !c.isBlank).length;
      expect(wellVisible).toBeGreaterThanOrEqual(1);

      const knownVisible = q!.cells.slice(5, 10).filter((c) => !c.isBlank).length;
      expect(knownVisible).toBeGreaterThanOrEqual(1);
    }
  });

  it('含單字母片段的詞（如 "T-shirt"）不挖單字母片段', () => {
    for (let seed = 1; seed <= 15; seed += 1) {
      const q = buildFillBlankQuestion('5', 'T-shirt', undefined, makeDeterministicRng(seed));
      expect(q).not.toBeNull();
      expect(q!.cells[0].isBlank).toBe(false); // "T" 必須保留可見
      expect(q!.cells[1].isBlank).toBe(false); // "-" 必須保留可見
    }
  });

  it('聽音拼字比對忽略大小寫、首尾空白與多重空白，但保留空格與連字號', () => {
    expect(gradeListenSpell('a', '  A ')).toBe(true);
    expect(gradeListenSpell('go', 'GO')).toBe(true);
    expect(gradeListenSpell('ice cream', '  Ice    Cream  ')).toBe(true);
    expect(gradeListenSpell('ice cream', 'icecream')).toBe(false);
    expect(gradeListenSpell('well-known', 'Well-Known')).toBe(true);
    expect(gradeListenSpell('well-known', 'well known')).toBe(false);
    expect(gradeListenSpell('well-known', 'wellknown')).toBe(false);
  });
});

describe('驗收 4：看圖選字規則', () => {
  const makeAsset = (id: string, word: string, confirmed = true, confusableWords: string[] = []): ImageAsset => ({
    id,
    word,
    normalizedWord: word.toLowerCase(),
    meaningHint: '',
    normalizedMeaning: '',
    blob: new Blob(['img'], { type: 'image/png' }),
    mimeType: 'image/png',
    source: 'upload',
    confirmed,
    confusableWords,
    createdAt: 1,
    updatedAt: 1,
  });

  it('未確認圖片（含抽象詞未確認情境圖）與拼寫變更待重確認時不可出題', () => {
    const assets: Record<string, ImageAsset> = {
      img1: makeAsset('img1', 'well-known', false),
      img2: makeAsset('img2', 'airport', true),
    };
    const entries: WordEntry[] = [
      { id: '1', word: 'well-known', isAbstract: true, imageId: 'img1', imageConfirmed: false },
      { id: '2', word: 'airport', imageId: 'img2', imageConfirmed: false }, // 模擬改拼寫後待重確認
      { id: '3', word: 'rocket' },
    ];

    expect(evaluatePictureChoiceEntry(entries[0], entries, assets).eligible).toBe(false);
    expect(evaluatePictureChoiceEntry(entries[1], entries, assets).eligible).toBe(false);
  });

  it('排除易混淆干擾詞、同拼寫重複詞與共用同圖詞，湊不足 2 選項則不可出題', () => {
    const assets: Record<string, ImageAsset> = {
      imgCup: makeAsset('imgCup', 'cup', true, ['mug']),
    };
    const entries: WordEntry[] = [
      { id: '1', word: 'cup', imageId: 'imgCup', imageConfirmed: true },
      { id: '2', word: 'CUP' }, // 重複拼寫
      { id: '3', word: 'mug' }, // 被標記為易混淆
      { id: '4', word: 'glass', imageId: 'imgCup', imageConfirmed: true }, // 共用同一張圖
    ];

    // 所有干擾項皆被排除，湊不到至少 2 個不同選項
    expect(evaluatePictureChoiceEntry(entries[0], entries, assets).eligible).toBe(false);
  });

  it('有效題目提供 1 正解 + 最多 3 個不重複干擾項', () => {
    const assets: Record<string, ImageAsset> = {
      img1: makeAsset('img1', 'ice cream', true, ['gelato']),
    };
    const entries: WordEntry[] = [
      { id: '1', word: 'ice cream', imageId: 'img1', imageConfirmed: true },
      { id: '2', word: 'gelato' }, // 排除
      { id: '3', word: 'airport' },
      { id: '4', word: 'rocket' },
      { id: '5', word: 'planet' },
      { id: '6', word: 'backpack' },
      { id: '7', word: 'ROCKET' }, // 與 rocket 重複
    ];

    const q = buildPictureChoiceQuestion(entries[0], entries, assets, makeDeterministicRng(7));
    expect(q).not.toBeNull();
    expect(q!.options).toHaveLength(4);
    expect(q!.options.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(q!.options.some((o) => o.word.toLowerCase() === 'gelato')).toBe(false);

    // 確認沒有重複拼寫
    const uniqueWords = new Set(q!.options.map((o) => o.word.toLowerCase()));
    expect(uniqueWords.size).toBe(4);
  });
});
