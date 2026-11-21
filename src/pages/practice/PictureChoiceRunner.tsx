import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Volume2, XCircle } from 'lucide-react';
import type { PictureChoiceOption, PictureChoiceQuestion } from '../../quiz/pictureChoice';
import { useImageUrl } from '../../hooks/useImageUrl';
import { speakEnglishWord, stopSpeaking } from '../../services/speechService';

interface PictureChoiceRunnerProps {
  question: PictureChoiceQuestion;
  questionIndex: number;
  totalQuestions: number;
  englishVoice?: SpeechSynthesisVoice | null;
  onAnswered: (result: { userAnswer: string; correct: boolean }) => void;
  onNext: () => void;
}

export function PictureChoiceRunner({
  question,
  questionIndex,
  totalQuestions,
  englishVoice,
  onAnswered,
  onNext,
}: PictureChoiceRunnerProps) {
  const imageUrl = useImageUrl(question.imageAsset.blob);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
    stopSpeaking();
  }, [question]);

  const selectedOption = question.options.find((opt) => opt.id === selectedId) ?? null;

  function handleSelect(option: PictureChoiceOption) {
    if (selectedId) return;
    setSelectedId(option.id);
    onAnswered({
      userAnswer: option.word,
      correct: option.isCorrect,
    });
  }

  // 桌面鍵盤快捷操作：1~4 選答，答完按 Enter 進下一題
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) {
        const num = Number(e.key);
        if (num >= 1 && num <= question.options.length) {
          e.preventDefault();
          handleSelect(question.options[num - 1]);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, question, onNext]);

  return (
    <div className="stack-md">
      <div style={{ textAlign: 'center' }} className="stack-sm">
        <span className="badge badge-success" style={{ marginInline: 'auto' }}>
          看圖選字 · 請選出最符合圖片的英文單字
        </span>
      </div>

      <div className="picture-stage">
        <div className="picture-frame">
          {imageUrl ? (
            <img src={imageUrl} alt="單字題目配圖" />
          ) : (
            <span className="muted">圖片載入中…</span>
          )}
        </div>

        <div className="choice-grid" role="group" aria-label="選項清單">
          {question.options.map((opt, idx) => {
            let stateClass = '';
            if (selectedId) {
              if (opt.isCorrect) stateClass = 'is-correct';
              else if (opt.id === selectedId) stateClass = 'is-wrong';
            }

            return (
              <button
                key={opt.id}
                type="button"
                className={`choice-btn ${stateClass}`}
                disabled={Boolean(selectedId)}
                onClick={() => handleSelect(opt)}
              >
                <span className="choice-key-hint" aria-hidden="true">
                  {idx + 1}
                </span>
                <span>{opt.word}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedOption ? (
        <div className="stack-md">
          <div
            className={`feedback-banner ${selectedOption.isCorrect ? 'correct' : 'wrong'}`}
            role="status"
          >
            <div className="row">
              {selectedOption.isCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <strong>{selectedOption.isCorrect ? '答對了！' : '選錯囉，一起記住正確答案'}</strong>
            </div>
            <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                正確答案：
                <strong className="en-text" style={{ fontSize: '1.25rem', marginLeft: 4 }}>
                  {question.word}
                </strong>
                {question.meaningHint ? (
                  <span style={{ marginLeft: 8 }}>（{question.meaningHint}）</span>
                ) : null}
              </div>
              {englishVoice ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    void speakEnglishWord(question.word, { voice: englishVoice }).catch(
                      () => undefined,
                    )
                  }
                >
                  <Volume2 size={15} />
                  <span>聽發音</span>
                </button>
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
