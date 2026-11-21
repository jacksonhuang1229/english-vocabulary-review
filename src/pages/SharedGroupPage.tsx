import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkPlus,
  FolderOpen,
  Headphones,
  Keyboard,
  Share2,
} from 'lucide-react';
import type { QuizMode, WordGroup, WordSet } from '../types/models';
import { computeSetEligibility } from '../quiz/eligibility';
import {
  cloneSharedGroupForLocalSave,
  decodeShareTokenToWordGroup,
} from '../services/shareService';
import { formatStorageError } from '../db/indexedDb';

interface SharedGroupPageProps {
  token: string;
  onGoHome: () => void;
  onStartDirectPractice: (setIndex: number, mode: QuizMode) => void;
  onSaveGroupToLocal: (group: WordGroup, wordSets: WordSet[]) => Promise<void>;
}

export function SharedGroupPage({
  token,
  onGoHome,
  onStartDirectPractice,
  onSaveGroupToLocal,
}: SharedGroupPageProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const decoded = useMemo(() => {
    try {
      return { data: decodeShareTokenToWordGroup(token), error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : '無法解析此群組分享連結。',
      };
    }
  }, [token]);

  async function handleSaveAll() {
    if (!decoded.data) return;
    setSaveError(null);
    setSaving(true);
    try {
      const { group, wordSets } = cloneSharedGroupForLocalSave(
        decoded.data.groupName,
        decoded.data.wordSets,
      );
      await onSaveGroupToLocal(group, wordSets);
    } catch (err) {
      setSaveError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  if (decoded.error || !decoded.data) {
    return (
      <div className="stack-lg">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={onGoHome}
        >
          <ArrowLeft size={18} />
          <span>回到首頁</span>
        </button>

        <section className="card stack-md">
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>無法開啟分享的單字群組</strong>
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

  const { groupName, wordSets } = decoded.data;
  const totalWords = wordSets.reduce((sum, s) => sum + s.entries.length, 0);

  return (
    <div className="stack-lg">
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={onGoHome}>
          <ArrowLeft size={18} />
          <span>我的單字組清單</span>
        </button>
        <span className="badge badge-primary">
          <Share2 size={12} />
          收到分享的群組
        </span>
      </div>

      <section className="card stack-md">
        <div className="row-between">
          <div>
            <div className="row">
              <FolderOpen size={22} style={{ color: 'var(--color-primary)' }} />
              <h1 className="page-title">{groupName}</h1>
            </div>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              包含 <strong>{wordSets.length} 個課次</strong>，共 <strong>{totalWords} 個單字</strong>。
              您可以一鍵把整個群組存到手機，也可以先點下方任一課次直接開始練習！
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={saving}
            onClick={() => void handleSaveAll()}
          >
            <BookmarkPlus size={18} />
            <span>{saving ? '儲存中…' : '一鍵儲存整個群組到我的裝置'}</span>
          </button>
        </div>

        {saveError ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{saveError}</span>
          </div>
        ) : null}
      </section>

      <section className="stack-md">
        <h2 className="section-title">群組內課次清單（可直接免存檔練習）</h2>

        <div className="set-grid">
          {wordSets.map((set, idx) => {
            const elig = computeSetEligibility(set.entries, {});
            const fillCount = elig['fill-blank'].eligibleEntryIds.length;
            const listenCount = elig['listen-spell'].eligibleEntryIds.length;

            return (
              <article key={set.id} className="set-card">
                <div className="stack-sm">
                  <div className="row-between">
                    <h3 className="set-card-title">{set.name}</h3>
                    <span className="badge badge-primary">{set.entries.length} 詞</span>
                  </div>

                  <div className="set-card-preview">
                    {set.entries.slice(0, 6).map((entry) => (
                      <span key={entry.id} className="word-chip">
                        {entry.word}
                      </span>
                    ))}
                    {set.entries.length > 6 ? (
                      <span className="word-chip">+{set.entries.length - 6}</span>
                    ) : null}
                  </div>
                </div>

                <div
                  className="row-wrap"
                  style={{ paddingTop: '0.6rem', borderTop: '1px solid var(--color-border)' }}
                >
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    disabled={fillCount === 0}
                    onClick={() => onStartDirectPractice(idx, 'fill-blank')}
                  >
                    <Keyboard size={14} />
                    <span>字母填空 ({fillCount})</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={listenCount === 0}
                    onClick={() => onStartDirectPractice(idx, 'listen-spell')}
                  >
                    <Headphones size={14} />
                    <span>聽音拼字 ({listenCount})</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
