import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  History,
  ImagePlus,
  RotateCcw,
  Trophy,
  Volume2,
  XCircle,
} from 'lucide-react';
import type {
  ImageAsset,
  PracticeRecord,
  QuizMode,
  QuizQuestionResult,
  WordEntry,
  WordSet,
} from '../types/models';
import { buildFillBlankQuestion, type FillBlankQuestion } from '../quiz/fillBlank';
import {
  buildPictureChoiceQuestion,
  shuffleArray,
  type PictureChoiceQuestion,
} from '../quiz/pictureChoice';
import { loadEnglishVoiceStatus, speakEnglishWord, stopSpeaking } from '../services/speechService';
import { generateId } from '../utils/id';
import { FillBlankRunner } from './practice/FillBlankRunner';
import { ListenSpellRunner } from './practice/ListenSpellRunner';
import { PictureChoiceRunner } from './practice/PictureChoiceRunner';

interface PracticePageProps {
  wordSet: WordSet;
  mode: QuizMode;
  assetsById: Record<string, ImageAsset>;
  onBackToSet: () => void;
  onBackToHome: () => void;
  onRecordCompleted?: (record: PracticeRecord) => Promise<void>;
  onViewHistory?: () => void;
}

type BuiltItem =
  | { kind: 'fill-blank'; question: FillBlankQuestion }
  | { kind: 'listen-spell'; entry: WordEntry }
  | { kind: 'picture-choice'; question: PictureChoiceQuestion };

const MODE_LABELS: Record<QuizMode, string> = {
  'fill-blank': '字母填空',
  'listen-spell': '聽音拼字',
  'picture-choice': '看圖選字',
};

function buildDeck(
  wordSet: WordSet,
  mode: QuizMode,
  assetsById: Record<string, ImageAsset>,
  onlyEntryIds?: Set<string>,
): BuiltItem[] {
  const sourceEntries = onlyEntryIds
    ? wordSet.entries.filter((e) => onlyEntryIds.has(e.id))
    : wordSet.entries;

  const shuffled = shuffleArray(sourceEntries);
  const items: BuiltItem[] = [];

  for (const entry of shuffled) {
    if (!entry.word.trim()) continue;
    if (mode === 'fill-blank') {
      const q = buildFillBlankQuestion(entry.id, entry.word, entry.meaningHint);
      if (q) items.push({ kind: 'fill-blank', question: q });
    } else if (mode === 'listen-spell') {
      items.push({ kind: 'listen-spell', entry });
    } else {
      const q = buildPictureChoiceQuestion(entry, wordSet.entries, assetsById);
      if (q) items.push({ kind: 'picture-choice', question: q });
    }
  }

  return items;
}

