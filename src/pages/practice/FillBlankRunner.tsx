import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Volume2, XCircle } from 'lucide-react';
import type { FillBlankQuestion } from '../../quiz/fillBlank';
import { gradeFillBlank } from '../../quiz/fillBlank';
import { speakEnglishWord, stopSpeaking } from '../../services/speechService';

interface FillBlankRunnerProps {
  question: FillBlankQuestion;
  questionIndex: number;
  totalQuestions: number;
  englishVoice?: SpeechSynthesisVoice | null;
  onAnswered: (result: { userAnswer: string; correct: boolean }) => void;
  onNext: () => void;
}

export function FillBlankRunner({
  question,
  questionIndex,
  totalQuestions,
  englishVoice,
  onAnswered,
  onNext,
}: FillBlankRunnerProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<{
    correct: boolean;
    filledWord: string;
    perBlankCorrect: Record<number, boolean>;
  } | null>(null);

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // 換題時重設輸入並自動聚焦第一格（桌面與觸控皆方便）
  useEffect(() => {
    setAnswers({});
    setSubmitted(null);
    stopSpeaking();
    const firstBlank = question.blankIndices[0];
    if (typeof firstBlank === 'number') {
      const timer = window.setTimeout(() => {
        inputRefs.current[firstBlank]?.focus();
      }, 40);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [question]);

  // 提交後按 Enter 快速進下一題
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

  // 依空格拆分成視覺片段，確保手機自動換行時不會從單字中間斷開
  const visualGroups = useMemo(() => {
    const groups: Array<{ type: 'word'; cells: FillBlankQuestion['cells'] } | { type: 'space'; key: number }> = [];
    let buffer: FillBlankQuestion['cells'] = [];

    for (const cell of question.cells) {
      if (cell.char === ' ') {
        if (buffer.length > 0) {
          groups.push({ type: 'word', cells: buffer });
          buffer = [];
        }
        groups.push({ type: 'space', key: cell.index });
      } else {
        buffer.push(cell);
      }
    }
    if (buffer.length > 0) {
      groups.push({ type: 'word', cells: buffer });
    }
    return groups;
  }, [question.cells]);

  function focusBlankPosition(posInBlankList: number) {
    const targetCharIndex = question.blankIndices[posInBlankList];
    if (typeof targetCharIndex === 'number') {
      inputRefs.current[targetCharIndex]?.focus();
    }
  }

  function handleChangeBlank(blankPos: number, charIndex: number, rawValue: string) {
    if (submitted) return;
    // 只取英文字母（支援手機輸入法或連續打字）
    const lettersOnly = rawValue.replace(/[^A-Za-z]/g, '');
    if (!lettersOnly) {
      setAnswers((prev) => ({ ...prev, [charIndex]: '' }));
      return;
    }

    // 若一次貼上或連續輸入多個字母，依序填入後續空格
    const nextAnswers = { ...answers };
    let cursor = blankPos;
    for (const ch of lettersOnly) {
      if (cursor >= question.blankIndices.length) break;
      nextAnswers[question.blankIndices[cursor]] = ch;
      cursor += 1;
    }
    setAnswers(nextAnswers);

    if (cursor < question.blankIndices.length) {
      focusBlankPosition(cursor);
    }
  }

  function handleKeyDownBlank(
    e: React.KeyboardEvent<HTMLInputElement>,
    blankPos: number,
    charIndex: number,
  ) {
    if (submitted) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const currentVal = answers[charIndex] ?? '';
      if (currentVal) {
        setAnswers((prev) => ({ ...prev, [charIndex]: '' }));
      } else if (blankPos > 0) {
        const prevCharIndex = question.blankIndices[blankPos - 1];
        setAnswers((prev) => ({ ...prev, [prevCharIndex]: '' }));
        focusBlankPosition(blankPos - 1);
      }
      return;
    }

    if (e.key === 'ArrowLeft' && blankPos > 0) {
      e.preventDefault();
      focusBlankPosition(blankPos - 1);
      return;
    }

    if (e.key === 'ArrowRight' && blankPos < question.blankIndices.length - 1) {
      e.preventDefault();
      focusBlankPosition(blankPos + 1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (submitted) return;
    const graded = gradeFillBlank(question, answers);
    setSubmitted(graded);
    onAnswered({
      userAnswer: graded.filledWord,
      correct: graded.correct,
    });
  }

  const allFilled = question.blankIndices.every((idx) => (answers[idx] ?? '').trim().length === 1);

  return (
    <div className="stack-md">
      <div style={{ textAlign: 'center' }} className="stack-sm">
        <span className="badge badge-primary" style={{ marginInline: 'auto' }}>
          字母填空 · 共挖空 {question.blankIndices.length} 格
        </span>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          請填入缺少的英文字母（空格與連字號已保留，不區分大小寫）
        </p>
        {question.meaningHint ? (
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text)' }}>
            提示：{question.meaningHint}
          </div>
        ) : null}
      </div>

      <div className="blank-word-wrap" role="group" aria-label="單字填空區">
        {visualGroups.map((group, gIdx) => {
          if (group.type === 'space') {
            return <span key={`space-${group.key}`} className="blank-space-gap" aria-label="空格" />;
          }
          return (
            <span key={`word-${gIdx}`} className="blank-segment">
              {group.cells.map((cell) => {
                if (!cell.isBlank) {
                  return (
                    <span
                      key={cell.index}
                      className={`blank-static-char ${cell.char === '-' ? 'hyphen' : ''}`}
                    >
                      {cell.char}
                    </span>
                  );
                }

                const blankPos = question.blankIndices.indexOf(cell.index);
                const val = answers[cell.index] ?? '';
                const stateClass = submitted
                  ? submitted.perBlankCorrect[cell.index]
                    ? 'is-correct'
                    : 'is-wrong'
                  : '';

                return (
                  <input
                    key={cell.index}
                    ref={(el) => {
                      inputRefs.current[cell.index] = el;
                    }}
                    type="text"
                    inputMode="text"
                    enterKeyHint={blankPos === question.blankIndices.length - 1 ? 'done' : 'next'}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`第 ${blankPos + 1} 個空白字母`}
                    className={`blank-input-box ${stateClass}`}
                    value={val}
                    disabled={Boolean(submitted)}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => handleChangeBlank(blankPos, cell.index, e.target.value)}
                    onKeyDown={(e) => handleKeyDownBlank(e, blankPos, cell.index)}
                  />
                );
              })}
            </span>
          );
        })}
      </div>

      {!submitted ? (
        <div className="row-wrap" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            style={{ minWidth: 200 }}
            onClick={handleSubmit}
          >
            <span>{allFilled ? '送出答案' : '送出目前作答'}</span>
          </button>
        </div>
      ) : (
        <div className="stack-md">
          <div className={`feedback-banner ${submitted.correct ? 'correct' : 'wrong'}`} role="status">
            <div className="row">
              {submitted.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <strong>{submitted.correct ? '答對了！拼寫完全正確' : '再接再厲！請看看正確拼寫'}</strong>
            </div>
            <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                正確單字：
                <strong className="en-text" style={{ fontSize: '1.25rem', marginLeft: 4 }}>
                  {question.word}
                </strong>
                {!submitted.correct ? (
                  <span style={{ marginLeft: 12, fontSize: '0.9rem' }}>
                    （你的作答：<span className="en-text">{submitted.filledWord}</span>）
                  </span>
                ) : null}
              </div>

              {englishVoice ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void speakEnglishWord(question.word, { voice: englishVoice }).catch(() => undefined)}
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
      )}
    </div>
  );
}
