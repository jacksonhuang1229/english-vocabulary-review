import { describe, expect, it } from 'vitest';
import {
  buildShareUrl,
  decodeShareTokenToWordSet,
  encodeWordSetToShareToken,
  exportWordSetAsTxt,
  exportWordSetPackageJson,
  parseWordSetPackageJson,
} from '../services/shareService';
import { parseWordListText } from '../services/textImport';
import type { ImageAsset, WordSet } from '../types/models';

describe('單字組分享連結與匯出／匯入', () => {
  const sampleSet: WordSet = {
    id: 'set-orig',
    name: 'Flyer - Unit 4（親子共用）',
    createdAt: 1000,
    updatedAt: 2000,
    entries: [
      { id: 'w1', word: 'ice cream', meaningHint: '冰淇淋', imageId: 'img-1', imageConfirmed: true },
      { id: 'w2', word: 'well-known', meaningHint: '知名的', isAbstract: true },
      { id: 'w3', word: 'go' },
      { id: 'w4', word: 'a' },
    ],
  };

  it('分享連結 token 可正確往返編碼與解碼中文與英文詞條', () => {
    const token = encodeWordSetToShareToken(sampleSet);
    const decoded = decodeShareTokenToWordSet(token);

    expect(decoded.name).toBe('Flyer - Unit 4（親子共用）');
    expect(decoded.entries.map((e) => e.word)).toEqual(['ice cream', 'well-known', 'go', 'a']);
    expect(decoded.entries[0].meaningHint).toBe('冰淇淋');
    expect(decoded.entries[1].isAbstract).toBe(true);

    const { url, tooLong } = buildShareUrl(sampleSet, 'https://example.com/app/');
    expect(url.startsWith('https://example.com/app/#/share/')).toBe(true);
    expect(tooLong).toBe(false);
  });

  it('損毀或不完整的分享連結會拋出清楚錯誤', () => {
    expect(() => decodeShareTokenToWordSet('not-valid-base64!!!')).toThrow();
    expect(() => decodeShareTokenToWordSet('')).toThrow();
  });

  it('完整單字組檔（.vocab.json）匯出與匯入可還原詞條、配圖與確認設定，並重新配發 ID', async () => {
    const sampleBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const asset: ImageAsset = {
      id: 'img-1',
      word: 'ice cream',
      normalizedWord: 'ice cream',
      meaningHint: '冰淇淋',
      normalizedMeaning: '冰淇淋',
      blob: new Blob([sampleBytes], { type: 'image/png' }),
      mimeType: 'image/png',
      source: 'upload',
      confirmed: true,
      confusableWords: ['gelato'],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const json = await exportWordSetPackageJson(sampleSet, { 'img-1': asset });
    const imported = parseWordSetPackageJson(json);

    expect(imported.wordSet.name).toBe(sampleSet.name);
    expect(imported.wordSet.id).not.toBe(sampleSet.id);
    expect(imported.wordSet.entries).toHaveLength(4);
    expect(imported.imageAssets).toHaveLength(1);

    const importedAsset = imported.imageAssets[0];
    expect(importedAsset.id).not.toBe('img-1');
    expect(importedAsset.confirmed).toBe(true);
    expect(importedAsset.confusableWords).toEqual(['gelato']);
    expect(imported.wordSet.entries[0].imageId).toBe(importedAsset.id);
    expect(imported.wordSet.entries[0].imageConfirmed).toBe(true);
    expect(importedAsset.blob.size).toBe(sampleBytes.length);
  });

  it('純文字 .txt 匯出與文字匯入可完整往返', () => {
    const txt = exportWordSetAsTxt(sampleSet);
    const parsed = parseWordListText(txt);
    expect(parsed.entries.map((e) => e.word)).toEqual(['ice cream', 'well-known', 'go', 'a']);
  });
});
