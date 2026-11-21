import { isEnglishLetter } from './normalize';

export interface FillBlankCharCell {
  index: number;
  char: string;
  isBlank: boolean;
  isSeparator: boolean;
}

export interface FillBlankQuestion {
  entryId: string;
  word: string;
  meaningHint?: string;
  cells: FillBlankCharCell[];
  blankIndices: number[];
}

interface LetterSegment {
  letterIndices: number[];
}

/**
 * 將單字依空格或連字號拆成片段，收集每段中的英文字母索引。
 */
export function extractLetterSegments(word: string): LetterSegment[] {
  const segments: LetterSegment[] = [];
  let current: number[] = [];

  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    if (ch === ' ' || ch === '-') {
      if (current.length > 0) {
        segments.push({ letterIndices: current });
        current = [];
      }
    } else if (isEnglishLetter(ch)) {
      current.push(i);
    }
  }

  if (current.length > 0) {
    segments.push({ letterIndices: current });
  }

  return segments;
}

/**
 * 計算此詞在保留每段至少一個可見英文字母的前提下，最多能挖幾格。
 */
export function getFillBlankEligibility(word: string): {
  eligible: boolean;
  reason?: string;
  totalLetters: number;
  maxBlanks: number;
  targetBlanks: number;
} {
  const segments = extractLetterSegments(word);
  const totalLetters = segments.reduce((sum, seg) => sum + seg.letterIndices.length, 0);

  if (totalLetters <= 1) {
    return {
      eligible: false,
      reason: '單一字母詞保留給其他模式',
      totalLetters,
      maxBlanks: 0,
      targetBlanks: 0,
    };
  }

  // 凡由空格或連字號隔出的片段，至少保留一個可見字母
  const maxBlanks = segments.reduce(
    (sum, seg) => sum + Math.max(0, seg.letterIndices.length - 1),
    0,
  );

  if (maxBlanks < 1) {
    return {
      eligible: false,
      reason: '每個片段皆只有單一字母，無可挖空格位',
      totalLetters,
      maxBlanks: 0,
      targetBlanks: 0,
    };
  }

  // 2~3 個字母挖 1 格；較長的詞挖約三分之一
  const rawTarget = totalLetters <= 3 ? 1 : Math.max(1, Math.round(totalLetters / 3));
  const targetBlanks = Math.min(rawTarget, maxBlanks);

  return {
    eligible: true,
    totalLetters,
    maxBlanks,
    targetBlanks,
  };
}

/**
 * 產生字母填空題：
 * - 空格與連字號永遠可見，只挖英文字母
 * - 單一字母詞回傳 null
 * - 2-3 個字母挖 1 格
 * - 較長的詞挖約 1/3 格
 * - 每個由空格或連字號隔出的片段至少保留 1 個可見字母
 */
export function buildFillBlankQuestion(
  entryId: string,
  word: string,
  meaningHint?: string,
  rng: () => number = Math.random,
): FillBlankQuestion | null {
  const info = getFillBlankEligibility(word);
  if (!info.eligible) return null;

  const segments = extractLetterSegments(word);
  // 每個片段可挖的剩餘配額（至少留 1 個可見字母）
  const segmentStates = segments.map((seg) => ({
    available: [...seg.letterIndices],
    remainingQuota: Math.max(0, seg.letterIndices.length - 1),
  }));

  const chosen = new Set<number>();

  while (chosen.size < info.targetBlanks) {
    const eligibleSegs = segmentStates.filter((s) => s.remainingQuota > 0 && s.available.length > 0);
    if (eligibleSegs.length === 0) break;

    // 優先從還沒被挖過（或相對剩餘配額較多）的片段隨機挑選，讓填空分布更均勻
    const segIdx = Math.floor(rng() * eligibleSegs.length);
    const seg = eligibleSegs[segIdx];
    const pickPos = Math.floor(rng() * seg.available.length);
    const charIndex = seg.available.splice(pickPos, 1)[0];
    seg.remainingQuota -= 1;
    chosen.add(charIndex);
  }

  const blankIndices = Array.from(chosen).sort((a, b) => a - b);
  const cells: FillBlankCharCell[] = [];
  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    cells.push({
      index: i,
      char: ch,
      isBlank: chosen.has(i),
      isSeparator: ch === ' ' || ch === '-',
    });
  }

  return {
    entryId,
    word,
    meaningHint,
    cells,
    blankIndices,
  };
}

/**
 * 字母填空判分（忽略大小寫）。
 */
export function gradeFillBlank(
  question: FillBlankQuestion,
  answersByIndex: Record<number, string>,
): { correct: boolean; filledWord: string; perBlankCorrect: Record<number, boolean> } {
  const perBlankCorrect: Record<number, boolean> = {};
  let allCorrect = true;

  const chars = question.cells.map((cell) => {
    if (!cell.isBlank) return cell.char;
    const raw = (answersByIndex[cell.index] ?? '').trim();
    const isOk = raw.length === 1 && raw.toLowerCase() === cell.char.toLowerCase();
    perBlankCorrect[cell.index] = isOk;
    if (!isOk) allCorrect = false;
    return raw || '_';
  });

  return {
    correct: allCorrect,
    filledWord: chars.join(''),
    perBlankCorrect,
  };
}
