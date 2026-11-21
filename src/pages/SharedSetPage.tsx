import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkPlus,
  Headphones,
  Keyboard,
  Play,
  Share2,
} from 'lucide-react';
import type { QuizMode, WordSet } from '../types/models';
import { computeSetEligibility } from '../quiz/eligibility';
import { cloneSharedWordSetForLocalSave, decodeShareTokenToWordSet } from '../services/shareService';
import { formatStorageError } from '../db/indexedDb';

interface SharedSetPageProps {
  token: string;
  onGoHome: () => void;
  onStartDirectPractice: (mode: QuizMode) => void;
  onSaveToLocal: (newSet: WordSet) => Promise<void>;
}

export function SharedSetPage({
  token,
  onGoHome,
  onStartDirectPractice,
  onSaveToLocal,
}: SharedSetPageProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const decoded = useMemo(() => {
    try {
      return { wordSet: decodeShareTokenToWordSet(token), error: null };
    } catch (err) {
      return {
        wordSet: null,
        error: err instanceof Error ? err.message : '無法解析此分享連結。',
      };
    }
  }, [token]);

  const eligibility = useMemo(() => {
    if (!decoded.wordSet) return null;
    return computeSetEligibility(decoded.wordSet.entries, {});
  }, [decoded.wordSet]);

  async function handleSave() {
    if (!decoded.wordSet) return;
    setSaveError(null);
    setSaving(true);
    try {
      const localCopy = cloneSharedWordSetForLocalSave(decoded.wordSet);
      await onSaveToLocal(localCopy);
    } catch (err) {
      setSaveError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  if (decoded.error || !decoded.wordSet || !eligibility) {
    return (
      <div className="stack-lg">
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onGoHome}>
          <ArrowLeft size={18} />
          <span>回到首頁</span>
        </button>

        <section className="card stack-md">
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>無法開啟分享的單字組</strong>
              <div style={{ marginTop: 4 }}>{decoded.error}</div>
            </div>
          </div>
          <div>
            <button type="button" className="btn btn-primary" onClick={onGoHome}>
              前往我的單字組清單
            </button>
          </div>
        </section>
      </div>
    );
  }

  const sharedSet = decoded.wordSet;
  const fillCount = eligibility['fill-blank'].eligibleEntryIds.length;
  const listenCount = eligibility['listen-spell'].eligibleEntryIds.length;
  const totalCount = sharedSet.entries.length;

  return (
    <div className="stack-lg">
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={onGoHome}>
          <ArrowLeft size={18} />
          <span>我的單字組清單</span>
        </button>
        <span className="badge badge-primary">
          <Share2 size={12} />
          收到分享的單字組
        </span>
      </div>

      <section className="card stack-md">
        <div className="row-between">
          <div>
            <h1 className="page-title">{sharedSet.name}</h1>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              共 {totalCount} 個單字。您可以立刻開始練習，或一鍵存到自己的裝置以便日後複習與加配圖。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            <BookmarkPlus size={18} />
            <span>{saving ? '儲存中…' : '儲存到我的裝置'}</span>
          </button>
        </div>

        {saveError ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{saveError}</span>
          </div>
        ) : null}

        <div className="stack-sm">
          <h2 className="section-title">立即直接開始練習（免先存檔）</h2>
          <div className="mode-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <button
              type="button"
              className="mode-card"
              disabled={fillCount === 0}
              onClick={() => onStartDirectPractice('fill-blank')}
            >
              <div className="stack-sm">
                <div className="row-between">
                  <span className="mode-card-icon fill">
                    <Keyboard size={22} />
                  </span>
                  <span className="badge badge-primary">
                    可出題 {fillCount} / {totalCount}
                  </span>
                </div>
                <strong>字母填空</strong>
                <span className="field-hint">直接開始填空複習這份分享課次。</span>
              </div>
              <div className="row" style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.875rem' }}>
                <Play size={15} />
                <span>直接開始練習</span>
              </div>
            </button>

            <button
              type="button"
              className="mode-card"
              disabled={listenCount === 0}
              onClick={() => onStartDirectPractice('listen-spell')}
            >
              <div className="stack-sm">
                <div className="row-between">
                  <span className="mode-card-icon listen">
                    <Headphones size={22} />
                  </span>
                  <span className="badge badge-primary">
                    可出題 {listenCount} / {totalCount}
                  </span>
                </div>
                <strong>聽音拼字</strong>
                <span className="field-hint">自動播放單字發音，直接聽音拼字。</span>
              </div>
              <div className="row" style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '0.875rem' }}>
                <Play size={15} />
                <span>直接開始練習</span>
              </div>
            </button>
          </div>
        </div>
      </section>

      <section className="card stack-md">
        <div className="row-between">
          <h2 className="section-title">單字清單預覽</h2>
          <span className="badge badge-neutral">{totalCount} 個詞條</span>
        </div>

        <div className="entry-list">
          {sharedSet.entries.map((entry, idx) => (
            <div
              key={entry.id}
              className="row-between"
              style={{
                padding: '0.65rem 0.85rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="row-wrap">
                <span className="entry-row-num" style={{ marginTop: 0 }}>
                  {idx + 1}
                </span>
                <strong className="en-text" style={{ fontSize: '1.08rem' }}>
                  {entry.word}
                </strong>
                {entry.meaningHint ? (
                  <span className="muted" style={{ fontSize: '0.9rem' }}>
                    {entry.meaningHint}
                  </span>
                ) : null}
              </div>
              {entry.isAbstract ? <span className="badge badge-neutral">抽象詞</span> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
