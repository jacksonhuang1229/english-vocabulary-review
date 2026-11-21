import { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Trash2,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { PracticeRecord, QuizMode } from '../types/models';
import { speakEnglishWord } from '../services/speechService';

const MODE_LABELS: Record<QuizMode, string> = {
  'fill-blank': '字母填空',
  'listen-spell': '聽音拼字',
  'picture-choice': '看圖選字',
};

export function formatRecordDateTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(1, Math.round(seconds));
  if (safe < 60) return `${safe} 秒`;
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem > 0 ? `${mins} 分 ${rem} 秒` : `${mins} 分鐘`;
}

interface PracticeRecordCardProps {
  record: PracticeRecord;
  showSetName?: boolean;
  canOpenSet?: boolean;
  englishVoice?: SpeechSynthesisVoice | null;
  onOpenSet?: (setId: string) => void;
  onDelete?: (recordId: string) => Promise<void>;
}

export function PracticeRecordCard({
  record,
  showSetName = true,
  canOpenSet = false,
  englishVoice,
  onOpenSet,
  onDelete,
}: PracticeRecordCardProps) {
  const [expanded, setExpanded] = useState(false);

  const wrongItems = record.results.filter((r) => !r.correct);
  const correctItems = record.results.filter((r) => r.correct);

  return (
    <article
      className="card stack-sm"
      style={{
        padding: 'var(--space-4)',
        borderColor: record.wrongCount === 0 ? 'var(--color-success-border)' : 'var(--color-border)',
      }}
    >
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ gap: '0.35rem' }}>
          <div className="row-wrap">
            {showSetName ? (
              <strong style={{ fontSize: '1.05rem' }}>{record.wordSetName}</strong>
            ) : null}
            <span className="badge badge-primary">{MODE_LABELS[record.mode]}</span>
            {record.isRetryWrongOnly ? (
              <span className="badge badge-warning">錯題重練</span>
            ) : null}
          </div>

          <div className="row-wrap field-hint" style={{ gap: '0.75rem' }}>
            <span className="row" style={{ gap: '0.3rem' }}>
              <Calendar size={13} />
              <span>{formatRecordDateTime(record.completedAt)}</span>
            </span>
            <span className="row" style={{ gap: '0.3rem' }}>
              <Clock size={13} />
              <span>耗時 {formatDuration(record.durationSeconds)}</span>
            </span>
          </div>
        </div>

        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          <span className="badge badge-success">答對 {record.correctCount}</span>
          <span className={`badge ${record.wrongCount > 0 ? 'badge-danger' : 'badge-neutral'}`}>
            答錯 {record.wrongCount}
          </span>
          <span className="badge badge-primary">{record.accuracy}%</span>
        </div>
      </div>

      {/* 未展開時若有錯題，直接預覽答錯的單字 */}
      {!expanded && wrongItems.length > 0 ? (
        <div className="row-wrap" style={{ fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>答錯單字：</span>
          {wrongItems.slice(0, 6).map((item, idx) => (
            <span
              key={`${item.entryId}-${idx}`}
              className="word-chip"
              style={{
                background: 'var(--color-danger-soft)',
                color: 'var(--color-danger)',
              }}
            >
              {item.word}
            </span>
          ))}
          {wrongItems.length > 6 ? (
            <span className="word-chip">+{wrongItems.length - 6}</span>
          ) : null}
        </div>
      ) : null}

      <div
        className="row-between"
        style={{ paddingTop: '0.45rem', borderTop: '1px solid var(--color-border)' }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          <span>
            {expanded ? '收合答題明細' : `查看全部 ${record.totalCount} 題答題明細`}
          </span>
        </button>

        <div className="row" style={{ gap: '0.25rem' }}>
          {canOpenSet && onOpenSet ? (
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => onOpenSet(record.wordSetId)}
            >
              <ExternalLink size={14} />
              <span>前往課次</span>
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ minWidth: 36, minHeight: 36, color: 'var(--color-text-muted)' }}
              aria-label="刪除此筆複習紀錄"
              onClick={() => {
                if (window.confirm('確定要刪除這筆複習紀錄嗎？')) {
                  void onDelete(record.id);
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="stack-md" style={{ paddingTop: '0.5rem' }}>
          {wrongItems.length > 0 ? (
            <div className="card-subtle stack-sm">
              <strong style={{ color: 'var(--color-danger)', fontSize: '0.9rem' }}>
                答錯的題目（{wrongItems.length} 題）
              </strong>
              <div className="stack-sm">
                {wrongItems.map((item, idx) => (
                  <div key={`${item.entryId}-w-${idx}`} className="wrong-review-item">
                    <div className="stack-sm" style={{ gap: '0.2rem' }}>
                      <div className="row-wrap">
                        <XCircle size={15} style={{ color: 'var(--color-danger)' }} />
                        <strong className="en-text">{item.word}</strong>
                        {item.meaningHint ? (
                          <span className="muted" style={{ fontSize: '0.85rem' }}>
                            （{item.meaningHint}）
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>
                        你的作答：<span className="en-text">{item.userAnswer}</span>
                      </div>
                    </div>
                    {englishVoice ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          void speakEnglishWord(item.word, { voice: englishVoice }).catch(
                            () => undefined,
                          )
                        }
                      >
                        <Volume2 size={14} />
                        <span>聽發音</span>
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {correctItems.length > 0 ? (
            <div className="card-subtle stack-sm">
              <strong style={{ color: 'var(--color-success)', fontSize: '0.9rem' }}>
                答對的題目（{correctItems.length} 題）
              </strong>
              <div className="stack-sm">
                {correctItems.map((item, idx) => (
                  <div
                    key={`${item.entryId}-c-${idx}`}
                    className="row-between"
                    style={{
                      padding: '0.45rem 0.7rem',
                      background: '#ffffff',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <span className="row-wrap">
                      <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />
                      <strong className="en-text">{item.word}</strong>
                      {item.meaningHint ? (
                        <span className="muted" style={{ fontSize: '0.82rem' }}>
                          （{item.meaningHint}）
                        </span>
                      ) : null}
                    </span>
                    <span className="en-text" style={{ color: 'var(--color-success)' }}>
                      {item.userAnswer}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