export function PracticePage({
  wordSet,
  mode,
  assetsById,
  onBackToSet,
  onBackToHome,
  onRecordCompleted,
  onViewHistory,
}: PracticePageProps) {
  const [roundSeed, setRoundSeed] = useState(0);
  const [roundStartedAt, setRoundStartedAt] = useState<number>(() => Date.now());
  const [retryEntryIds, setRetryEntryIds] = useState<Set<string> | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuizQuestionResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [recordSaved, setRecordSaved] = useState(false);
  const [englishVoice, setEnglishVoice] = useState<SpeechSynthesisVoice | null>(null);

  // 為填空與看圖選字預載可選的發音語音（答題後可聽讀音）
  useEffect(() => {
    let active = true;
    void loadEnglishVoiceStatus(1200).then((status) => {
      if (active && status.available) {
        setEnglishVoice(status.voice);
      }
    });
    return () => {
      active = false;
      stopSpeaking();
    };
  }, []);

  const deck = useMemo(
    () => buildDeck(wordSet, mode, assetsById, retryEntryIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wordSet, mode, assetsById, retryEntryIds, roundSeed],
  );

  function restartRound(onlyWrongIds?: Set<string>) {
    stopSpeaking();
    setRetryEntryIds(onlyWrongIds);
    setCurrentIndex(0);
    setResults([]);
    setFinished(false);
    setRecordSaved(false);
    setRoundStartedAt(Date.now());
    setRoundSeed((n) => n + 1);
  }

  function handleAnswered(entry: { id: string; word: string; meaningHint?: string }, res: { userAnswer: string; correct: boolean }) {
    setResults((prev) => [
      ...prev,
      {
        entryId: entry.id,
        word: entry.word,
        meaningHint: entry.meaningHint,
        userAnswer: res.userAnswer,
        correct: res.correct,
      },
    ]);
  }

  function handleNext() {
    stopSpeaking();
    if (currentIndex + 1 < deck.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      setFinished(true);
      if (onRecordCompleted && results.length > 0) {
        const completedAt = Date.now();
        const totalCount = results.length;
        const correctCount = results.filter((r) => r.correct).length;
        const wrongCount = totalCount - correctCount;
        const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
        const durationSeconds = Math.max(1, Math.round((completedAt - roundStartedAt) / 1000));

        const record: PracticeRecord = {
          id: generateId('rec'),
          wordSetId: wordSet.id,
          wordSetName: wordSet.name,
          mode,
          isRetryWrongOnly: Boolean(retryEntryIds),
          startedAt: roundStartedAt,
          completedAt,
          durationSeconds,
          totalCount,
          correctCount,
          wrongCount,
          accuracy,
          results: [...results],
        };
        void onRecordCompleted(record)
          .then(() => setRecordSaved(true))
          .catch(() => undefined);
      }
    }
  }

  // 空題庫引導（特別是看圖選字缺圖、未確認或選項不足）
  if (deck.length === 0) {
    return (
      <div className="stack-lg">
        <div className="row-between">
          <button type="button" className="btn btn-ghost" onClick={onBackToSet}>
            <ArrowLeft size={18} />
            <span>回到「{wordSet.name}」</span>
          </button>
        </div>

        <section className="practice-card stack-md" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="mode-card-icon picture" style={{ width: 56, height: 56 }}>
              <ImagePlus size={28} />
            </div>
          </div>

          <h1 className="page-title">
            「{MODE_LABELS[mode]}」目前沒有可出題的單字
          </h1>

          {mode === 'picture-choice' ? (
            <div className="card-subtle stack-sm" style={{ textAlign: 'left', maxWidth: 520, marginInline: 'auto' }}>
              <strong>如何啟用本組的看圖選字？</strong>
              <ol style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.92rem' }}>
                <li>回到「{wordSet.name}」詳情頁，點擊任一單字左側的「加配圖」按鈕。</li>
                <li>上傳圖片、拍照，或直接重用其他課次已確認的同詞配圖。</li>
                <li>勾選「家長已確認此圖片含義清楚」，並確認同組內至少有 2 個拼寫不重複且不混淆的單字作為選項。</li>
              </ol>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              本單字組目前沒有符合「{MODE_LABELS[mode]}」出題條件的詞條（例如單一字母詞會保留給聽音拼字）。
            </p>
          )}

          <div className="row-wrap" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onBackToSet}>
              <span>{mode === 'picture-choice' ? '前往單字組補圖與確認' : '回到單字組'}</span>
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={onBackToHome}>
              <span>返回選組清單</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  // 本輪結算頁
  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    const wrongResults = results.filter((r) => !r.correct);
    const wrongCount = wrongResults.length;
    const total = results.length;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    return (
      <div className="stack-lg">
        <section className="practice-card stack-md" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              className="mode-card-icon"
              style={{
                width: 64,
                height: 64,
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              <Trophy size={32} />
            </div>
          </div>

          <div className="stack-sm">
            <span className="badge badge-primary" style={{ marginInline: 'auto' }}>
              {wordSet.name} · {MODE_LABELS[mode]}
            </span>
            <h1 className="page-title">本輪複習完成！（共 {total} 題）</h1>
          </div>

          {/* 清楚呈現：答對幾題 / 答錯幾題 / 正確率 */}
          <div className="summary-stats-grid" aria-label="本輪答題統計">
            <div className="summary-stat-card stat-correct">
              <span className="summary-stat-label">答對</span>
              <strong className="summary-stat-value">{correctCount} 題</strong>
            </div>
            <div className={`summary-stat-card ${wrongCount > 0 ? 'stat-wrong' : 'stat-neutral'}`}>
              <span className="summary-stat-label">答錯</span>
              <strong className="summary-stat-value">{wrongCount} 題</strong>
            </div>
            <div className="summary-stat-card stat-rate">
              <span className="summary-stat-label">正確率</span>
              <strong className="summary-stat-value">{accuracy}%</strong>
            </div>
          </div>

          {wrongCount > 0 ? (
            <div className="card-subtle stack-sm" style={{ textAlign: 'left' }}>
              <div className="row-between">
                <strong>答錯的題目（共 {wrongCount} 題）</strong>
                <span className="field-hint">可對照正確拼寫並點擊聽發音</span>
              </div>
              <div className="stack-sm">
                {wrongResults.map((item, idx) => (
                  <div key={`${item.entryId}-${idx}`} className="wrong-review-item">
                    <div className="stack-sm" style={{ gap: '0.25rem' }}>
                      <div className="row-wrap">
                        <span className="badge badge-success">正確答案</span>
                        <strong className="en-text" style={{ fontSize: '1.15rem' }}>
                          {item.word}
                        </strong>
                        {item.meaningHint ? (
                          <span className="muted" style={{ fontSize: '0.88rem' }}>
                            （{item.meaningHint}）
                          </span>
                        ) : null}
                      </div>
                      <div className="row-wrap" style={{ fontSize: '0.9rem' }}>
                        <span className="badge badge-danger">你的作答</span>
                        <span className="en-text" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                          {item.userAnswer}
                        </span>
                      </div>
                    </div>

                    {englishVoice ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-label={`聽 ${item.word} 的發音`}
                        onClick={() =>
                          void speakEnglishWord(item.word, { voice: englishVoice }).catch(
                            () => undefined,
                          )
                        }
                      >
                        <Volume2 size={15} />
                        <span>聽發音</span>
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="alert alert-success" style={{ justifyContent: 'center' }}>
              <CheckCircle2 size={20} />
              <strong>太棒了！本輪全部答對，沒有答錯任何題目！</strong>
            </div>
          )}

          <div className="row-wrap" style={{ justifyContent: 'center' }}>
            {wrongCount > 0 ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() =>
                  restartRound(new Set(wrongResults.map((item) => item.entryId)))
                }
              >
                <RotateCcw size={18} />
                <span>只重練錯題（{wrongCount} 題）</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`btn ${wrongCount > 0 ? 'btn-secondary' : 'btn-primary'} btn-lg`}
              onClick={() => restartRound(undefined)}
            >
              <RotateCcw size={18} />
              <span>整輪重練</span>
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={onBackToSet}>
              <span>回到單字組</span>
            </button>
            {onViewHistory ? (
              <button type="button" className="btn btn-soft btn-lg" onClick={onViewHistory}>
                <History size={18} />
                <span>查看複習紀錄</span>
              </button>
            ) : null}
          </div>

          {recordSaved ? (
            <div className="field-hint" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
              ✓ 已自動記錄本次複習時間與答題明細至「複習紀錄」
            </div>
          ) : null}

          {/* 完整答題明細 */}
          <details style={{ textAlign: 'left', marginTop: '0.5rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              展開全部 {results.length} 題作答紀錄（答對 {correctCount}、答錯 {wrongCount}）
            </summary>
            <div className="stack-sm" style={{ marginTop: '0.75rem' }}>
              {results.map((r, i) => (
                <div key={`${r.entryId}-${i}`} className="row-between" style={{ fontSize: '0.9rem' }}>
                  <span className="row">
                    {r.correct ? (
                      <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                    ) : (
                      <XCircle size={16} style={{ color: 'var(--color-danger)' }} />
                    )}
                    <strong className="en-text">{r.word}</strong>
                  </span>
                  <span
                    className="en-text"
                    style={{
                      color: r.correct ? 'var(--color-success)' : 'var(--color-danger)',
                    }}
                  >
                    {r.userAnswer}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </section>
      </div>
    );
  }

  const currentItem = deck[currentIndex];
  const progressPercent = Math.round(((currentIndex + 1) / deck.length) * 100);
  const runningCorrect = results.filter((r) => r.correct).length;
  const runningWrong = results.length - runningCorrect;

  return (
    <div className="stack-md">
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={onBackToSet}>
          <ArrowLeft size={18} />
          <span>離開複習</span>
        </button>
        <span className="badge badge-neutral">
          {wordSet.name} · {MODE_LABELS[mode]}
        </span>
      </div>

      <div>
        <div className="practice-progress-head">
          <span>
            第 <strong>{currentIndex + 1}</strong> / {deck.length} 題
          </span>
          <span>
            答對 <strong style={{ color: 'var(--color-success)' }}>{runningCorrect}</strong> · 答錯{' '}
            <strong style={{ color: runningWrong > 0 ? 'var(--color-danger)' : 'inherit' }}>
              {runningWrong}
            </strong>
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <section className="practice-card">
        {currentItem.kind === 'fill-blank' ? (
          <FillBlankRunner
            question={currentItem.question}
            questionIndex={currentIndex}
            totalQuestions={deck.length}
            englishVoice={englishVoice}
            onAnswered={(res) =>
              handleAnswered(
                {
                  id: currentItem.question.entryId,
                  word: currentItem.question.word,
                  meaningHint: currentItem.question.meaningHint,
                },
                res,
              )
            }
            onNext={handleNext}
          />
        ) : currentItem.kind === 'listen-spell' ? (
          <ListenSpellRunner
            entry={currentItem.entry}
            questionIndex={currentIndex}
            totalQuestions={deck.length}
            onAnswered={(res) => handleAnswered(currentItem.entry, res)}
            onNext={handleNext}
            onReturnToSet={onBackToSet}
          />
        ) : (
          <PictureChoiceRunner
            question={currentItem.question}
            questionIndex={currentIndex}
            totalQuestions={deck.length}
            englishVoice={englishVoice}
            onAnswered={(res) =>
              handleAnswered(
                {
                  id: currentItem.question.entryId,
                  word: currentItem.question.word,
                  meaningHint: currentItem.question.meaningHint,
                },
                res,
              )
            }
            onNext={handleNext}
          />
        )}
      </section>
    </div>
  );
}
