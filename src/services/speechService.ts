export interface EnglishVoiceStatus {
  supported: boolean;
  available: boolean;
  voice: SpeechSynthesisVoice | null;
  allEnglishVoices: SpeechSynthesisVoice[];
  isLocal: boolean;
  reason?: string;
}

function isEnglishLang(lang: string): boolean {
  const lower = lang.trim().toLowerCase();
  return lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_');
}

function scoreEnglishVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const lang = voice.lang.toLowerCase().replace('_', '-');
  // 優先挑選裝置本機英文語音
  if (voice.localService) score += 100;
  if (lang === 'en-us') score += 30;
  else if (lang === 'en-gb') score += 25;
  else if (lang.startsWith('en-')) score += 15;
  if (voice.default) score += 5;
  return score;
}

export function pickBestEnglishVoice(
  voices: SpeechSynthesisVoice[],
): { best: SpeechSynthesisVoice | null; allEnglish: SpeechSynthesisVoice[] } {
  const allEnglish = voices.filter((v) => isEnglishLang(v.lang));
  if (allEnglish.length === 0) {
    return { best: null, allEnglish: [] };
  }
  const sorted = [...allEnglish].sort((a, b) => scoreEnglishVoice(b) - scoreEnglishVoice(a));
  return { best: sorted[0], allEnglish: sorted };
}

/**
 * 等候瀏覽器 speechSynthesis 語音清單載入後，檢查是否有可用的英文語音。
 */
export async function loadEnglishVoiceStatus(timeoutMs = 2000): Promise<EnglishVoiceStatus> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) {
    return {
      supported: false,
      available: false,
      voice: null,
      allEnglishVoices: [],
      isLocal: false,
      reason: '目前的瀏覽器不支援語音朗讀（SpeechSynthesis），請改用字母填空或看圖選字。',
    };
  }

  const synth = window.speechSynthesis;

  const inspect = (): EnglishVoiceStatus => {
    const voices = synth.getVoices();
    const { best, allEnglish } = pickBestEnglishVoice(voices);
    if (!best) {
      return {
        supported: true,
        available: false,
        voice: null,
        allEnglishVoices: [],
        isLocal: false,
        reason:
          '裝置上找不到可用的英文語音包。請檢查系統文字轉語音設定，或先返回改用字母填空／看圖選字。',
      };
    }
    return {
      supported: true,
      available: true,
      voice: best,
      allEnglishVoices: allEnglish,
      isLocal: Boolean(best.localService),
    };
  };

  // 若語音已同步載入完成直接回傳
  if (synth.getVoices().length > 0) {
    return inspect();
  }

  // 等候 voiceschanged 或逾時後再檢查一次
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.('voiceschanged', onVoicesChanged);
      window.clearTimeout(timer);
      resolve();
    };

    const onVoicesChanged = () => {
      if (synth.getVoices().length > 0) {
        finish();
      }
    };

    synth.addEventListener?.('voiceschanged', onVoicesChanged);
    const timer = window.setTimeout(finish, timeoutMs);
  });

  return inspect();
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function speakEnglishWord(
  text: string,
  options?: { voice?: SpeechSynthesisVoice | null; rate?: number },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      reject(new Error('此瀏覽器不支援語音朗讀'));
      return;
    }

    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      if (synth.paused) {
        synth.resume();
      }
    } catch {
      // 忽略部分瀏覽器 cancel 例外
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (options?.voice) {
      utterance.voice = options.voice;
      utterance.lang = options.voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = options?.rate ?? 0.92;
    utterance.pitch = 1;

    utterance.onend = () => resolve();
    utterance.onerror = (ev) => {
      if (ev.error === 'interrupted' || ev.error === 'canceled') {
        resolve();
        return;
      }
      reject(new Error(`語音播放失敗（${ev.error || '未知錯誤'}），請點擊重試。`));
    };

    synth.speak(utterance);
  });
}
