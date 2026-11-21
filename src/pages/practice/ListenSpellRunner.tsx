import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { WordEntry } from '../../types/models';
import { gradeListenSpell } from '../../quiz/normalize';
import {
  getEnglishVoiceStatusSync,
  loadEnglishVoiceStatus,
  speakEnglishWord,
  stopSpeaking,
  type EnglishVoiceStatus,
} from '../../services/speechService';

interface ListenSpellRunnerProps {
  entry: WordEntry;
  questionIndex: number;
  totalQuestions: number;
  onAnswered: (result: { userAnswer: string; correct: boolean }) => void;
  onNext: () => void;
  onReturnToSet: () => void;
}

export function ListenSpellRunner({
  entry,
  questionIndex,
  totalQuestions,
  onAnswered,
  onNext,
  onReturnToSet,
}: ListenSpellRunnerProps) {
  const [initialSyncStatus] = useState<EnglishVoiceStatus | null>(() => getEnglishVoiceStatusSync());
  const [voiceLoading, setVoiceLoading] = useState(!initialSyncStatus);
  const [voiceStatus, setVoiceStatus] = useState<EnglishVoiceStatus | null>(initialSyncStatus);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(
    initialSyncStatus?.voice?.voiceURI ?? '',
  );

  const [inputValue, setInputValue] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [autoPlayHint, setAutoPlayHint] = useState(false);
  const [submitted, setSubmitted] = useState<{ correct: boolean; userAnswer: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialSyncStatus) return undefined;
    let active = true;
    void loadEnglishVoiceStatus().then((status) => {
      if (!active) return;
      setVoiceStatus(status);
      setSelectedVoiceUri(status.voice?.voiceURI ?? '');
      setVoiceLoading(false);
    });
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [initialSyncStatus]);

  const activeVoice =
    voiceStatus?.allEnglishVoices.find((v) => v.voiceURI === selectedVoiceUri) ??
    voiceStatus?.voice ??
    null;

  const activeVoiceRef = useRef<SpeechSynthesisVoice | null>(activeVoice);
  activeVoiceRef.current = activeVoice;

  // 換題時重設輸入、聚焦輸入框
  useEffect(() => {
    setInputValue('');
    setSubmitted(null);
    setPlayError(null);
    setAutoPlayHint(false);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [entry.id, questionIndex]);

  // 每題出現時自動播放一次目前單字的發音（語音載入完成後立即播放）
  useEffect(() => {
    if (voiceLoading || !voiceStatus?.available) return undefined;
    let cancelled = false;
    setAutoPlayHint(false);
    setPlayError(null);
    setSpeaking(true);

    void speakEnglishWord(entry.word, { voice: activeVoiceRef.current, rate: 0.92 })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('not-allowed')) {
          setAutoPlayHint(true);
        } else {
          setPlayError(msg || '語音播放失敗，請點擊重試。');
        }
      })
      .finally(() => {
        if (!cancelled) setSpeaking(false);
      });

    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [voiceLoading, voiceStatus?.available, entry.id, entry.word, questionIndex]);

  // 提交後按 Enter 進下一題
  useEffect(() => {
    if (!submitted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submitted, onNext]);

  async function handlePlay(rate = 0.92) {
    setPlayError(null);
    setAutoPlayHint(false);
    setSpeaking(true);
    try {
      await speakEnglishWord(entry.word, { voice: activeVoice, rate });
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : '語音播放失敗，請點擊重試。');
    } finally {
      setSpeaking(false);
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitted) return;
    const correct = gradeListenSpell(entry.word, inputValue);
    setSubmitted({ correct, userAnswer: inputValue });
    onAnswered({ userAnswer: inputValue.trim() || '（未作答）', correct });
  }

  if (voiceLoading) {
    return (
      <div className="listen-stage">
        <Loader2 size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
        <p className="muted" style={{ margin: 0 }}>
          正在載入裝置英文語音清單…
        </p>
      </div>
    );
  }

  if (!voiceStatus || !voiceStatus.available) {
    return (
      <div className="stack-md" style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
        <div className="alert alert-warning" style={{ textAlign: 'left' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>無法使用聽音拼字模式</strong>
            <div style={{ marginTop: 4 }}>
              {voiceStatus?.reason ??
                '此裝置或瀏覽器目前沒有可用的英文語音，請返回改用字母填空或看圖選字。'}
            </div>
          </div>
        </div>
        <div>
          <button type="button" className="btn btn-primary btn-lg" onClick={onReturnToSet}>
            <ArrowLeft size={18} />
            <span>返回單字組選擇其他模式</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-md">
      <div className="row-between">
        <span className="badge badge-primary">
          {activeVoice?.localService ? '裝置本機英文語音' : '系統英文語音'} · {activeVoice?.lang}
        </span>

        {voiceStatus.allEnglishVoices.length > 1 ? (
          <select
            className="input"
            aria-label="選擇英文發音語音"
            style={{ width: 'auto', minHeight: 36, fontSize: '0.82rem', paddingBlock: 4 }}
            value={selectedVoiceUri}
            onChange={(e) => setSelectedVoiceUri(e.target.value)}
          >
            {voiceStatus.allEnglishVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.localService ? ' ★本機' : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="listen-stage">
        <button
          type="button"
          className="speak-big-btn"
          onClick={() => void handlePlay(0.92)}
          aria-label="播放英文單字發音"
        >
          <Volume2 size={36} />
          <span>{speaking ? '播放中…' : '再聽一次'}</span>
        </button>

        <span className="field-hint">
          {autoPlayHint
            ? '瀏覽器限制自動播放，請點一下上方按鈕收聽發音'
            : '每題會自動播放一次發音，也可隨時點「重播」或「慢速播放」'}
        </span>

        <div className="row-wrap" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void handlePlay(0.92)}
          >
            <RotateCcw size={14} />
            <span>重播</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void handlePlay(0.68)}
          >
            <Volume2 size={14} />
            <span>慢速播放</span>
          </button>
        </div>

        {entry.meaningHint ? (
          <div className="badge badge-neutral">詞義提示：{entry.meaningHint}</div>
        ) : null}

        {playError ? (
          <div className="alert alert-danger" role="alert" style={{ width: '100%', maxWidth: 460 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="row-between" style={{ flex: 1 }}>
              <span>{playError}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handlePlay(0.92)}
              >
                重試播放
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <form className="stack-md" onSubmit={handleSubmit} style={{ alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          className="input spell-input-large"
          placeholder="聽音輸入完整英文單字或片語"
          aria-label="輸入聽到的英文拼寫"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={Boolean(submitted)}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />

        <span className="field-hint">
          忽略大小寫與多餘空白，但請保留原詞中的空格與連字號（如 ice cream、well-known）。
        </span>

        {!submitted ? (
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ minWidth: 220 }}
            disabled={!inputValue.trim()}
          >
            送出答案
          </button>
        ) : null}
      </form>

      {submitted ? (
        <div className="stack-md">
          <div className={`feedback-banner ${submitted.correct ? 'correct' : 'wrong'}`} role="status">
            <div className="row">
              {submitted.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <strong>{submitted.correct ? '答對了！' : '拼寫不太一樣，再看一次正解'}</strong>
            </div>
            <div>
              正確拼寫：
              <strong className="en-text" style={{ fontSize: '1.25rem', marginLeft: 4 }}>
                {entry.word}
              </strong>
              {!submitted.correct ? (
                <div style={{ marginTop: 4, fontSize: '0.9rem' }}>
                  你的輸入：<span className="en-text">{submitted.userAnswer || '（空白）'}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              style={{ minWidth: 220 }}
              onClick={onNext}
            >
              <span>{questionIndex + 1 < totalQuestions ? '下一題' : '查看本輪結果'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
