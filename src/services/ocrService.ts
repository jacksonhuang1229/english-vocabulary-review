import type { DraftEntry } from '../types/models';
import { verifyImageDecodable } from './imageUtils';
import { parseOcrLines } from './textImport';

export interface OcrProgressUpdate {
  status: string;
  progress: number; // 0..1
}

export interface OcrRecognitionResult {
  entries: DraftEntry[];
  rawText: string;
  confidence: number;
  lowConfidenceWarning: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': '正在載入瀏覽器辨識核心…',
  'initializing tesseract': '正在初始化辨識引擎…',
  'loading language traineddata': '正在下載英文辨識模型（首次需數秒）…',
  'initializing api': '正在準備文字辨識…',
  'recognizing text': '正在辨識照片中的英文單字…',
};

/**
 * 使用 Tesseract.js 在瀏覽器 Web Worker 辨識單欄印刷英文照片。
 * 無需上傳照片至伺服器；失敗或無法解碼時會拋出清楚錯誤，由呼叫端保留既有匯入內容。
 */
export async function recognizeEnglishWordsFromImage(
  file: File,
  onProgress?: (update: OcrProgressUpdate) => void,
): Promise<OcrRecognitionResult> {
  onProgress?.({ status: '正在檢查圖片檔案…', progress: 0.05 });

  // 先確認圖片可正常解碼，避免把損毀或非圖片檔送進 OCR
  await verifyImageDecodable(file);

  onProgress?.({ status: '正在啟動瀏覽器 OCR Worker…', progress: 0.1 });

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (msg) => {
      const label = STATUS_LABELS[msg.status] ?? '正在處理照片…';
      const p = typeof msg.progress === 'number' ? msg.progress : 0;
      onProgress?.({
        status: label,
        progress: Math.min(0.98, Math.max(0.1, p)),
      });
    },
  });

  try {
    // 單欄印刷英文優化設定
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-' ",
    });

    const result = await worker.recognize(file);
    const rawText = result.data.text ?? '';
    const confidence = typeof result.data.confidence === 'number' ? result.data.confidence : 0;
    const parsed = parseOcrLines(rawText);

    onProgress?.({ status: '辨識完成', progress: 1 });

    return {
      entries: parsed.entries,
      rawText,
      confidence,
      lowConfidenceWarning: confidence > 0 && confidence < 62,
    };
  } catch (err) {
    const detail = err instanceof Error && err.message ? `（${err.message}）` : '';
    throw new Error(`照片辨識失敗${detail}，請確認網路可載入英文辨識模型，或重拍更清晰的照片。`);
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
