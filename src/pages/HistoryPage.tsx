import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History, Trash2 } from 'lucide-react';
import type { PracticeRecord, QuizMode, WordSet } from '../types/models';
import { loadEnglishVoiceStatus, stopSpeaking } from '../services/speechService';
import { PracticeRecordCard } from '../components/PracticeRecordCard';

interface HistoryPageProps {
  records: PracticeRecord[];
  wordSets: WordSet[];
  initialSetFilter?: string | null;
  onBackHome: () => void;
  onOpenSet: (setId: string) => void;
  onDeleteRecord: (recordId: string) => Promise<void>;
  onClearRecords: (wordSetId?: string) => Promise<void>;
}

export function HistoryPage({
  records,
  wordSets,
  initialSetFilter = null,
  onBackHome,
  onOpenSet,
  onDeleteRecord,
  onClearRecords,
}: HistoryPageProps) {
  const [setFilter, setSetFilter] = useState<string>(initialSetFilter ?? 'all');
  const [modeFilter, setModeFilter] = useState<'all' | QuizMode>('all');
  const [onlyWithWrong, setOnlyWithWrong] = useState(false);
  const [englishVoice, setEnglishVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (initialSetFilter) {
      setSetFilter(initialSetFilter);
    }
  }, [initialSetFilter]);

  useEffect(() => {
    let active = true;
    void loadEnglishVoiceStatus(1200).then((status) => {
      if (active && status.available) setEnglishVoice(status.voice);
    });
    return () => {
      active = false;
      stopSpeaking();
    };
  }, []);

  const existingSetIds = useMemo(() => new Set(wordSets.map((s) => s.id)), [wordSets]);

  // 蒐集所有出現在紀錄中的課次名稱供篩選
  const filterSetOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (!map.has(r.wordSetId)) {
        map.set(r.wordSetId, r.wordSetName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (setFilter !== 'all' && r.wordSetId !== setFilter) return false;
      if (modeFilter !== 'all' && r.mode !== modeFilter) return false;
      if (onlyWithWrong && r.wrongCount === 0) return false;
      return true;
    });
  }, [records, setFilter, modeFilter, onlyWithWrong]);

  const summaryStats = useMemo(() => {
    const sessions = filteredRecords.length;
    const totalQuestions = filteredRecords.reduce((sum, r) => sum + r.totalCount, 0);
    const totalCorrect = filteredRecords.reduce((sum, r) => sum + r.correctCount, 0);
    const avgAccuracy =
      totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    return { sessions, totalQuestions, avgAccuracy };
  }, [filteredRecords]);

  return (
    <div className="stack-lg">
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={onBackHome}>
          <ArrowLeft size={18} />
          <span>回到單字組清單</span>
        </button>

        {records.length > 0 ? (
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            onClick={() => {
              const targetLabel =
                setFilter === 'all'
                  ? '全部複習紀錄'
                  : `「${filterSetOptions.find((o) => o.id === setFilter)?.name ?? '此課次'}」的複習紀錄`;
              if (window.confirm(`確定要清空${targetLabel}嗎？此動作無法復原。`)) {
                void onClearRecords(setFilter === 'all' ? undefined : setFilter);
              }
            }}
          >
            <Trash2 size={15} />
            <span>{setFilter === 'all' ? '清空全部紀錄' : '清空此課次紀錄'}</span>
          </button>
        ) : null}
      </div>

      <section className="card stack-md">
        <div className="row">
          <History size={22} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h1 className="page-title">複習紀錄</h1>
            <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.9rem' }}>
              自動記錄每一次完成複習的時間、模式、耗時，以及答對與答錯的每一題。
            </p>
          </div>
        </div>

        {records.length > 0 ? (
          <>
            <div className="summary-stats-grid" aria-label="累計複習統計">
              <div className="summary-stat-card stat-rate">
                <span className="summary-stat-label">完成練習</span>
                <strong className="summary-stat-value">{summaryStats.sessions} 次</strong>
              </div>
              <div className="summary-stat-card">
                <span className="summary-stat-label">累計題數</span>
                <strong className="summary-stat-value">{summaryStats.totalQuestions} 題</strong>
              </div>
              <div className="summary-stat-card stat-correct">
                <span className="summary-stat-label">平均正確率</span>
                <strong className="summary-stat-value">{summaryStats.avgAccuracy}%</strong>
              </div>
            </div>

            <div className="row-wrap" style={{ gap: '0.6rem' }}>
              <select
                className="input"
                style={{ width: 'auto', minHeight: 40, fontSize: '0.88rem' }}
                aria-label="依課次篩選紀錄"
                value={setFilter}
                onChange={(e) => setSetFilter(e.target.value)}
              >
                <option value="all">全部課次（{records.length} 筆）</option>
                {filterSetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>

              <select
                className="input"
                style={{ width: 'auto', minHeight: 40, fontSize: '0.88rem' }}
                aria-label="依複習模式篩選紀錄"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value as 'all' | QuizMode)}
              >
                <option value="all">全部模式</option>
                <option value="fill-blank">字母填空</option>
                <option value="listen-spell">聽音拼字</option>
                <option value="picture-choice">看圖選字</option>
              </select>

              <label className="row" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyWithWrong}
                  onChange={(e) => setOnlyWithWrong(e.target.checked)}
                />
                <span>只看有答錯的紀錄</span>
              </label>
            </div>
          </>
        ) : null}
      </section>

      {records.length === 0 ? (
        <section className="card stack-md" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <h2 className="section-title">還沒有任何複習紀錄</h2>
          <p className="muted" style={{ margin: 0 }}>
            只要完成任一次「字母填空」、「聽音拼字」或「看圖選字」，系統就會自動把複習時間、答對與答錯的題目記錄在這裡。
          </p>
          <div>
            <button type="button" className="btn btn-primary" onClick={onBackHome}>
              前往選擇單字組開始複習
            </button>
          </div>
        </section>
      ) : filteredRecords.length === 0 ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            沒有符合目前篩選條件的複習紀錄。
          </p>
        </section>
      ) : (
        <section className="stack-md">
          {filteredRecords.map((record) => (
            <PracticeRecordCard
              key={record.id}
              record={record}
              showSetName
              canOpenSet={existingSetIds.has(record.wordSetId)}
              englishVoice={englishVoice}
              onOpenSet={onOpenSet}
              onDelete={onDeleteRecord}
            />
          ))}
        </section>
      )}
    </div>
  );
}
