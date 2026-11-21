import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Edit3,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ImageAsset, WordGroup, WordSet } from '../types/models';
import { getBrowserStorageEstimate } from '../db/indexedDb';
import { ShareSetModal } from '../components/ShareSetModal';
import { GroupEditModal } from '../components/GroupEditModal';
import { ShareGroupModal } from '../components/ShareGroupModal';

interface HomePageProps {
  wordSets: WordSet[];
  wordGroups: WordGroup[];
  assetsById: Record<string, ImageAsset>;
  loading: boolean;
  initialGroupFilterId?: string | null;
  onSelectSet: (setId: string) => void;
  onStartImport: () => void;
  onLoadSamples: () => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
  onSaveGroup: (group: WordGroup) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
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
  wordGroups,
  assetsById,
  loading,
  initialGroupFilterId = null,
  onSelectSet,
  onStartImport,
  onLoadSamples,
  onDeleteSet,
  onSaveGroup,
  onDeleteGroup,
}: HomePageProps) {
  const [search, setSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>(
    initialGroupFilterId ?? 'all',
  );
  const [loadingSample, setLoadingSample] = useState(false);

  const [sharingSet, setSharingSet] = useState<WordSet | null>(null);
  const [editingGroupModal, setEditingGroupModal] = useState<{
    open: boolean;
    group: WordGroup | null;
  }>({ open: false, group: null });
  const [sharingGroup, setSharingGroup] = useState<WordGroup | null>(null);

  const [storageInfo, setStorageInfo] = useState<{ usageBytes: number; quotaBytes: number } | null>(
    null,
  );

  useEffect(() => {
    if (initialGroupFilterId) {
      setSelectedGroupFilter(initialGroupFilterId);
    }
  }, [initialGroupFilterId]);

  useEffect(() => {
    void getBrowserStorageEstimate().then(setStorageInfo);
  }, [wordSets.length, wordGroups.length]);

  // 若目前選取的群組被刪除，切回全部
  useEffect(() => {
    if (
      selectedGroupFilter !== 'all' &&
      selectedGroupFilter !== 'ungrouped' &&
      !wordGroups.some((g) => g.id === selectedGroupFilter)
    ) {
      setSelectedGroupFilter('all');
    }
  }, [selectedGroupFilter, wordGroups]);

  const setsById = useMemo(() => {
    const map: Record<string, WordSet> = {};
    for (const set of wordSets) map[set.id] = set;
    return map;
  }, [wordSets]);

  const groupedSetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of wordGroups) {
      for (const sid of g.wordSetIds) ids.add(sid);
    }
    return ids;
  }, [wordGroups]);

  const activeGroup = useMemo(
    () => wordGroups.find((g) => g.id === selectedGroupFilter) ?? null,
    [wordGroups, selectedGroupFilter],
  );

  const getGroupSets = (group: WordGroup): WordSet[] =>
    group.wordSetIds.map((id) => setsById[id]).filter((s): s is WordSet => Boolean(s));

  const filteredSets = useMemo(() => {
    let base: WordSet[];
    if (activeGroup) {
      base = getGroupSets(activeGroup);
    } else if (selectedGroupFilter === 'ungrouped') {
      base = wordSets.filter((s) => !groupedSetIds.has(s.id));
    } else {
      base = wordSets;
    }

    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((set) => {
      if (set.name.toLowerCase().includes(q)) return true;
      return set.entries.some(
        (e) =>
          e.word.toLowerCase().includes(q) ||
          (e.meaningHint ?? '').toLowerCase().includes(q),
      );
    });
  }, [activeGroup, selectedGroupFilter, wordSets, groupedSetIds, search, setsById]);

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
          家長可上傳文字檔或手機拍照匯入單字表、建立群組整理多個課次並一次分享；孩子可直接點選課次進行「字母填空」、「聽音拼字」與「看圖選字」。
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-hero-primary" onClick={onStartImport}>
            <Plus size={18} />
            <span>匯入或建立單字組</span>
          </button>
          {wordSets.length > 0 ? (
            <button
              type="button"
              className="btn btn-hero-ghost"
              onClick={() => setEditingGroupModal({ open: true, group: null })}
            >
              <FolderPlus size={17} />
              <span>建立群組（合併多個課次）</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-hero-ghost"
              disabled={loadingSample}
              onClick={handleSampleClick}
            >
              <Sparkles size={17} />
              <span>{loadingSample ? '建立中…' : '載入範例課次（Flyer Unit 4 & 5）'}</span>
            </button>
          )}
        </div>
      </section>

      {loading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            正在讀取本機儲存的單字組…
          </p>
        </div>
      ) : wordSets.length === 0 && wordGroups.length === 0 ? (
        <section className="card stack-md" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="mode-card-icon fill" style={{ width: 58, height: 58 }}>
              <FolderPlus size={28} />
            </div>
          </div>
          <div className="stack-sm">
            <h2 className="section-title">還沒有儲存任何單字組</h2>
            <p className="muted" style={{ margin: 0, maxWidth: 460, marginInline: 'auto' }}>
              點擊「匯入或建立單字組」，即可上傳 UTF-8 文字檔（.txt）、手機拍照辨識單欄英文單字表，或匯入別人分享的單字組／群組檔。
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
        <>
          {/* 群組管理區塊 */}
          <section className="stack-md">
            <div className="row-between">
              <div className="row">
                <h2 className="section-title">單字組群組</h2>
                <span className="badge badge-primary">{wordGroups.length} 個群組</span>
              </div>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => setEditingGroupModal({ open: true, group: null })}
              >
                <FolderPlus size={15} />
                <span>新增群組</span>
              </button>
            </div>

            {wordGroups.length === 0 ? (
              <div className="card-subtle row-between">
                <span className="muted" style={{ fontSize: '0.88rem' }}>
                  可把多個相關課次（例如 Flyer Unit 1～4）編成同一個群組，方便分類檢視與一次分享整組給別人。
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditingGroupModal({ open: true, group: null })}
                >
                  <FolderPlus size={15} />
                  <span>建立第一個群組</span>
                </button>
              </div>
            ) : (
              <div className="group-grid">
                {wordGroups.map((group) => {
                  const memberSets = getGroupSets(group);
                  const totalWords = memberSets.reduce((sum, s) => sum + s.entries.length, 0);
                  const isSelected = selectedGroupFilter === group.id;

                  return (
                    <article
                      key={group.id}
                      className={`group-card ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="stack-sm">
                        <div className="row-between" style={{ alignItems: 'flex-start' }}>
                          <div className="row" style={{ alignItems: 'center' }}>
                            <FolderOpen
                              size={18}
                              style={{ color: 'var(--color-primary)', flexShrink: 0 }}
                            />
                            <h3 className="set-card-title" style={{ fontSize: '1.05rem' }}>
                              {group.name}
                            </h3>
                          </div>
                          <span className="badge badge-neutral">
                            {memberSets.length} 課次 · {totalWords} 詞
                          </span>
                        </div>

                        {group.description ? (
                          <p className="field-hint" style={{ margin: 0 }}>
                            {group.description}
                          </p>
                        ) : null}

                        {memberSets.length > 0 ? (
                          <div className="set-card-preview" style={{ marginTop: 0 }}>
                            {memberSets.slice(0, 4).map((s) => (
                              <span key={s.id} className="word-chip">
                                {s.name}
                              </span>
                            ))}
                            {memberSets.length > 4 ? (
                              <span className="word-chip">+{memberSets.length - 4}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="field-hint">尚未加入單字組，點「編輯」加入課次</span>
                        )}
                      </div>

                      <div
                        className="row-wrap"
                        style={{
                          justifyContent: 'space-between',
                          paddingTop: '0.5rem',
                          borderTop: '1px solid var(--color-border)',
                        }}
                      >
                        <button
                          type="button"
                          className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-soft'}`}
                          onClick={() =>
                            setSelectedGroupFilter(isSelected ? 'all' : group.id)
                          }
                        >
                          <span>{isSelected ? '顯示全部' : '只看此群組'}</span>
                        </button>

                        <div className="row" style={{ gap: '0.25rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingGroupModal({ open: true, group })}
                          >
                            <Edit3 size={14} />
                            <span>編輯</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={memberSets.length === 0}
                            onClick={() => setSharingGroup(group)}
                          >
                            <Share2 size={14} />
                            <span>分享群組</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* 單字組清單區塊 */}
          <section className="stack-md">
            <div className="row-between">
              <div className="row-wrap">
                <h2 className="section-title">
                  {activeGroup ? `群組：${activeGroup.name}` : '已儲存的單字組'}
                </h2>
                <span className="badge badge-primary">{filteredSets.length} 組</span>
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

            {wordGroups.length > 0 ? (
              <div className="filter-pills" role="tablist" aria-label="依群組篩選單字組">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedGroupFilter === 'all'}
                  className={`filter-pill ${selectedGroupFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedGroupFilter('all')}
                >
                  全部課次 ({wordSets.length})
                </button>
                {wordGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedGroupFilter === g.id}
                    className={`filter-pill ${selectedGroupFilter === g.id ? 'active' : ''}`}
                    onClick={() => setSelectedGroupFilter(g.id)}
                  >
                    <FolderOpen size={13} />
                    <span>
                      {g.name} ({getGroupSets(g).length})
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedGroupFilter === 'ungrouped'}
                  className={`filter-pill ${selectedGroupFilter === 'ungrouped' ? 'active' : ''}`}
                  onClick={() => setSelectedGroupFilter('ungrouped')}
                >
                  未歸類 ({wordSets.filter((s) => !groupedSetIds.has(s.id)).length})
                </button>
              </div>
            ) : null}

            {filteredSets.length === 0 ? (
              <div className="card stack-sm">
                <p className="muted" style={{ margin: 0 }}>
                  {search.trim()
                    ? `找不到符合「${search}」的課次或單字。`
                    : activeGroup
                      ? `群組「${activeGroup.name}」目前沒有任何課次，可點擊下方按鈕加入單字組。`
                      : '目前沒有符合此篩選條件的單字組。'}
                </p>
                {activeGroup ? (
                  <div>
                    <button
                      type="button"
                      className="btn btn-soft btn-sm"
                      onClick={() => setEditingGroupModal({ open: true, group: activeGroup })}
                    >
                      <Edit3 size={14} />
                      <span>編輯「{activeGroup.name}」加入單字組</span>
                    </button>
                  </div>
                ) : null}
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

                      <div
                        className="row-between"
                        style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}
                      >
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
              <div
                className="card-subtle row-between"
                style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}
              >
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
        </>
      )}

      {sharingSet ? (
        <ShareSetModal
          wordSet={sharingSet}
          assetsById={assetsById}
          onClose={() => setSharingSet(null)}
        />
      ) : null}

      {editingGroupModal.open ? (
        <GroupEditModal
          group={editingGroupModal.group}
          allWordSets={wordSets}
          onClose={() => setEditingGroupModal({ open: false, group: null })}
          onSaveGroup={onSaveGroup}
          onDeleteGroup={onDeleteGroup}
        />
      ) : null}

      {sharingGroup ? (
        <ShareGroupModal
          group={sharingGroup}
          sets={getGroupSets(sharingGroup)}
          assetsById={assetsById}
          onClose={() => setSharingGroup(null)}
        />
      ) : null}
    </div>
  );
}
