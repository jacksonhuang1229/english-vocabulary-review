import { describe, expect, it } from 'vitest';
import {
  buildGroupShareMessage,
  buildGroupShareUrl,
  buildIsGdShortenLink,
  buildShareMessage,
  buildShareUrl,
  buildTinyUrlShortenLink,
  decodeShareTokenToWordGroup,
  decodeShareTokenToWordSet,
  encodeWordGroupToShareToken,
  encodeWordSetToShareToken,
  exportWordGroupPackageJson,
  exportWordSetAsTxt,
  exportWordSetPackageJson,
  normalizeCustomShortUrl,
  parseAnyVocabPackageJson,
  parseWordSetPackageJson,
} from '../services/shareService';
import { parseWordListText } from '../services/textImport';
import type { ImageAsset, WordGroup, WordSet } from '../types/models';

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

  it('壓縮短連結 token 可正確往返編碼與解碼，並明顯短於舊版 JSON 編碼', () => {
    const token = encodeWordSetToShareToken(sampleSet);
    const decoded = decodeShareTokenToWordSet(token);

    expect(decoded.name).toBe('Flyer - Unit 4（親子共用）');
    expect(decoded.entries.map((e) => e.word)).toEqual(['ice cream', 'well-known', 'go', 'a']);
    expect(decoded.entries[0].meaningHint).toBe('冰淇淋');
    expect(decoded.entries[1].isAbstract).toBe(true);

    const { url, tooLong } = buildShareUrl(sampleSet, 'https://example.com/app/');
    expect(url.startsWith('https://example.com/app/#/s/')).toBe(true);
    expect(tooLong).toBe(false);

    // 驗證壓縮後的短碼比未壓縮 JSON 明顯更短
    const legacyJsonLen = btoa(
      unescape(
        encodeURIComponent(
          JSON.stringify({
            v: 1,
            n: sampleSet.name,
            e: sampleSet.entries.map((e) => ({ w: e.word, m: e.meaningHint })),
          }),
        ),
      ),
    ).length;
    expect(token.length).toBeLessThan(legacyJsonLen);

    // 驗證分享訊息包含標題、單字摘要與短連結
    const msg = buildShareMessage(sampleSet, url);
    expect(msg.title).toContain('Flyer - Unit 4');
    expect(msg.summary).toContain('ice cream');
    expect(msg.fullText).toContain(url);
  });

  it('相容解碼舊版 JSON Base64URL 分享連結', () => {
    const legacyBytes = new TextEncoder().encode(
      JSON.stringify({ v: 1, n: 'Legacy Unit', e: [{ w: 'apple', m: '蘋果' }] }),
    );
    let binary = '';
    for (const b of legacyBytes) binary += String.fromCharCode(b);
    const legacyToken = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const decoded = decodeShareTokenToWordSet(legacyToken);
    expect(decoded.name).toBe('Legacy Unit');
    expect(decoded.entries[0].word).toBe('apple');
    expect(decoded.entries[0].meaningHint).toBe('蘋果');
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

  it('群組壓縮短連結可一次編碼與還原多個課次，並產生含標題與摘要的分享訊息', () => {
    const unit1: WordSet = {
      id: 'u1',
      name: 'Flyer Unit 1',
      createdAt: 1,
      updatedAt: 1,
      entries: [
        { id: 'a1', word: 'airport', meaningHint: '機場' },
        { id: 'a2', word: 'ice cream', meaningHint: '冰淇淋' },
      ],
    };
    const unit2: WordSet = {
      id: 'u2',
      name: 'Flyer Unit 2',
      createdAt: 2,
      updatedAt: 2,
      entries: [
        { id: 'b1', word: 'well-known', meaningHint: '知名的', isAbstract: true },
        { id: 'b2', word: 'rocket' },
      ],
    };

    const token = encodeWordGroupToShareToken('Flyer Units', [unit1, unit2]);
    const decoded = decodeShareTokenToWordGroup(token);
    expect(decoded.groupName).toBe('Flyer Units');
    expect(decoded.wordSets).toHaveLength(2);
    expect(decoded.wordSets[0].name).toBe('Flyer Unit 1');
    expect(decoded.wordSets[0].entries.map((e) => e.word)).toEqual(['airport', 'ice cream']);
    expect(decoded.wordSets[1].entries[0].isAbstract).toBe(true);

    const { url } = buildGroupShareUrl('Flyer Units', [unit1, unit2], 'https://example.com/');
    expect(url.startsWith('https://example.com/#/g/')).toBe(true);
    const msg = buildGroupShareMessage('Flyer Units', [unit1, unit2], url);
    expect(msg.title).toContain('Flyer Units');
    expect(msg.summary).toContain('Flyer Unit 1');
    expect(msg.summary).toContain('Flyer Unit 2');
    expect(msg.fullText).toContain(url);
  });

  it('群組完整共用檔（.vocab-group.json）可打包多課次且共用配圖只存一份，並能自動辨識還原', async () => {
    const sharedBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const sharedAsset: ImageAsset = {
      id: 'img-shared',
      word: 'ice cream',
      normalizedWord: 'ice cream',
      meaningHint: '冰淇淋',
      normalizedMeaning: '冰淇淋',
      blob: new Blob([sharedBytes], { type: 'image/png' }),
      mimeType: 'image/png',
      source: 'upload',
      confirmed: true,
      confusableWords: [],
      createdAt: 1,
      updatedAt: 1,
    };

    const u1: WordSet = {
      id: 'u1',
      name: 'Flyer Unit 1',
      createdAt: 1,
      updatedAt: 1,
      entries: [{ id: 'e1', word: 'ice cream', imageId: 'img-shared', imageConfirmed: true }],
    };
    const u2: WordSet = {
      id: 'u2',
      name: 'Flyer Unit 2',
      createdAt: 2,
      updatedAt: 2,
      entries: [{ id: 'e2', word: 'ice cream', imageId: 'img-shared', imageConfirmed: true }],
    };
    const group: WordGroup = {
      id: 'grp-1',
      name: 'Flyer Units',
      wordSetIds: ['u1', 'u2'],
      createdAt: 10,
      updatedAt: 10,
    };

    const json = await exportWordGroupPackageJson(group, [u1, u2], { 'img-shared': sharedAsset });
    const parsed = parseAnyVocabPackageJson(json);

    expect(parsed.kind).toBe('group');
    if (parsed.kind !== 'group') return;

    expect(parsed.group.name).toBe('Flyer Units');
    expect(parsed.wordSets).toHaveLength(2);
    expect(parsed.group.wordSetIds).toEqual(parsed.wordSets.map((s) => s.id));
    // 兩個課次共用同一張圖，只編碼與還原一份 ImageAsset
    expect(parsed.imageAssets).toHaveLength(1);
    expect(parsed.wordSets[0].entries[0].imageId).toBe(parsed.imageAssets[0].id);
    expect(parsed.wordSets[1].entries[0].imageId).toBe(parsed.imageAssets[0].id);
  });

  it('縮網址輔助連結與貼回自訂短網址驗證正確', () => {
    const longUrl = 'https://example.com/#/g/gz.abc123';
    expect(buildTinyUrlShortenLink(longUrl)).toBe(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
    );
    expect(buildIsGdShortenLink(longUrl)).toBe(
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
    );
    expect(normalizeCustomShortUrl('  https://tinyurl.com/23n4zkup  ')).toBe(
      'https://tinyurl.com/23n4zkup',
    );
    expect(normalizeCustomShortUrl('not-a-url')).toBeNull();
    expect(normalizeCustomShortUrl('javascript:alert(1)')).toBeNull();
  });
});
