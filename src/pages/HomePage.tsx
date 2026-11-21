import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ImageAsset, WordSet } from '../types/models';
import { getBrowserStorageEstimate } from '../db/indexedDb';
import { ShareSetModal } from '../components/ShareSetModal';

interface HomePageProps {
  wordSets: WordSet[];
  assetsById: Record<string, ImageAsset>;
  loading: boolean;
  onSelectSet: (setId: string) => void;
  onStartImport: () => void;
  onLoadSamples: () => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
}

function formatDateTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HomePage({
  wordSets,
  assetsById,
  loading,
  onSelectSet,
  onStartImport,
  onLoadSamples,
  onDeleteSet,
}: HomePageProps) {
  const [search, setSearch] = useState('');
  const [loadingSample, setLoadingSample] = useState(false);
  const [sharingSet, setSharingSet] = useState<WordSet | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usageBytes: number; quotaBytes: number } | null>(
    null,
  );

  useEffect(() => {
    void getBrowserStorageEstimate().then(setStorageInfo);
  }, [wordSets.length]);

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wordSets;
    return wordSets.filter((set) => {
      if (set.name.toLowerCase().includes(q)) return true;
      return set.entries.some(
        (e) =>
          e.word.toLowerCase().includes(q) ||
          (e.meaningHint ?? '').toLowerCase().includes(q),
      );
    });
  }, [wordSets, search]);

  async function handleSampleClick() {
    setLoadingSample(true);
    try {
      await onLoadSamples();
    } finally {
      setLoadingSample(false);
    }
  }

  return (
    <div className="stack-lg">
      <section className="hero-card">
        <h1>選擇課次，開始英文單字複習</h1>
        <p>
          家長可上傳文字檔或手機拍照匯入單字表並編輯配圖；孩子可直接點選課次進行「字母填空」、「聽音拼字」與「看圖選字」。
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-hero-primary" onClick={onStartImport}>
            <Plus size={18} />
            <span>匯入或建立單字組</span>
          </button>
          {wordSets.length === 0 ? (
            <button
              type="button"
              className="btn btn-hero-ghost"
              disabled={loadingSample}
              onClick={handleSampleClick}
            >
              <Sparkles size={17} />
              <span>{loadingSample ? '建立中…' : '載入範例課次（Flyer Unit 4 & 5）'}</span>
            </button>
          ) : null}
        </div>
      </section>

      {loading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            正在讀取本機儲存的單字組…
          </p>
        </div>
      ) : wordSets.length === 0 ? (
        <section className="card stack-md" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="mode-card-icon fill" style={{ width: 58, height: 58 }}>
              <FolderPlus size={28} />
            </div>
          </div>
          <div className="stack-sm">
            <h2 className="section-title">還沒有儲存任何單字組</h2>
            <p className="muted" style={{ margin: 0, maxWidth: 460, marginInline: 'auto' }}>
              點擊「匯入或建立單字組」，即可上傳 UTF-8 文字檔（.txt）、手機拍照辨識單欄英文單字表，或手動輸入課次單字。
            </p>
          </div>
          <div className="row-wrap" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onStartImport}>
              <Plus size={18} />
              <span>建立第一個單字組</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              disabled={loadingSample}
              onClick={handleSampleClick}
            >
              <Sparkles size={17} />
              <span>先載入範例體驗</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="stack-md">
          <div className="row-between">
            <div className="row">
              <h2 className="section-title">已儲存的單字組</h2>
              <span className="badge badge-primary">{wordSets.length} 組</span>
            </div>

            {wordSets.length >= 3 ? (
              <div style={{ position: 'relative', minWidth: 220, flex: '0 1 280px' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  className="input"
                  style={{ paddingLeft: 36, minHeight: 40 }}
                  type="search"
                  placeholder="搜尋課次或單字…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {filteredSets.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                找不到符合「{search}」的課次或單字。
              </p>
            </div>
          ) : (
            <div className="set-grid">
              {filteredSets.map((set) => {
                const confirmedImgCount = set.entries.filter((entry) => {
                  if (!entry.imageId || !entry.imageConfirmed) return false;
                  const asset = assetsById[entry.imageId];
                  return Boolean(asset?.confirmed);
                }).length;

                return (
                  <article key={set.id} className="set-card">
                    <div className="stack-sm">
                      <div className="row-between" style={{ alignItems: 'flex-start' }}>
                        <h3 className="set-card-title">{set.name}</h3>
                        <div className="row" style={{ gap: '0.15rem' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            style={{ minWidth: 36, minHeight: 36, color: 'var(--color-primary)' }}
                            aria-label={`分享 ${set.name}`}
                            disabled={set.entries.length === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSharingSet(set);
                            }}
                          >
                            <Share2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            style={{ minWidth: 36, minHeight: 36, color: 'var(--color-text-muted)' }}
                            aria-label={`刪除 ${set.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`確定要刪除單字組「${set.name}」嗎？此動作無法復原。`)) {
                                void onDeleteSet(set.id);
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="row-wrap">
                        <span className="badge badge-primary">
                          <BookOpen size={12} />
                          {set.entries.length} 個單字
                        </span>
                        <span className="badge badge-success">
                          <ImageIcon size={12} />
                          已確認配圖 {confirmedImgCount}
                        </span>
                      </div>

                      <div className="set-card-preview">
                        {set.entries.slice(0, 5).map((entry) => (
                          <span key={entry.id} className="word-chip">
                            {entry.word}
                          </span>
                        ))}
                        {set.entries.length > 5 ? (
                          <span className="word-chip">+{set.entries.length - 5}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="row-between" style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
                      <span className="field-hint">更新於 {formatDateTime(set.updatedAt)}</span>
                      <button
                        type="button"
                        className="btn btn-soft btn-sm"
                        onClick={() => onSelectSet(set.id)}
                      >
                        <span>進入課次與複習</span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {storageInfo ? (
            <div className="card-subtle row-between" style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              <span className="row">
                <HardDrive size={15} />
                <span>
                  本機瀏覽器已使用約 {formatBytes(storageInfo.usageBytes)}（IndexedDB 離線保存）
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={loadingSample}
                onClick={handleSampleClick}
              >
                <Sparkles size={14} />
                <span>新增範例課次</span>
              </button>
            </div>
          ) : null}
        </section>
      )}

      {sharingSet ? (
        <ShareSetModal
          wordSet={sharingSet}
          assetsById={assetsById}
          onClose={() => setSharingSet(null)}
        />
      ) : null}
    </div>
  );
}
