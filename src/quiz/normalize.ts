/**
 * 拼寫比對正規化：
 * - 忽略大小寫
 * - 忽略首尾空白
 * - 將多個內部空白視為一個單一空白
 * - 保留原詞中的空格與連字號
 */
export function normalizeSpellText(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 供跨組重用配圖與去重比對使用的詞鍵 */
export function normalizeWordKey(word: string): string {
  return normalizeSpellText(word);
}

/** 供同詞同詞義重用比對使用的詞義鍵 */
export function normalizeMeaningKey(meaning?: string | null): string {
  return (meaning ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isEnglishLetter(ch: string): boolean {
  return /^[A-Za-z]$/.test(ch);
}

export function countEnglishLetters(word: string): number {
  let count = 0;
  for (const ch of word) {
    if (isEnglishLetter(ch)) count += 1;
  }
  return count;
}

/**
 * 聽音拼字判分：
 * 忽略大小寫、首尾空白與多餘內部空白，但保留空格與連字號位置。
 */
export function gradeListenSpell(expectedWord: string, userInput: string): boolean {
  return normalizeSpellText(expectedWord) === normalizeSpellText(userInput);
}
