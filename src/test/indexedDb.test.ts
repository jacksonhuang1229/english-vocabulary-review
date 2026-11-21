import { describe, expect, it } from 'vitest';
import { IndexedDbVocabRepository } from '../db/indexedDb';
import type { ImageAsset, WordSet } from '../types/models';

describe('IndexedDbVocabRepository（驗收 1 與 4）', () => {
  it('可獨立儲存兩組課次，關閉重開後仍能分別選取與保留詞條順序', async () => {
    const dbName = `test-db-${Date.now()}-sets`;
    const repo1 = new IndexedDbVocabRepository(dbName);

    const setA: WordSet = {
      id: 'set-u4',
      name: 'Flyer - Unit 4',
      createdAt: 1000,
      updatedAt: 1000,
      entries: [
        { id: 'w1', word: 'ice cream', meaningHint: '冰淇淋' },
        { id: 'w2', word: 'well-known' },
      ],
    };
    const setB: WordSet = {
      id: 'set-u5',
      name: 'Flyer - Unit 5',
      createdAt: 2000,
      updatedAt: 2000,
      entries: [
        { id: 'w3', word: 'rocket' },
        { id: 'w4', word: 'planet' },
      ],
    };

    await repo1.saveWordSet(setA);
    await repo1.saveWordSet(setB);
    repo1.close();

    // 模擬重整或關閉後重開瀏覽器
    const repo2 = new IndexedDbVocabRepository(dbName);
    const sets = await repo2.listWordSets();
    expect(sets).toHaveLength(2);
    expect(sets.map((s) => s.name)).toEqual(['Flyer - Unit 5', 'Flyer - Unit 4']);

    const loadedU4 = await repo2.getWordSet('set-u4');
    expect(loadedU4?.entries.map((e) => e.word)).toEqual(['ice cream', 'well-known']);
    repo2.close();
  });

  it('同詞同詞義配圖可跨組重用且在 ImageAsset 表只保存一份', async () => {
    const dbName = `test-db-${Date.now()}-assets`;
    const repo = new IndexedDbVocabRepository(dbName);

    const sharedAsset: ImageAsset = {
      id: 'img-ice-cream',
      word: 'Ice Cream',
      normalizedWord: 'ice cream',
      meaningHint: '冰淇淋',
      normalizedMeaning: '冰淇淋',
      blob: new Blob(['fake-image-bytes'], { type: 'image/png' }),
      mimeType: 'image/png',
      source: 'upload',
      confirmed: true,
      confusableWords: ['yogurt'],
      createdAt: 1000,
      updatedAt: 1000,
    };

    await repo.saveImageAsset(sharedAsset);

    const reusable = await repo.findReusableAssets('ice cream', '冰淇淋');
    expect(reusable.exactMatches).toHaveLength(1);
    expect(reusable.exactMatches[0].id).toBe('img-ice-cream');

    // 不同詞義但同拼寫會列在 wordMatches
    const diffMeaning = await repo.findReusableAssets('ice cream', '甜點');
    expect(diffMeaning.exactMatches).toHaveLength(0);
    expect(diffMeaning.wordMatches).toHaveLength(1);

    // 兩組皆參照同一個 imageId，資料庫只存 1 份圖片資產
    await repo.saveWordSet({
      id: 's1',
      name: 'Unit 4',
      createdAt: 1,
      updatedAt: 1,
      entries: [{ id: 'e1', word: 'ice cream', imageId: 'img-ice-cream', imageConfirmed: true }],
    });
    await repo.saveWordSet({
      id: 's2',
      name: 'Unit 5',
      createdAt: 2,
      updatedAt: 2,
      entries: [{ id: 'e2', word: 'ice cream', imageId: 'img-ice-cream', imageConfirmed: true }],
    });

    const allAssets = await repo.listImageAssets();
    expect(allAssets).toHaveLength(1);
    repo.close();
  });
});
