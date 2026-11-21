import { describe, expect, it } from 'vitest';
import {
  parseOcrLines,
  parseWordListText,
  suggestSetNameFromFilename,
} from '../services/textImport';

describe('文字與 OCR 匯入解析', () => {
  it('解析 UTF-8 BOM 文字檔、略過空行並保留空格與連字號', () => {
    const raw = '\uFEFF  ice   cream \r\n\r\nwell-known\ngo\na\n   \n';
    const parsed = parseWordListText(raw);
    expect(parsed.empty).toBe(false);
    expect(parsed.entries.map((e) => e.word)).toEqual(['ice cream', 'well-known', 'go', 'a']);
  });

  it('空檔或只有空白時回報 empty: true', () => {
    expect(parseWordListText('   \r\n\t\n').empty).toBe(true);
  });

  it('清理單欄 OCR 行號、項目符號與非英文雜訊', () => {
    const ocrRaw = '1. airport\n2) ice cream\n- well-known\n### 12345\n• backpack\n';
    const parsed = parseOcrLines(ocrRaw);
    expect(parsed.entries.map((e) => e.word)).toEqual([
      'airport',
      'ice cream',
      'well-known',
      'backpack',
    ]);
  });

  it('由檔名建議課次名稱', () => {
    expect(suggestSetNameFromFilename('Flyer_-_Unit_4.txt')).toBe('Flyer - Unit 4');
  });
});
