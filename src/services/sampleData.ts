import type { WordSet } from '../types/models';
import { generateId } from '../utils/id';

/**
 * 建立兩組範例課次（Flyer - Unit 4、Flyer - Unit 5），
 * 方便初次使用者立即體驗，也涵蓋單字母詞、短詞、空格片語與連字號詞。
 */
export function createSampleWordSets(): WordSet[] {
  const now = Date.now();

  const unit4: WordSet = {
    id: generateId('set'),
    name: 'Flyer - Unit 4',
    createdAt: now - 2000,
    updatedAt: now - 2000,
    entries: [
      { id: generateId('word'), word: 'ice cream', meaningHint: '冰淇淋' },
      { id: generateId('word'), word: 'well-known', meaningHint: '知名的', isAbstract: true },
      { id: generateId('word'), word: 'airport', meaningHint: '機場' },
      { id: generateId('word'), word: 'backpack', meaningHint: '後背包' },
      { id: generateId('word'), word: 'go', meaningHint: '去、前往' },
      { id: generateId('word'), word: 'a', meaningHint: '一個（冠詞）' },
    ],
  };

  const unit5: WordSet = {
    id: generateId('set'),
    name: 'Flyer - Unit 5',
    createdAt: now - 1000,
    updatedAt: now - 1000,
    entries: [
      { id: generateId('word'), word: 'astronaut', meaningHint: '太空人' },
      { id: generateId('word'), word: 'ice cream', meaningHint: '冰淇淋' },
      { id: generateId('word'), word: 'rocket', meaningHint: '火箭' },
      { id: generateId('word'), word: 'planet', meaningHint: '行星' },
      { id: generateId('word'), word: 'check-in', meaningHint: '辦理登機／報到' },
    ],
  };

  return [unit4, unit5];
}
